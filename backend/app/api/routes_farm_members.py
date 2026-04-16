from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from app.auth_utils import hash_password
from app.db import get_session
from app.deps import (
    FarmAccess,
    get_current_user,
    get_farm_access,
    require_editor,
    require_owner_or_manager_farm,
)
from app.models import FarmMembership, User

router = APIRouter(prefix="/farms/{farm_id}/members", tags=["members"])


class MemberRead(BaseModel):
    user_id: int
    email: str
    role: str


_MEMBER_ROLE = r"^(manager|viewer|agronomist|livestock|field_worker)$"


class MemberInvite(BaseModel):
    email: EmailStr
    role: str = Field(pattern=_MEMBER_ROLE)


class MemberProvision(BaseModel):
    """Создание учётной записи сотрудника владельцем или менеджером."""

    email: EmailStr
    password: str = Field(min_length=8)
    password_confirm: str = Field(min_length=8)
    role: str = Field(pattern=_MEMBER_ROLE)
    first_name: str = Field(default="", max_length=120)
    last_name: str = Field(default="", max_length=120)
    phone: str | None = Field(default=None, max_length=32)
    niche: str | None = Field(default=None, max_length=200)


@router.get("", response_model=list[MemberRead])
def list_members(
    farm_id: int,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    access: Annotated[FarmAccess, Depends(get_farm_access)],
) -> list[MemberRead]:
    if access.farm.id != farm_id:
        raise HTTPException(status_code=404, detail="Farm not found")
    rows = list(db.exec(select(FarmMembership).where(FarmMembership.farm_id == farm_id)).all())
    out: list[MemberRead] = []
    for m in rows:
        u = db.get(User, m.user_id)
        if u:
            out.append(MemberRead(user_id=u.id, email=u.email, role=m.role))
    owner = db.get(User, access.farm.owner_id)
    if owner and not any(x.user_id == owner.id for x in out):
        out.insert(0, MemberRead(user_id=owner.id, email=owner.email, role="owner"))
    return out


@router.post("", response_model=MemberRead, status_code=status.HTTP_201_CREATED)
def invite_member(
    farm_id: int,
    body: MemberInvite,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    access: Annotated[FarmAccess, Depends(require_editor)],
) -> MemberRead:
    if access.farm.id != farm_id:
        raise HTTPException(status_code=404, detail="Farm not found")
    if access.role not in ("owner", "manager"):
        raise HTTPException(status_code=403, detail="Только владелец или менеджер приглашает")
    target = db.exec(select(User).where(User.email == body.email)).first()
    if target is None:
        raise HTTPException(status_code=404, detail="Пользователь с таким email не найден — сначала регистрация")
    if target.id == access.farm.owner_id:
        raise HTTPException(status_code=400, detail="Владелец уже имеет доступ")
    existing = db.exec(
        select(FarmMembership).where(
            FarmMembership.farm_id == farm_id,
            FarmMembership.user_id == target.id,
        )
    ).first()
    if existing:
        existing.role = body.role
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return MemberRead(user_id=target.id, email=target.email, role=existing.role)
    m = FarmMembership(farm_id=farm_id, user_id=target.id, role=body.role)
    db.add(m)
    db.commit()
    db.refresh(m)
    return MemberRead(user_id=target.id, email=target.email, role=m.role)


@router.post("/provision", response_model=MemberRead, status_code=status.HTTP_201_CREATED)
def provision_member(
    farm_id: int,
    body: MemberProvision,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    access: Annotated[FarmAccess, Depends(require_owner_or_manager_farm)],
) -> MemberRead:
    """Владелец или менеджер: создать пользователя и выдать роль на ферме (или обновить роль существующего)."""
    if access.farm.id != farm_id:
        raise HTTPException(status_code=404, detail="Farm not found")
    if body.password != body.password_confirm:
        raise HTTPException(status_code=400, detail="Пароли не совпадают")
    owner = db.get(User, access.farm.owner_id)
    if owner and body.email.lower() == owner.email.lower():
        raise HTTPException(status_code=400, detail="Это владелец фермы — отдельная учётная запись не нужна")

    target = db.exec(select(User).where(User.email == body.email)).first()
    if target is not None:
        if target.id == access.farm.owner_id:
            raise HTTPException(status_code=400, detail="Владелец уже имеет доступ")
        existing = db.exec(
            select(FarmMembership).where(
                FarmMembership.farm_id == farm_id,
                FarmMembership.user_id == target.id,
            )
        ).first()
        if existing:
            existing.role = body.role
            db.add(existing)
            db.commit()
            db.refresh(existing)
            return MemberRead(user_id=target.id, email=target.email, role=existing.role)
        m = FarmMembership(farm_id=farm_id, user_id=target.id, role=body.role)
        db.add(m)
        db.commit()
        db.refresh(m)
        return MemberRead(user_id=target.id, email=target.email, role=m.role)

    phone = body.phone.strip() if body.phone and body.phone.strip() else None
    nu = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip(),
        phone=phone,
        niche=body.niche.strip() if body.niche and body.niche.strip() else None,
    )
    db.add(nu)
    db.commit()
    db.refresh(nu)
    m = FarmMembership(farm_id=farm_id, user_id=nu.id, role=body.role)
    db.add(m)
    db.commit()
    db.refresh(m)
    return MemberRead(user_id=nu.id, email=nu.email, role=m.role)


@router.delete("/{member_user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    farm_id: int,
    member_user_id: int,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    access: Annotated[FarmAccess, Depends(require_editor)],
) -> None:
    if access.farm.id != farm_id:
        raise HTTPException(status_code=404, detail="Farm not found")
    if member_user_id == access.farm.owner_id:
        raise HTTPException(status_code=400, detail="Нельзя убрать владельца фермы")
    if access.role not in ("owner", "manager"):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    m = db.exec(
        select(FarmMembership).where(
            FarmMembership.farm_id == farm_id,
            FarmMembership.user_id == member_user_id,
        )
    ).first()
    if m is None:
        raise HTTPException(status_code=404, detail="Участник не найден")
    db.delete(m)
    db.commit()
