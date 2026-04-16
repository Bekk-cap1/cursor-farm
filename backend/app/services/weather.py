import httpx

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
# Медленные/нестабильные сети: отдельные лимиты на connect и чтение ответа
HTTP_TIMEOUT = httpx.Timeout(60.0, connect=20.0, read=50.0)


class WeatherFetchError(Exception):
    """Не удалось получить прогноз (сеть, таймаут, HTTP)."""


def fetch_weather(lat: float, lon: float) -> dict:
    """Open-Meteo, без API-ключа. Бросает WeatherFetchError при сбое."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": ["temperature_2m", "relative_humidity_2m", "precipitation", "weather_code"],
        "hourly": ["precipitation_probability", "temperature_2m"],
        "daily": [
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_sum",
            "precipitation_probability_max",
        ],
        "forecast_days": 3,
        "timezone": "auto",
    }
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            r = client.get(OPEN_METEO_URL, params=params)
            r.raise_for_status()
            return r.json()
    except httpx.TimeoutException as e:
        raise WeatherFetchError("timeout") from e
    except httpx.HTTPStatusError as e:
        raise WeatherFetchError(f"http_{e.response.status_code}") from e
    except httpx.RequestError:
        raise WeatherFetchError("network") from e


def weather_summary(data: dict) -> str:
    cur = data.get("current") or {}
    t = cur.get("temperature_2m")
    h = cur.get("relative_humidity_2m")
    p = cur.get("precipitation")
    parts = []
    if t is not None:
        parts.append(f"температура ~{t:.0f}°C")
    if h is not None:
        parts.append(f"влажность воздуха ~{h:.0f}%")
    if p is not None and p > 0:
        parts.append(f"осадки сейчас {p} мм")
    hourly = data.get("hourly") or {}
    probs = hourly.get("precipitation_probability") or []
    if probs:
        mx = max(probs[:24]) if probs else 0
        parts.append(f"макс. вероятность дождя (24ч) ~{mx:.0f}%")
    return "; ".join(parts) if parts else "данные погоды недоступны"


def tomorrow_weather_summary(data: dict) -> str:
    """Следующий календарный день в часовом поясе ответа API (обычно «завтра» локально для точки)."""
    daily = data.get("daily") or {}
    times: list[str] = list(daily.get("time") or [])
    tmax = daily.get("temperature_2m_max") or []
    tmin = daily.get("temperature_2m_min") or []
    prec = daily.get("precipitation_sum") or []
    pmax = daily.get("precipitation_probability_max") or []
    if len(times) < 2 or len(tmax) < 2 or len(tmin) < 2:
        return "срез daily на завтра в ответе Open-Meteo нет — см. блок «Погода» в контексте."
    i = 1
    date = times[i]
    try:
        mx = float(tmax[i])
        mn = float(tmin[i])
        line = f"{date}: днём ~{mx:.0f}°C, ночью ~{mn:.0f}°C"
    except (TypeError, ValueError, IndexError):
        return f"{date}: данные температуры неполные."
    extras: list[str] = []
    if len(prec) > i and prec[i] is not None:
        try:
            v = float(prec[i])
            extras.append(f"осадки за сутки ~{v:.1f} мм")
        except (TypeError, ValueError):
            pass
    if len(pmax) > i and pmax[i] is not None:
        try:
            extras.append(f"макс. вероятность дождя ~{float(pmax[i]):.0f}%")
        except (TypeError, ValueError):
            pass
    if extras:
        line += "; " + "; ".join(extras)
    return line
