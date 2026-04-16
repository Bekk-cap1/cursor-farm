from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from app.auth_utils import decode_token
from app.db import get_session
from app.models import Farm, FarmMembership, User

security = HTTPBearer(auto_error=False)


def get_db(session: Annotated[Session, Depends(get_session)]) -> Session:
    return session


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    sub = decode_token(creds.credentials)
    if sub is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.get(User, int(sub))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


@dataclass
class FarmAccess:
    farm: Farm
    role: str


def farm_role_for_user(db: Session, farm: Farm, user: User) -> str | None:
    if farm.owner_id == user.id:
        return "owner"
    m = db.exec(
        select(FarmMembership).where(
            FarmMembership.farm_id == farm.id,
            FarmMembership.user_id == user.id,
        )
    ).first()
    return m.role if m else None


def get_accessible_farm_ids(db: Session, user: User) -> set[int]:
    ids: set[int] = set()
    for f in db.exec(select(Farm).where(Farm.owner_id == user.id)).all():
        ids.add(f.id)
    for m in db.exec(select(FarmMembership).where(FarmMembership.user_id == user.id)).all():
        ids.add(m.farm_id)
    return ids


def get_farm_or_404(db: Session, user: User, farm_id: int) -> Farm:
    farm = db.get(Farm, farm_id)
    if farm is None or farm_role_for_user(db, farm, user) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found")
    return farm


def get_farm_access(
    farm_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> FarmAccess:
    farm = db.get(Farm, farm_id)
    if farm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found")
    role = farm_role_for_user(db, farm, user)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found")
    return FarmAccess(farm=farm, role=role)


def require_editor(
    access: Annotated[FarmAccess, Depends(get_farm_access)],
) -> FarmAccess:
    if access.role == "viewer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Только просмотр")
    return access


def require_owner_farm(
    access: Annotated[FarmAccess, Depends(get_farm_access)],
) -> FarmAccess:
    if access.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Только владелец фермы")
    return access


def require_owner_or_manager_farm(
    access: Annotated[FarmAccess, Depends(get_farm_access)],
) -> FarmAccess:
    if access.role not in ("owner", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только владелец или менеджер может создавать учётные записи сотрудников",
        )
    return access


def optional_user(
    db: Annotated[Session, Depends(get_db)],
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> User | None:
    if creds is None or creds.scheme.lower() != "bearer":
        return None
    sub = decode_token(creds.credentials)
    if sub is None:
        return None
    return db.get(User, int(sub))
