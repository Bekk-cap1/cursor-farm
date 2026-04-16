from typing import Annotated, Any

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.config import settings
from app.db import get_session
from app.deps import get_current_user, get_farm_or_404
from app.models import User
from app.services import weather as weather_svc

router = APIRouter(prefix="/farms/{farm_id}/weather", tags=["weather"])

_FALLBACK_SUMMARY = (
    "Сервис погоды (Open-Meteo) сейчас не ответил: проверьте интернет, VPN или попробуйте обновить вкладку позже."
)


@router.get("")
def farm_weather(
    farm_id: int,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    farm = get_farm_or_404(db, user, farm_id)
    lat = farm.latitude if farm.latitude is not None else settings.default_farm_lat
    lon = farm.longitude if farm.longitude is not None else settings.default_farm_lon
    try:
        data = weather_svc.fetch_weather(lat, lon)
    except weather_svc.WeatherFetchError:
        return {
            "latitude": lat,
            "longitude": lon,
            "summary_ru": _FALLBACK_SUMMARY,
            "raw": {},
            "available": False,
        }
    return {
        "latitude": lat,
        "longitude": lon,
        "summary_ru": weather_svc.weather_summary(data),
        "raw": data,
        "available": True,
    }
