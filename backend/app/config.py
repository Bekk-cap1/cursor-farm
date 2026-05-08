from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# При `uvicorn` из папки backend cwd = backend; ключи часто лежат в farm-platform/.env — подключаем оба файла.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_FARM_PLATFORM_ROOT = _BACKEND_ROOT.parent
_ENV_FILES = (
    str(_FARM_PLATFORM_ROOT / ".env"),
    str(_BACKEND_ROOT / ".env"),
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILES,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Farm AI Agent API"
    jwt_secret: str = "change-me-in-production-use-long-random"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7

    database_url: str = "sqlite:///./farm.db"

    # Доп. origins для CORS (через запятую), напр. https://yourname.dn.uz
    cors_origins_extra: str = ""

    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"

    # Ключ Google AI Studio / Gemini (начинается с AIza…). Можно задать отдельно или ошибочно положить в OPENAI_API_KEY.
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.0-flash"

    @field_validator("openai_api_key", mode="before")
    @classmethod
    def strip_openai_key(cls, v: object) -> str | None:
        if v is None or v == "":
            return None
        s = str(v).strip()
        if not s:
            return None
        # Cursor/шаблоны часто подставляют OPENAI_API_KEY=crsr_… — не ключ API, иначе блокирует чтение AIza/sk из .env
        if s.startswith("crsr_"):
            return None
        return s

    @field_validator("gemini_api_key", mode="before")
    @classmethod
    def strip_gemini_key(cls, v: object) -> str | None:
        if v is None or v == "":
            return None
        s = str(v).strip()
        if not s:
            return None
        if s.startswith("crsr_"):
            return None
        return s

    default_farm_lat: float = 41.2995
    default_farm_lon: float = 69.2401

    # В демо/разработке вернуть код в JSON и писать в лог; в проде выключить
    sms_debug_return_code: bool = True

    # --- SMTP: код регистрации на email ---
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    email_from: str | None = None
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False

    telegram_bot_token: str | None = None
    telegram_admin_chat_id: str | None = None


settings = Settings()


def openai_configured() -> bool:
    """Ключ задан и похож на ключ OpenAI (sk-…), а не пустая строка."""
    k = settings.openai_api_key
    return bool(k and k.startswith("sk-"))


# OpenAI-совместимый REST к Gemini (тот же SDK openai.ChatCompletion)
GEMINI_OPENAI_COMPAT_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/"


def gemini_key_effective() -> str | None:
    """Ключ Gemini: GEMINI_API_KEY или OPENAI_API_KEY, если он начинается с AIza (частая путаница)."""
    g = settings.gemini_api_key
    if g and g.startswith("AIza"):
        return g
    oa = settings.openai_api_key
    if oa and oa.startswith("AIza"):
        return oa
    return None


def llm_configured() -> bool:
    """Есть рабочий ключ OpenAI (sk-) или Gemini (AIza) для вызовов через OpenAI SDK."""
    return openai_configured() or gemini_key_effective() is not None
