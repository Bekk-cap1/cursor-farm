import html
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import Request

from app.config import settings
from app.models import User

logger = logging.getLogger(__name__)


def telegram_admin_configured() -> bool:
    return bool(settings.telegram_bot_token and settings.telegram_admin_chat_id)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    real_ip = request.headers.get("x-real-ip", "")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


def _safe(value: Any) -> str:
    text = "" if value is None else str(value)
    return html.escape(text[:1800], quote=False)


def _line(label: str, value: Any) -> str:
    clean = _safe(value)
    return f"<b>{label}:</b> {clean if clean else '-'}"


def send_extension_visit_notice(
    *,
    user: User | None,
    request: Request,
    payload: Any,
    farms_count: int | None = None,
) -> bool:
    if not telegram_admin_configured():
        return False

    detected_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    event_type = getattr(payload, "event_type", "popup_open")
    title = "🔐 Farm AI — попытка входа" if event_type == "login_attempt" else "👁 Farm AI — открыл расширение"

    full_name = ""
    created_at = ""
    email = getattr(payload, "email", "") or ""
    if user:
        full_name = " ".join(part for part in (user.first_name, user.last_name) if part).strip()
        created_at = user.created_at.isoformat(sep=" ", timespec="seconds") if user.created_at else ""
        email = user.email

    lines = [
        f"<b>{title}</b>",
        _line("User ID", user.id if user else ""),
        _line("Email", email),
        _line("Name", full_name),
        _line("Phone", user.phone if user else ""),
        _line("Niche", user.niche if user else ""),
        _line("User created", created_at),
        _line("Farms available", farms_count),
        _line("IP", _client_ip(request)),
        _line("User-Agent", request.headers.get("user-agent")),
        _line("Page", getattr(payload, "page_url", "")),
        _line("Referrer", getattr(payload, "referrer", "")),
        _line("Language", getattr(payload, "language", "")),
        _line("Timezone", getattr(payload, "timezone", "")),
        _line("Extension", getattr(payload, "extension_version", "")),
        _line("Detected UTC", detected_at),
    ]
    text = "\n".join(lines)

    try:
        response = httpx.post(
            f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
            json={
                "chat_id": settings.telegram_admin_chat_id,
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
            timeout=5.0,
        )
        response.raise_for_status()
        return True
    except httpx.HTTPError:
        logger.exception("Failed to send Telegram extension login notice")
        return False
