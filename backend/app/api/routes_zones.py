import random
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.audit_service import log_action
from app.db import get_session
from app.deps import FarmAccess, get_current_user, get_farm_or_404, require_editor
from app.models import FieldZone, User
from app.services.telemetry_service import append_zone_snapshot, list_readings
from app.services.vegetation_proxy_series import (
    build_vegetation_proxy_series,
    disclaimer_en,
    disclaimer_ru,
)

router = APIRouter(prefix="/farms/{farm_id}/zones", tags=["zones"])


class ZoneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    area_ha: float | None = None
    crop_type: str | None = None
    irrigation_type: str = "drip"
    soil_moisture_0_5: int | None = Field(default=None, ge=0, le=5)
    soil_ph: float | None = Field(default=None, ge=0, le=14)
    soil_ec_ds_m: float | None = Field(default=None, ge=0, le=20)
    soil_temp_c: float | None = Field(default=None, ge=-40, le=60)


class ZoneRead(BaseModel):
    id: int
    farm_id: int
    name: str
    area_ha: float | None
    crop_type: str | None
    irrigation_type: str
    soil_moisture_0_5: int | None
    soil_ph: float | None = None
    soil_ec_ds_m: float | None = None
    soil_temp_c: float | None = None


class VegetationProxyPointOut(BaseModel):
    date: str
    value: float = Field(ge=0, le=1)


class ZoneVegetationSeriesOut(BaseModel):
    zone_id: int
    zone_name: str
    points: list[VegetationProxyPointOut]
    disclaimer: str


class TelemetryPointOut(BaseModel):
    recorded_at: str
    value: float
    metric: str
    source: str


class TelemetrySeriesOut(BaseModel):
    zone_id: int
    metric: str
    points: list[TelemetryPointOut]
    count: int


@router.get("/{zone_id}/telemetry", response_model=TelemetrySeriesOut)
def get_zone_telemetry(
    farm_id: int,
    zone_id: int,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    metric: Annotated[str, Query(description="soil_moisture_0_5, soil_ph, soil_ec_ds_m, soil_temp_c")] = "soil_moisture_0_5",
    days: Annotated[int, Query(ge=1, le=365)] = 90,
) -> TelemetrySeriesOut:
    """История показаний по зоне из БД (ТЗ: персистентная телеметрия)."""
    get_farm_or_404(db, user, farm_id)
    z = db.get(FieldZone, zone_id)
    if z is None or z.farm_id != farm_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    allowed = {"soil_moisture_0_5", "soil_ph", "soil_ec_ds_m", "soil_temp_c"}
    if metric not in allowed:
        raise HTTPException(status_code=400, detail=f"metric must be one of {sorted(allowed)}")
    rows = list_readings(db, zone_id=zone_id, metric=metric, days=days)
    pts = [
        TelemetryPointOut(
            recorded_at=r.recorded_at.isoformat(),
            value=r.value,
            metric=r.metric,
            source=r.source,
        )
        for r in rows
    ]
    return TelemetrySeriesOut(zone_id=zone_id, metric=metric, points=pts, count=len(pts))


@router.get("/vegetation-proxy-series", response_model=list[ZoneVegetationSeriesOut])
def list_vegetation_proxy_series(
    farm_id: int,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    days: Annotated[int, Query(ge=7, le=120)] = 30,
    lang: Annotated[str, Query(description="ru или en")] = "ru",
) -> list[ZoneVegetationSeriesOut]:
    """
    Синтетический ряд «вегетации» (NDVI-like 0–1) по дням для всех зон фермы.
    Не спутник: сезонная форма + якорь по текущей влажности зоны.
    """
    get_farm_or_404(db, user, farm_id)
    zones = list(db.exec(select(FieldZone).where(FieldZone.farm_id == farm_id)).all())
    en = (lang or "").lower().startswith("en")
    disc = disclaimer_en() if en else disclaimer_ru()
    out: list[ZoneVegetationSeriesOut] = []
    for z in zones:
        if z.id is None:
            continue
        pts = build_vegetation_proxy_series(
            zone_id=z.id,
            anchor_moisture_0_5=float(z.soil_moisture_0_5) if z.soil_moisture_0_5 is not None else None,
            days=days,
        )
        out.append(
            ZoneVegetationSeriesOut(
                zone_id=z.id,
                zone_name=z.name,
                points=[VegetationProxyPointOut(date=d.isoformat(), value=v) for d, v in pts],
                disclaimer=disc,
            )
        )
    return out


