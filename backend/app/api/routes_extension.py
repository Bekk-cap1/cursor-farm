from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.db import get_session
from app.deps import get_accessible_farm_ids, optional_user
from app.models import User
from app.telegram_notify import send_extension_visit_notice, telegram_admin_configured

router = APIRouter(prefix="/extension", tags=["extension"])


class ExtensionVisitIn(BaseModel):
    source: str = Field(default="extension", max_length=64)
    event_type: str = Field(default="popup_open", max_length=64)
    email: str = Field(default="", max_length=256)
    extension_version: str = Field(default="", max_length=64)
    page_url: str = Field(default="", max_length=2048)
    referrer: str = Field(default="", max_length=2048)
    language: str = Field(default="", max_length=64)
    timezone: str = Field(default="", max_length=128)


@router.post("/visit")
def extension_visit(
    body: ExtensionVisitIn,
    request: Request,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User | None, Depends(optional_user)],
) -> dict[str, bool]:
    farm_ids = get_accessible_farm_ids(db, user) if user else set()
    sent = send_extension_visit_notice(
        user=user,
        request=request,
        payload=body,
        farms_count=len(farm_ids),
    )
    return {"ok": True, "telegram_configured": telegram_admin_configured(), "telegram_sent": sent}
