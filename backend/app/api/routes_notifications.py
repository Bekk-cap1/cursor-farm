from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.deps import get_accessible_farm_ids, get_current_user
from app.metrics import farm_task_metrics
from app.models import Notification, User

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationRead(BaseModel):
    id: int
    title: str
    body: str
    farm_id: int | None
    read_at: datetime | None
    created_at: datetime


@router.get("", response_model=list[NotificationRead])
def list_notifications(
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    limit: int = 30,
) -> list[Notification]:
    rows = list(db.exec(select(Notification).where(Notification.user_id == user.id)).all())
    rows.sort(key=lambda n: n.created_at, reverse=True)
    return rows[:limit]


@router.patch("/{notif_id}/read", response_model=NotificationRead)
def mark_read(
    notif_id: int,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> Notification:
    n = db.get(Notification, notif_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    n.read_at = datetime.utcnow()
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


@router.post("/sync")
def sync_notifications(
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    ids = get_accessible_farm_ids(db, user)
    overdue = sum(farm_task_metrics(db, fid)[0] for fid in ids)
    since = datetime.utcnow() - timedelta(hours=1)
    alln = list(
        db.exec(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.title == "Просроченные задачи",
            )
        ).all()
    )
    recent = [n for n in alln if n.created_at and n.created_at >= since]
    if overdue > 0 and not recent:
        db.add(
            Notification(
                user_id=user.id,
                title="Просроченные задачи",
                body=f"На всех доступных фермах просрочено задач: {overdue}. Откройте дашборд или карточки ферм.",
                farm_id=None,
            )
        )
        db.commit()
    return {"ok": True, "overdue_total": overdue}
