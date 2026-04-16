"""Временное хранилище кодов SMS при регистрации (in-memory, TTL). В проде заменить на SMS-провайдера + Redis/БД."""

from __future__ import annotations

import logging
import secrets
import threading
import time
from typing import TypedDict

logger = logging.getLogger(__name__)

TTL_SECONDS = 600


class PendingEntry(TypedDict):
    hashed_password: str
    phone: str
    code: str
    expires: float


_store: dict[str, PendingEntry] = {}
_lock = threading.Lock()


def _key(email: str) -> str:
    return email.strip().lower()


def put_pending(email: str, hashed_password: str, phone: str) -> str:
    code = f"{secrets.randbelow(900000) + 100000:06d}"
    with _lock:
        _store[_key(email)] = PendingEntry(
            hashed_password=hashed_password,
            phone=phone,
            code=code,
            expires=time.time() + TTL_SECONDS,
        )
    logger.info("SMS (демо): на %s отправлен код %s для регистрации %s", phone, code, email)
    return code


def take_if_valid(email: str, code: str) -> PendingEntry | None:
    """Удаляет и возвращает запись только при верном коде и неистёкшем сроке."""
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