@router.get("", response_model=list[ZoneRead])
def list_zones(
    farm_id: int,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[FieldZone]:
    get_farm_or_404(db, user, farm_id)
    return list(db.exec(select(FieldZone).where(FieldZone.farm_id == farm_id)).all())


@router.post("/sync-readings", response_model=list[ZoneRead])
def sync_zone_readings(
    farm_id: int,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    access: Annotated[FarmAccess, Depends(require_editor)],
) -> list[FieldZone]:
    """Обновить показания влажности по всем зонам фермы (имитация опроса датчиков)."""
    if access.farm.id != farm_id:
        raise HTTPException(status_code=404, detail="Farm not found")
    zones = list(db.exec(select(FieldZone).where(FieldZone.farm_id == farm_id)).all())
    for z in zones:
        z.soil_moisture_0_5 = random.randint(2, 4)
        z.soil_ph = round(random.uniform(6.0, 7.1), 1)
        z.soil_ec_ds_m = round(random.uniform(0.7, 1.9), 1)
        z.soil_temp_c = float(random.randint(6, 14))
        db.add(z)
        if z.id is not None:
            append_zone_snapshot(
                db,
                zone_id=z.id,
                soil_moisture_0_5=z.soil_moisture_0_5,
                soil_ph=z.soil_ph,
                soil_ec_ds_m=z.soil_ec_ds_m,
                soil_temp_c=z.soil_temp_c,
                source="sync_demo",
            )
    if zones:
        log_action(
            db,
            farm_id=farm_id,
            user_id=user.id,
            action="zone.readings_sync",
            entity_type="farm",
            entity_id=farm_id,
            meta={"zones": len(zones)},
        )
        db.commit()
        for z in zones:
            db.refresh(z)
    return zones


@router.post("", response_model=ZoneRead, status_code=status.HTTP_201_CREATED)
def create_zone(
    farm_id: int,
    body: ZoneCreate,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    access: Annotated[FarmAccess, Depends(require_editor)],
) -> FieldZone:
    if access.farm.id != farm_id:
        raise HTTPException(status_code=404, detail="Farm not found")
    z = FieldZone(
        farm_id=farm_id,
        name=body.name.strip(),
        area_ha=body.area_ha,
        crop_type=body.crop_type,
        irrigation_type=body.irrigation_type,
        soil_moisture_0_5=body.soil_moisture_0_5,
        soil_ph=body.soil_ph,
        soil_ec_ds_m=body.soil_ec_ds_m,
        soil_temp_c=body.soil_temp_c,
    )
    db.add(z)
    log_action(db, farm_id=farm_id, user_id=user.id, action="zone.create", entity_type="zone", meta={"name": z.name})
    db.commit()
    db.refresh(z)
    if z.id is not None:
        append_zone_snapshot(
            db,
            zone_id=z.id,
            soil_moisture_0_5=z.soil_moisture_0_5,
            soil_ph=z.soil_ph,
            soil_ec_ds_m=z.soil_ec_ds_m,
            soil_temp_c=z.soil_temp_c,
            source="zone_create",
        )
        db.commit()
    return z


@router.delete("/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_zone(
    farm_id: int,
    zone_id: int,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    access: Annotated[FarmAccess, Depends(require_editor)],
) -> None:
    if access.farm.id != farm_id:
        raise HTTPException(status_code=404, detail="Farm not found")
    z = db.get(FieldZone, zone_id)
    if z is None or z.farm_id != farm_id:
        raise HTTPException(status_code=404, detail="Zone not found")
    log_action(db, farm_id=farm_id, user_id=user.id, action="zone.delete", entity_type="zone", entity_id=zone_id)
    db.delete(z)
    db.commit()
