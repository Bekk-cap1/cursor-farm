"""Код подтверждения регистрации по email (in-memory, TTL 10 мин). В проде — письмо через SMTP + Redis/БД."""

from __future__ import annotations

import logging
import secrets
import threading
import time
from typing import TypedDict

logger = logging.getLogger(__name__)

TTL_SECONDS = 600


class EmailPendingEntry(TypedDict):
    hashed_password: str
    first_name: str
    last_name: str
    niche: str
    phone: str | None
    code: str
    expires: float


_store: dict[str, EmailPendingEntry] = {}
_lock = threading.Lock()


def _key(email: str) -> str:
    return email.strip().lower()


def put_email_pending(
    email: str,
    hashed_password: str,
    *,
    first_name: str,
    last_name: str,
    niche: str,
    phone: str | None,
) -> str:
    code = f"{secrets.randbelow(900000) + 100000:06d}"
    with _lock:
        _store[_key(email)] = EmailPendingEntry(
            hashed_password=hashed_password,
            first_name=first_name.strip(),
            last_name=last_name.strip(),
            niche=niche.strip(),
            phone=phone.strip() if phone and phone.strip() else None,
            code=code,
            expires=time.time() + TTL_SECONDS,
        )
    logger.info("Email (демо): на %s отправлен код %s (действует %s с)", email, code, TTL_SECONDS)
    return code


def take_email_if_valid(email: str, code: str) -> EmailPendingEntry | None:
    k = _key(email)
    c = code.strip()
    with _lock:
        ent = _store.get(k)
        if ent is None:
            return None
        if time.time() > ent["expires"]:
            del _store[k]
            return None
        if ent["code"] != c:
            return None
        del _store[k]
        return ent
