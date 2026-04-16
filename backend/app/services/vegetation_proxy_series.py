"""
Synthetic vegetation / NDVI-like proxy over time (MVP, no satellite).
Anchored by current zone soil_moisture_0_5; smooth seasonal + deterministic noise.
"""

from __future__ import annotations

import hashlib
import math
from datetime import date, timedelta


def _noise_unit(seed: int, i: int) -> float:
    h = hashlib.sha256(f"{seed}:{i}".encode()).digest()
    return int.from_bytes(h[:2], "big") / 65535.0


def build_vegetation_proxy_series(
    *,
    zone_id: int,
    anchor_moisture_0_5: float | None,
    days: int,
) -> list[tuple[date, float]]:
    """Return (date, value_0_1) for each day, oldest first."""
    days = max(7, min(120, int(days)))
    base = (float(anchor_moisture_0_5) if anchor_moisture_0_5 is not None else 2.5) / 5.0
    seed = zone_id * 100_003 + 17
    end = date.today()
    out: list[tuple[date, float]] = []
    for i in range(days):
        d = end - timedelta(days=days - 1 - i)
        doy = d.timetuple().tm_yday
        seasonal = math.sin(2 * math.pi * doy / 365.25) * 0.075
        n = (_noise_unit(seed, i) - 0.5) * 0.06
        # Slight ramp so recent days track anchor a bit more than remote past
        t = i / max(1, days - 1)
        anchor_term = base * (0.35 + 0.45 * t)
        v = 0.1 + anchor_term + 0.22 * base + seasonal + n
        v = max(0.04, min(0.99, v))
        out.append((d, round(v, 4)))
    return out


def disclaimer_ru() -> str:
    return (
        "Синтетический ряд (не спутник Sentinel): форма сезона + привязка к текущей влажности зоны. "
        "Для реального NDVI подключите источник снимков."
    )


def disclaimer_en() -> str:
    return (
        "Synthetic series (not Sentinel NDVI): seasonal shape + anchor from current zone moisture. "
        "Plug a imagery provider for real NDVI."
    )
