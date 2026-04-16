import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.deps import FarmAccess, get_current_user, get_farm_access
from app.models import AuditLog, User

router = APIRouter(prefix="/farms/{farm_id}/audit", tags=["audit"])


class AuditRead(BaseModel):
    id: int
    farm_id: int
    user_id: int
    action: str
    entity_type: str
    entity_id: int | None
    meta: dict[str, Any]
    created_at: str


@router.get("", response_model=list[AuditRead])
def list_audit(
    farm_id: int,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    access: Annotated[FarmAccess, Depends(get_farm_access)],
    limit: int = 40,
) -> list[AuditRead]:
    if access.farm.id != farm_id:
        raise HTTPException(status_code=404, detail="Farm not found")
    rows = list(db.exec(select(AuditLog).where(AuditLog.farm_id == farm_id)).all())
    rows.sort(key=lambda r: r.created_at, reverse=True)
    out: list[AuditRead] = []
    for r in rows[:limit]:
        try:
            meta = json.loads(r.meta_json) if r.meta_json else {}
        except json.JSONDecodeError:
            meta = {}
        out.append(
            AuditRead(
                id=r.id,
                farm_id=r.farm_id,
                user_id=r.user_id,
                action=r.action,
                entity_type=r.entity_type,
                entity_id=r.entity_id,
                meta=meta,
                created_at=r.created_at.isoformat() if r.created_at else "",
            )
        )
    return out
