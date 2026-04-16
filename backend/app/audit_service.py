import json
from typing import Any

from sqlmodel import Session

from app.models import AuditLog


def log_action(
    session: Session,
    *,
    farm_id: int,
    user_id: int,
    action: str,
    entity_type: str = "",
    entity_id: int | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    row = AuditLog(
        farm_id=farm_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        meta_json=json.dumps(meta or {}, ensure_ascii=False),
    )
    session.add(row)
