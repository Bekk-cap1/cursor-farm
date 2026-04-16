from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.audit_service import log_action
from app.db import get_session
from app.deps import FarmAccess, get_current_user, get_farm_or_404, require_editor
from app.models import HerdGroup, User

router = APIRouter(prefix="/farms/{farm_id}/herds", tags=["herds"])


class HerdCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    animal_type: str = "cattle"
    head_count: int = Field(ge=0, default=0)
    feeding_notes: str | None = None


class HerdRead(BaseModel):
    id: int
    farm_id: int
    name: str
    animal_type: str
    head_count: int
    feeding_notes: str | None


@router.get("", response_model=list[HerdRead])
def list_herds(
    farm_id: int,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[HerdGroup]:
    get_farm_or_404(db, user, farm_id)
    return list(db.exec(select(HerdGroup).where(HerdGroup.farm_id == farm_id)).all())


@router.post("", response_model=HerdRead, status_code=status.HTTP_201_CREATED)
def create_herd(
    farm_id: int,
    body: HerdCreate,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    access: Annotated[FarmAccess, Depends(require_editor)],
) -> HerdGroup:
    if access.farm.id != farm_id:
        raise HTTPException(status_code=404, detail="Farm not found")
    h = HerdGroup(
        farm_id=farm_id,
        name=body.name.strip(),
        animal_type=body.animal_type,
        head_count=body.head_count,
        feeding_notes=body.feeding_notes,
    )
    db.add(h)
    log_action(db, farm_id=farm_id, user_id=user.id, action="herd.create", entity_type="herd", meta={"name": h.name})
    db.commit()
    db.refresh(h)
    return h


@router.delete("/{herd_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_herd(
    farm_id: int,
    herd_id: int,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    access: Annotated[FarmAccess, Depends(require_editor)],
) -> None:
    if access.farm.id != farm_id:
        raise HTTPException(status_code=404, detail="Farm not found")
    h = db.get(HerdGroup, herd_id)
    if h is None or h.farm_id != farm_id:
        raise HTTPException(status_code=404, detail="Herd not found")
    log_action(db, farm_id=farm_id, user_id=user.id, action="herd.delete", entity_type="herd", entity_id=herd_id)
    db.delete(h)
    db.commit()
