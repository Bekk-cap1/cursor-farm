"""Append-only телеметрия по зонам (влажность, pH, EC, температура)."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.models import TelemetryReading


def append_reading(
    db: Session,
    *,
    zone_id: int,
    metric: str,
    value: float,
    source: str,
    recorded_at: datetime | None = None,
) -> TelemetryReading:
    r = TelemetryReading(
        zone_id=zone_id,
        metric=metric,
        value=value,
        source=source,
        recorded_at=recorded_at or datetime.utcnow(),
    )
    db.add(r)
    return r


def append_zone_snapshot(
    db: Session,
    *,
    zone_id: int,
    soil_moisture_0_5: int | None,
    soil_ph: float | None,
    soil_ec_ds_m: float | None,
    soil_temp_c: float | None,
    source: str,
) -> None:
    """Записать все переданные метрики одним событием (опрос датчиков / создание зоны)."""
    if soil_moisture_0_5 is not None:
        append_reading(
            db,
            zone_id=zone_id,
            metric="soil_moisture_0_5",
            value=float(soil_moisture_0_5),
            source=source,
        )
    if soil_ph is not None:
        append_reading(db, zone_id=zone_id, metric="soil_ph", value=float(soil_ph), source=source)
    if soil_ec_ds_m is not None:
        append_reading(db, zone_id=zone_id, metric="soil_ec_ds_m", value=float(soil_ec_ds_m), source=source)
    if soil_temp_c is not None:
        append_reading(db, zone_id=zone_id, metric="soil_temp_c", value=float(soil_temp_c), source=source)


def list_readings(
    db: Session,
    *,
    zone_id: int,
    metric: str,
    days: int,
) -> list[TelemetryReading]:
    since = datetime.utcnow() - timedelta(days=max(1, min(365, days)))
    rows = list(
        db.exec(
            select(TelemetryReading)
            .where(
                TelemetryReading.zone_id == zone_id,
                TelemetryReading.metric == metric,
                TelemetryReading.recorded_at >= since,
            )
            .order_by(TelemetryReading.recorded_at.asc())
        ).all()
    )
    return rows
