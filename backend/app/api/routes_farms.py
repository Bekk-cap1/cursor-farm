from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from app.audit_service import log_action
from app.db import get_session
from app.deps import (
    FarmAccess,
    farm_role_for_user,
    get_accessible_farm_ids,
    get_current_user,
    get_farm_or_404,
    require_editor,
    require_owner_farm,
)
from app.metrics import farm_task_metrics
from app.models import AuditLog, Farm, FarmMembership, FieldZone, HerdGroup, Notification, Task, User

router = APIRouter(prefix="/farms", tags=["farms"])


class FarmSummary(BaseModel):
    id: int
    name: str
    region: str
    alerts_count: int = Field(ge=0)
    today_tasks: int = Field(ge=0)
    my_role: str = "owner"
    latitude: float | None = None
    longitude: float | None = None


class FarmCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    region: str = ""
    latitude: float | None = None
    longitude: float | None = None


class FarmRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    region: str
    latitude: float | None
    longitude: float | None
    timezone: str


class FarmUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    region: str | None = None
    latitude: float | None = None
    longitude: float | None = None


def _role_on_farm(db: Session, farm: Farm, user: User) -> str:
    r = farm_role_for_user(db, farm, user)
    return r or "owner"


@router.get("", response_model=list[FarmSummary])
def list_farms(
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[FarmSummary]:
    ids = get_accessible_farm_ids(db, user)
    out: list[FarmSummary] = []
    for fid in sorted(ids):
        f = db.get(Farm, fid)
        if f is None:
            continue
        a, t = farm_task_metrics(db, f.id)
        out.append(
            FarmSummary(
                id=f.id,
                name=f.name,
                region=f.region,
                alerts_count=a,
                today_tasks=t,
                my_role=_role_on_farm(db, f, user),
                latitude=f.latitude,
                longitude=f.longitude,
            )
        )
    return out


@router.post("", response_model=FarmRead, status_code=status.HTTP_201_CREATED)
def create_farm(
    body: FarmCreate,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> FarmRead:
    farm = Farm(
        owner_id=user.id,
        name=body.name.strip(),
        region=body.region.strip(),
        latitude=body.latitude,
        longitude=body.longitude,
    )
    db.add(farm)
    db.commit()
    db.refresh(farm)
    db.add(FarmMembership(farm_id=farm.id, user_id=user.id, role="owner"))
    log_action(db, farm_id=farm.id, user_id=user.id, action="farm.create", entity_type="farm", entity_id=farm.id)
    db.commit()
    db.refresh(farm)
    return FarmRead.model_validate(farm)


@router.get("/{farm_id}", response_model=FarmRead)
def get_farm(
    farm_id: int,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> FarmRead:
    return FarmRead.model_validate(get_farm_or_404(db, user, farm_id))


@router.patch("/{farm_id}", response_model=FarmRead)
def update_farm(
    farm_id: int,
    body: FarmUpdate,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    access: Annotated[FarmAccess, Depends(require_editor)],
) -> FarmRead:
    if access.farm.id != farm_id:
        raise HTTPException(status_code=404, detail="Farm not found")
    farm = access.farm
    if body.name is not None:
        farm.name = body.name.strip()
    if body.region is not None:
        farm.region = body.region.strip()
    if body.latitude is not None:
        farm.latitude = body.latitude
    if body.longitude is not None:
        farm.longitude = body.longitude
    db.add(farm)
    log_action(
        db,
        farm_id=farm.id,
        user_id=user.id,
        action="farm.update",
        entity_type="farm",
        entity_id=farm.id,
        meta={"by_role": access.role},
    )
    db.commit()
    db.refresh(farm)
    return FarmRead.model_validate(farm)


@router.delete("/{farm_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_farm(
    farm_id: int,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    access: Annotated[FarmAccess, Depends(require_owner_farm)],
) -> None:
    if access.farm.id != farm_id:
        raise HTTPException(status_code=404, detail="Farm not found")
    if access.farm.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Удалить может только владелец аккаунта")
    farm_id_val = farm_id
    for model, field in (
        (Task, Task.farm_id),
        (FieldZone, FieldZone.farm_id),
        (HerdGroup, HerdGroup.farm_id),
        (FarmMembership, FarmMembership.farm_id),
        (AuditLog, AuditLog.farm_id),
    ):
        for row in db.exec(select(model).where(field == farm_id_val)).all():
            db.delete(row)
    for n in db.exec(select(Notification).where(Notification.farm_id == farm_id_val)).all():
        db.delete(n)
    db.delete(access.farm)
    db.commit()


@router.get("/{farm_id}/summary")
def farm_summary(
    farm_id: int,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    farm = get_farm_or_404(db, user, farm_id)
    zones = list(db.exec(select(FieldZone).where(FieldZone.farm_id == farm_id)).all())
    herds = list(db.exec(select(HerdGroup).where(HerdGroup.farm_id == farm_id)).all())
    overdue, today_n = farm_task_metrics(db, farm_id)
    pending = list(
        db.exec(select(Task).where(Task.farm_id == farm_id, Task.status == "pending")).all()
    )
    irr = [t for t in pending if t.kind == "irrigation" and t.due_at is not None]
    feed = [t for t in pending if t.kind == "feeding" and t.due_at is not None]
    next_irr = min(irr, key=lambda t: t.due_at) if irr else None
    next_feed = min(feed, key=lambda t: t.due_at) if feed else None
    return {
        "farm_id": farm_id,
        "name": farm.name,
        "my_role": _role_on_farm(db, farm, user),
        "zones_count": len(zones),
        "herds_count": len(herds),
        "alerts_overdue": overdue,
        "tasks_today": today_n,
        "irrigation": {
            "next_task": next_irr.title if next_irr else None,
            "next_due": next_irr.due_at.isoformat() if next_irr and next_irr.due_at else None,
        },
        "herd": {
            "groups": len(herds),
            "next_feeding_task": next_feed.title if next_feed else None,
            "next_due": next_feed.due_at.isoformat() if next_feed and next_feed.due_at else None,
        },
    }
