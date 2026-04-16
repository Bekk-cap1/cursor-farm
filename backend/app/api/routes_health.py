from fastapi import APIRouter

from app.config import gemini_key_effective, openai_configured, settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """openai: configured | missing | invalid_key_format | unused (LLM через Gemini). llm: openai | gemini | off."""
    if openai_configured():
        openai_status = "configured"
    elif gemini_key_effective():
        # LLM уже через Gemini: значение в OPENAI_API_KEY (например AIza…) не ошибка формата для OpenAI.com
        openai_status = "unused"
    elif settings.openai_api_key:
        openai_status = "invalid_key_format"
    else:
        openai_status = "missing"
    if openai_configured():
        llm_status = "openai"
    elif gemini_key_effective():
        llm_status = "gemini"
    else:
        llm_status = "off"
    return {"status": "ok", "openai": openai_status, "llm": llm_status}
