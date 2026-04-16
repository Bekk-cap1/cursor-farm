"""
Rule-based field moisture signals (MVP stand-in for Sentinel + agronomy rules).
Uses only zone soil_moisture_0_5 — no duplicate Field model; NDVI/satellite can plug in later.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass

from app.models import FieldZone


@dataclass(frozen=True)
class StressSignal:
    code: str
    severity: str  # critical | warning | info
    message: str


def _en(lang: str) -> bool:
    return (lang or "").lower().startswith("en")


def build_stress_signals(zones: list[FieldZone], *, lang: str) -> list[StressSignal]:
    """Derive drought / overwater / patchy moisture hints from zone readings."""
    en = _en(lang)
    vals: list[tuple[FieldZone, float]] = []
    for z in zones:
        if z.soil_moisture_0_5 is None:
            continue
        vals.append((z, float(z.soil_moisture_0_5)))
    if not vals:
        return []

    numbers = [m for _, m in vals]
    avg = sum(numbers) / len(numbers)
    mn, mx = min(numbers), max(numbers)
    std = statistics.stdev(numbers) if len(numbers) >= 2 else 0.0

    out: list[StressSignal] = []

    # Drought / water stress
    if mn <= 1.0:
        out.append(
            StressSignal(
                code="drought_risk",
                severity="critical",
                message=(
                    "At least one field zone reads very dry (1/5 or below). Check irrigation and sensors."
                    if en
                    else "Есть зона с очень сухой почвой (1/5 или ниже). Проверьте полив и датчики."
                ),
            )
        )
    elif avg < 1.6:
        out.append(
            StressSignal(
                code="drought_risk",
                severity="warning",
                message=(
                    f"Average soil moisture is low ({avg:.1f}/5) — possible drought stress."
                    if en
                    else f"Средняя влажность низкая ({avg:.1f}/5) — риск засухи по полям."
                ),
            )
        )
    elif avg < 2.0:
        out.append(
            StressSignal(
                code="drought_risk",
                severity="info",
                message=(
                    f"Moisture slightly below comfort ({avg:.1f}/5). Plan irrigation if weather is dry."
                    if en
                    else f"Влажность чуть ниже комфорта ({avg:.1f}/5). Учтите полив при сухой погоде."
                ),
            )
        )

    # Overwatering
    if mx >= 5 or avg > 4.2:
        out.append(
            StressSignal(
                code="overwater_risk",
                severity="critical" if mx >= 5 or avg > 4.6 else "warning",
                message=(
                    "Very wet readings — risk of overwatering, leaching, or sensor fault."
                    if en
                    else "Очень высокая влажность — риск переувлажнения, вымывания удобрений или сбоя датчика."
                ),
            )
        )
    elif avg > 3.85:
        out.append(
            StressSignal(
                code="overwater_risk",
                severity="warning",
                message=(
                    f"Average moisture is high ({avg:.1f}/5). Ease irrigation if rain is expected."
                    if en
                    else f"Средняя влажность высокая ({avg:.1f}/5). Смягчите полив при ожидании осадков."
                ),
            )
        )

    # Spatial unevenness (proxy for “problem patches” without raster NDVI)
    if len(numbers) >= 2 and std > 1.12 and (mx - mn) >= 2:
        out.append(
            StressSignal(
                code="patchy_moisture",
                severity="warning",
                message=(
                    f"Moisture varies a lot between zones (spread about {mx - mn:.0f} on 0–5). Check emitters / zones."
                    if en
                    else f"Сильный разброс влажности между зонами (около {mx - mn:.0f} по шкале 0–5). Проверьте зоны полива."
                ),
            )
        )

    # Positive signal when comfortable and even
    if (
        not out
        and len(numbers) >= 2
        and 2.0 <= avg <= 3.6
        and std <= 0.95
        and (mx - mn) <= 1.5
    ):
        out.append(
            StressSignal(
                code="balanced",
                severity="info",
                message=(
                    "Moisture looks even and in a comfortable band — keep current irrigation rhythm."
                    if en
                    else "Влажность по зонам ровная и в комфортном диапазоне — можно держать текущий режим полива."
                ),
            )
        )

    return out
