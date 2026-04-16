from __future__ import annotations

from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.auth_utils import hash_password
from app.models import Farm, FarmMembership, FieldZone, HerdGroup, Task, TelemetryReading, User


def ensure_memberships(session: Session) -> None:
    """Для старых БД: у каждой фермы у владельца есть строка membership (owner)."""
    farms = list(session.exec(select(Farm)).all())
    changed = False
    for farm in farms:
        existing = session.exec(
            select(FarmMembership).where(
                FarmMembership.farm_id == farm.id,
                FarmMembership.user_id == farm.owner_id,
            )
        ).first()
        if existing is None:
            session.add(
                FarmMembership(farm_id=farm.id, user_id=farm.owner_id, role="owner"),
            )
            changed = True
    if changed:
        session.commit()


def seed_demo(session: Session) -> None:
    # example.com — валиден для EmailStr; .local резервируется и pydantic/email-validator его режет
    existing = session.exec(select(User).where(User.email == "demo@example.com")).first()
    if existing:
        return

    user = User(
        email="demo@example.com",
        hashed_password=hash_password("demo12345"),
        phone="+998901234567",
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    f1 = Farm(
        owner_id=user.id,
        name="Ферма «Восток»",
        region="Ташкентская область",
        latitude=41.31,
        longitude=69.28,
    )
    f2 = Farm(
        owner_id=user.id,
        name="Ферма «Речная»",
        region="Самаркандская область",
        latitude=39.65,
        longitude=66.96,
    )
    session.add(f1)
    session.add(f2)
    session.commit()
    session.refresh(f1)
    session.refresh(f2)

    session.add(
        FieldZone(
            farm_id=f1.id,
            name="Поле север",
            area_ha=12.5,
            crop_type="пшеница",
            irrigation_type="drip",
            soil_moisture_0_5=2,
            soil_ph=6.4,
            soil_ec_ds_m=1.2,
            soil_temp_c=8.0,
        )
    )
    session.add(
        FieldZone(
            farm_id=f1.id,
            name="Огород",
            area_ha=0.8,
            crop_type="овощи",
            irrigation_type="sprinkler",
            soil_moisture_0_5=3,
            soil_ph=6.6,
            soil_ec_ds_m=1.0,
            soil_temp_c=9.0,
        )
    )
    session.add(
        HerdGroup(
            farm_id=f1.id,
            name="Дойное стадо",
            animal_type="cattle",
            head_count=42,
            feeding_notes="Сено утром, концентрат вечером",
        )
    )

    session.add(
        FieldZone(
            farm_id=f2.id,
            name="Поле юг",
            area_ha=20.0,
            crop_type="кукуруза",
            irrigation_type="drip",
            soil_moisture_0_5=1,
            soil_ph=6.3,
            soil_ec_ds_m=1.4,
            soil_temp_c=7.0,
        )
    )
    session.add(
        HerdGroup(
            farm_id=f2.id,
            name="Молодняк",
            animal_type="cattle",
            head_count=18,
            feeding_notes="Сенаж 2 раза в день",
        )
    )

    now = datetime.utcnow()
    evening = now.replace(hour=18, minute=0, second=0, microsecond=0)
    if evening <= now:
        evening = evening + timedelta(days=1)
    session.add(
        Task(
            farm_id=f1.id,
            title="Полив: поле север (проверить каплю)",
            kind="irrigation",
            status="pending",
            due_at=now + timedelta(hours=3),
            source="agent",
        )
    )
    session.add(
        Task(
            farm_id=f1.id,
            title="Кормление: дойное стадо",
            kind="feeding",
            status="pending",
            due_at=evening,
            source="agent",
        )
    )
    session.add(
        Task(
            farm_id=f2.id,
            title="Осмотр влажности на юге",
            kind="other",
            status="pending",
            due_at=now - timedelta(hours=2),
            source="user",
        )
    )
    session.commit()
    _seed_demo_telemetry_for_demo_zones(session)
    session.commit()


def _seed_demo_telemetry_for_demo_zones(session: Session) -> None:
    """История влажности за 14 дней для демо-полей (ТЗ: данные в БД для графиков)."""
    zones = list(session.exec(select(FieldZone).order_by(FieldZone.id)).all())[:3]
    for z in zones:
        if z.id is None:
            continue
        base = float(z.soil_moisture_0_5 or 2)
        for i in range(14):
            dt = datetime.utcnow() - timedelta(days=13 - i)
            jitter = 0.15 * ((i * 3) % 5)
            val = max(0.0, min(5.0, base - 1.0 + jitter + (i % 3) * 0.2))
            session.add(
                TelemetryReading(
                    zone_id=z.id,
                    metric="soil_moisture_0_5",
                    value=val,
                    source="seed",
                    recorded_at=dt,
                )
            )


def _telemetry_for_zone_if_empty(session: Session, zone: FieldZone) -> None:
    if zone.id is None:
        return
    if session.exec(
        select(TelemetryReading).where(TelemetryReading.zone_id == zone.id).limit(1)
    ).first():
        return
    base = float(zone.soil_moisture_0_5 or 2)
    for i in range(14):
        dt = datetime.utcnow() - timedelta(days=13 - i)
        jitter = 0.15 * ((i * 3) % 5)
        val = max(0.0, min(5.0, base - 1.0 + jitter + (i % 3) * 0.2))
        session.add(
            TelemetryReading(
                zone_id=zone.id,
                metric="soil_moisture_0_5",
                value=val,
                source="seed",
                recorded_at=dt,
            )
        )


def ensure_demo_rich_data(session: Session) -> None:
    """Идемпотентно наполняет демо-аккаунт разнообразными фермами, полями, стадами и задачами."""
    demo = session.exec(select(User).where(User.email == "demo@example.com")).first()
    if not demo:
        return
    if not demo.phone:
        demo.phone = "+998901234567"
        session.add(demo)
        session.commit()
        session.refresh(demo)

    def farm_by_name(name: str) -> Farm | None:
        return session.exec(select(Farm).where(Farm.owner_id == demo.id, Farm.name == name)).first()

    now = datetime.utcnow()

    extra_specs: list[
        tuple[
            str,
            str,
            float,
            float,
            list[tuple[str, float, str, str, int, float, float, float]],
            list[tuple[str, str, int, str]],
            list[tuple[str, str, str, datetime | None]],
        ]
    ] = [
        (
            "Ферма «Предгорье»",
            "Наманганская область",
            40.998,
            71.593,
            [
                ("Виноградник", 4.2, "виноград", "drip", 3, 6.5, 1.1, 10.0),
                ("Яблоневый сад", 6.0, "яблоки", "sprinkler", 2, 6.4, 1.0, 8.0),
                ("Полба юг", 9.0, "ячмень", "flood", 1, 6.2, 1.5, 7.0),
            ],
            [
                ("Стадо овец", "sheep", 120, "Выгул 2 раза, соль"),
                ("Племенные КРС", "cattle", 28, "Сенаж + силос"),
            ],
            [
                ("Обрезка и весенний полив винограда", "irrigation", "pending", now + timedelta(hours=5)),
                ("Вакцинация: племенные КРС", "other", "pending", now + timedelta(days=1)),
                ("Сезонная стрижка овец", "feeding", "done", now - timedelta(days=2)),
                ("Анализ почвы: полба юг", "other", "cancelled", None),
            ],
        ),
    ]

    for name, region, lat, lon, zones_t, herds_t, tasks_t in extra_specs:
        if farm_by_name(name):
            continue
        f = Farm(
            owner_id=demo.id,
            name=name,
            region=region,
            latitude=lat,
            longitude=lon,
        )
        session.add(f)
        session.commit()
        session.refresh(f)
        if f.id is None:
            continue
        for zn, area, crop, irrig, moist, ph, ec, t_c in zones_t:
            z = FieldZone(
                farm_id=f.id,
                name=zn,
                area_ha=area,
                crop_type=crop,
                irrigation_type=irrig,
                soil_moisture_0_5=moist,
                soil_ph=ph,
                soil_ec_ds_m=ec,
                soil_temp_c=t_c,
            )
            session.add(z)
            session.commit()
            session.refresh(z)
            _telemetry_for_zone_if_empty(session, z)
        for hn, atype, heads, notes in herds_t:
            session.add(
                HerdGroup(
                    farm_id=f.id,
                    name=hn,
                    animal_type=atype,
                    head_count=heads,
                    feeding_notes=notes,
                )
            )
        for title, kind, status, due in tasks_t:
            session.add(
                Task(
                    farm_id=f.id,
                    title=title,
                    kind=kind,
                    status=status,
                    due_at=due,
                    source="seed",
                )
            )
        session.commit()

    enrich: list[
        tuple[
            str,
            list[tuple[str, float, str, str, int]],
            list[tuple[str, str, int, str]],
            list[tuple[str, str, str, datetime | None]],
        ]
    ] = [
        (
            "Ферма «Восток»",
            [
                ("Хмелевое поле", 3.0, "хмель", "drip", 2),
                ("Тёплые грядки", 0.4, "рассада", "sprinkler", 3),
            ],
            [("Овцы на фронте", "sheep", 35, "Подсека к весне")],
            [
                ("Контроль капельниц: хмель", "irrigation", "pending", now + timedelta(hours=4)),
                ("Ротация выпаса овец", "feeding", "done", now - timedelta(days=1)),
            ],
        ),
        (
            "Ферма «Речная»",
            [
                ("Коса льна", 4.0, "лён", "drip", 1),
            ],
            [("Молочные козы", "goat", 22, "Козье молоко — план")],
            [
                ("Мониторинг влажности льна", "other", "pending", now + timedelta(hours=6)),
            ],
        ),
    ]

    for fname, zone_rows, herd_rows, task_rows in enrich:
        f = farm_by_name(fname)
        if f is None or f.id is None:
            continue
        existing_z = {
            z.name
            for z in session.exec(select(FieldZone).where(FieldZone.farm_id == f.id)).all()
        }
        for zn, area, crop, irrig, moist in zone_rows:
            if zn in existing_z:
                continue
            z = FieldZone(
                farm_id=f.id,
                name=zn,
                area_ha=area,
                crop_type=crop,
                irrigation_type=irrig,
                soil_moisture_0_5=moist,
                soil_ph=6.4,
                soil_ec_ds_m=1.1,
                soil_temp_c=9.0,
            )
            session.add(z)
            session.commit()
            session.refresh(z)
            _telemetry_for_zone_if_empty(session, z)
        existing_h = {
            h.name for h in session.exec(select(HerdGroup).where(HerdGroup.farm_id == f.id)).all()
        }
        for hn, atype, heads, notes in herd_rows:
            if hn in existing_h:
                continue
            session.add(
                HerdGroup(
                    farm_id=f.id,
                    name=hn,
                    animal_type=atype,
                    head_count=heads,
                    feeding_notes=notes,
                )
            )
        titles = {t.title for t in session.exec(select(Task).where(Task.farm_id == f.id)).all()}
        for title, kind, status, due in task_rows:
            if title in titles:
                continue
            session.add(
                Task(
                    farm_id=f.id,
                    title=title,
                    kind=kind,
                    status=status,
                    due_at=due,
                    source="seed",
                )
            )
        session.commit()
