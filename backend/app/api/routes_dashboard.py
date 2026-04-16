from datetime import datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.audit_service import log_action
from app.db import get_session
from app.deps import farm_role_for_user, get_accessible_farm_ids, get_current_user, get_farm_or_404
from app.metrics import farm_task_metrics
from app.models import FieldZone, HerdGroup, Farm, Task, User
from app.config import llm_configured
from app.services.agent_runner import (
    build_dashboard_context,
    farm_context_block,
    run_openai_dashboard_narrative,
    run_rule_agent,
)
from app.services.field_stress import build_stress_signals

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class FarmKpi(BaseModel):
    id: int
    name: str
    overdue: int
    today: int


class RecentTaskOut(BaseModel):
    id: int
    farm_id: int
    title: str
    kind: str
    status: str
    due_at: str | None


class DashboardSummary(BaseModel):
    farms_count: int
    overdue_total: int
    today_tasks_total: int
    zones_total: int
    herds_total: int
    farms: list[FarmKpi]
    recent_tasks: list[RecentTaskOut]


class RecItemOut(BaseModel):
    id: str
    priority: str = Field(pattern="^(high|medium|low)$")


class DemoAiDataOut(BaseModel):
    """Ответ после загрузки демо-набора для AI-аналитики (как в seed.py)."""

    farm_id: int
    skipped: bool
    zones_added: int
    herds_added: int
    tasks_added: int


class ActivitySuggestionOut(BaseModel):
    """Предложение создать задачу (активность) по результатам анализа."""

    key: str = Field(min_length=1, max_length=120)
    farm_id: int
    farm_name: str = Field(max_length=300)
    title: str = Field(max_length=500)
    kind: str = Field(pattern="^(irrigation|feeding|other)$")
    description: str = Field(max_length=2000)
    severity: str = Field(pattern="^(critical|warning|info)$")


StressCode = Literal["drought_risk", "overwater_risk", "patchy_moisture", "balanced"]


class StressSignalOut(BaseModel):
    """Правила по влажности зон (MVP без спутника); позже можно связать с NDVI."""

    code: StressCode
    severity: str = Field(pattern="^(critical|warning|info)$")
    message: str = Field(max_length=2000)


class DashboardAnalyzeOut(BaseModel):
    """Аналитика дашборда по данным БД + краткий текст правил ИИ."""

    scans: int
    data_quality: float
    crop_condition: float
    animal_health: float
    water_supply: float
    devices_total: int
    insight_critical: str | None
    insight_warning: str | None
    insight_info: str | None
    narrative: str
    recommendations: list[RecItemOut]
    activity_suggestions: list[ActivitySuggestionOut] = Field(default_factory=list)
    scan_caption: str = ""
    stress_signals: list[StressSignalOut] = Field(default_factory=list)


def _pending_tasks_count(db: Session, farm_ids: set[int]) -> int:
    n = 0
    for fid in farm_ids:
        tasks = list(db.exec(select(Task).where(Task.farm_id == fid)).all())
        n += sum(1 for t in tasks if t.status == "pending")
    return n


def _avg_soil_moisture(db: Session, farm_ids: set[int]) -> float | None:
    vals: list[float] = []
    for fid in farm_ids:
        zones = list(db.exec(select(FieldZone).where(FieldZone.farm_id == fid)).all())
        for z in zones:
            if z.soil_moisture_0_5 is not None:
                vals.append(float(z.soil_moisture_0_5))
    if not vals:
        return None
    return sum(vals) / len(vals)


def _collect_zones(db: Session, farm_ids: set[int]) -> list[FieldZone]:
    out: list[FieldZone] = []
    for fid in farm_ids:
        out.extend(list(db.exec(select(FieldZone).where(FieldZone.farm_id == fid)).all()))
    return out


def _stress_signal_outs(zones: list[FieldZone], *, lang: str) -> list[StressSignalOut]:
    return [
        StressSignalOut(code=s.code, severity=s.severity, message=s.message)
        for s in build_stress_signals(zones, lang=lang)
    ]


def _scan_caption(
    lang: str,
    farms_n: int,
    zones_n: int,
    herds_n: int,
    devices_n: int,
) -> str:
    if lang == "en":
        return (
            f"Scan: {farms_n} farm(s), {zones_n} field(s), {herds_n} herd(s), "
            f"{devices_n} device point(s)."
        )
    return (
        f"Сканирование: {farms_n} ферм, {zones_n} полей, {herds_n} стад, "
        f"{devices_n} точек учёта устройств."
    )


def _build_activity_suggestions(
    db: Session,
    ids: set[int],
    *,
    lang: str,
    max_items: int = 8,
) -> list[ActivitySuggestionOut]:
    """Карточки «создать активность» — задачи с привязкой к ферме."""
    rows: list[tuple[int, str, int, int, int, int, float | None, float | None]] = []
    for fid in sorted(ids):
        f = db.get(Farm, fid)
        if f is None:
            continue
        overdue, today_n = farm_task_metrics(db, fid)
        zones = list(db.exec(select(FieldZone).where(FieldZone.farm_id == fid)).all())
        herds = list(db.exec(select(HerdGroup).where(HerdGroup.farm_id == fid)).all())
        moist_vals = [float(z.soil_moisture_0_5) for z in zones if z.soil_moisture_0_5 is not None]
        avg_m = sum(moist_vals) / len(moist_vals) if moist_vals else None
        max_m = max(moist_vals) if moist_vals else None
        rows.append((fid, f.name, overdue, today_n, len(zones), len(herds), avg_m, max_m))
    rows.sort(key=lambda x: (-x[2], x[1]))

    out: list[ActivitySuggestionOut] = []
    en = lang.lower().startswith("en")

    def push(item: ActivitySuggestionOut) -> None:
        if len(out) >= max_items:
            return
        if any(x.key == item.key for x in out):
            return
        out.append(item)

    for fid, name, overdue, _today_n, zn, hn, avg_m, _max_m in rows:
        if overdue > 0:
            push(
                ActivitySuggestionOut(
                    key=f"overdue_{fid}",
                    farm_id=fid,
                    farm_name=name,
                    title="Clear overdue tasks" if en else "Разобрать просроченные задачи",
                    kind="other",
                    description=(
                        f'Farm "{name}": {overdue} overdue task(s). Review and reschedule.'
                        if en
                        else f"Просрочено задач: {overdue}. Ферма: {name}. Проверьте список задач."
                    ),
                    severity="critical",
                )
            )

    for fid, name, _o, _t, zn, hn, avg_m, max_m in rows:
        if avg_m is not None and avg_m < 1.8:
            push(
                ActivitySuggestionOut(
                    key=f"moisture_{fid}",
                    farm_id=fid,
                    farm_name=name,
                    title="Irrigation check" if en else "Полив и контроль влажности",
                    kind="irrigation",
                    description=(
                        f'Average soil moisture is low ({avg_m:.1f} on 0–5 scale) on "{name}".'
                        if en
                        else f"Ферма: {name}. Средняя влажность почвы по полям низкая ({avg_m:.1f} по шкале 0–5)."
                    ),
                    severity="warning",
                )
            )

    for fid, name, _o, _t, zn, hn, avg_m, max_m in rows:
        if avg_m is not None and max_m is not None and (max_m >= 5 or avg_m > 3.9):
            push(
                ActivitySuggestionOut(
                    key=f"overwater_{fid}",
                    farm_id=fid,
                    farm_name=name,
                    title="Reduce irrigation / check drainage" if en else "Снизить полив / дренаж",
                    kind="irrigation",
                    description=(
                        f'High soil moisture on "{name}" (avg {avg_m:.1f}/5, max {max_m:.0f}/5). '
                        f"Ease irrigation or verify sensors."
                        if en
                        else f"Ферма: {name}. Высокая влажность (средн. {avg_m:.1f}/5, макс. {max_m:.0f}/5). "
                        f"Смягчите полив или проверьте датчики."
                    ),
                    severity="warning" if avg_m <= 4.5 else "critical",
                )
            )

    for fid, name, _o, _t, zn, hn, _avg_m, _max_m in rows:
        if hn > 0:
            push(
                ActivitySuggestionOut(
                    key=f"feeding_{fid}",
                    farm_id=fid,
                    farm_name=name,
                    title="Herd feeding review" if en else "Контроль кормления стада",
                    kind="feeding",
                    description=(
                        f"Schedule feeding / vet follow-up for herds on «{name}»."
                        if en
                        else f"Ферма: {name}. Проверьте график кормления и состояние стада."
                    ),
                    severity="warning",
                )
            )

    for fid, name, _o, _t, zn, _hn, _avg_m, _max_m in rows:
        if zn > 0:
            push(
                ActivitySuggestionOut(
                    key=f"harvest_{fid}",
                    farm_id=fid,
                    farm_name=name,
                    title="Fields & harvest check" if en else "Поля и сроки уборки",
                    kind="other",
                    description=(
                        f"Review crop status and harvest windows for «{name}»."
                        if en
                        else f"Ферма: {name}. Проверьте состояние культур и сроки работ на полях."
                    ),
                    severity="info",
                )
            )

    for fid, name, _o, _t, zn, hn, _avg_m, _max_m in rows:
        if zn + hn > 0:
            push(
                ActivitySuggestionOut(
                    key=f"devices_{fid}",
                    farm_id=fid,
                    farm_name=name,
                    title="Sensor & device check" if en else "Проверка связи с полями/стадами",
                    kind="other",
                    description=(
                        f"Verify readings sync for zones and herds on «{name}»."
                        if en
                        else f"Ферма: {name}. Убедитесь, что показания по зонам и стадам актуальны."
                    ),
                    severity="info",
                )
            )

    return out[:max_items]


DEMO_AI_ZONE_A = "[Демо AI] Поле север"
DEMO_AI_ZONE_B = "[Демо AI] Огород"
DEMO_AI_HERD = "[Демо AI] Дойное стадо"


@router.post("/demo-ai-data", response_model=DemoAiDataOut)
def dashboard_demo_ai_data(
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    farm_id: Annotated[int | None, Query(description="Ферма; по умолчанию первая доступная")] = None,
) -> DemoAiDataOut:
    """Добавить на ферму демо-поля, стадо и задачи (один раз), чтобы наполнить AI-аналитику данными."""
    ids = get_accessible_farm_ids(db, user)
    if not ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нет доступных ферм — сначала создайте ферму.",
        )
    target_id = farm_id if farm_id is not None and farm_id in ids else min(ids)
    farm = get_farm_or_404(db, user, target_id)
    role = farm_role_for_user(db, farm, user)
    if role is None or role == "viewer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")

    existing = db.exec(
        select(FieldZone).where(FieldZone.farm_id == target_id, FieldZone.name == DEMO_AI_ZONE_A)
    ).first()
    if existing is not None:
        return DemoAiDataOut(
            farm_id=target_id,
            skipped=True,
            zones_added=0,
            herds_added=0,
            tasks_added=0,
        )

    zones_added = 0
    herds_added = 0
    tasks_added = 0

    z1 = FieldZone(
        farm_id=target_id,
        name=DEMO_AI_ZONE_A,
        area_ha=12.5,
        crop_type="пшеница",
        irrigation_type="drip",
        soil_moisture_0_5=2,
        soil_ph=6.4,
        soil_ec_ds_m=1.2,
        soil_temp_c=8.0,
    )
    z2 = FieldZone(
        farm_id=target_id,
        name=DEMO_AI_ZONE_B,
        area_ha=0.8,
        crop_type="овощи",
        irrigation_type="sprinkler",
        soil_moisture_0_5=3,
        soil_ph=6.6,
        soil_ec_ds_m=1.0,
        soil_temp_c=9.0,
    )
    db.add(z1)
    db.add(z2)
    zones_added = 2

    h = HerdGroup(
        farm_id=target_id,
        name=DEMO_AI_HERD,
        animal_type="cattle",
        head_count=42,
        feeding_notes="Сено утром, концентрат вечером",
    )
    db.add(h)
    herds_added = 1

    now = datetime.utcnow()
    evening = now.replace(hour=18, minute=0, second=0, microsecond=0)
    if evening <= now:
        evening = evening + timedelta(days=1)
    t1 = Task(
        farm_id=target_id,
        title="[Демо AI] Полив: проверить каплю",
        kind="irrigation",
        status="pending",
        due_at=now + timedelta(hours=3),
        source="user",
    )
    t2 = Task(
        farm_id=target_id,
        title="[Демо AI] Кормление стада",
        kind="feeding",
        status="pending",
        due_at=evening,
        source="user",
    )
    t3 = Task(
        farm_id=target_id,
        title="[Демо AI] Осмотр влажности (просрочено)",
        kind="other",
        status="pending",
        due_at=now - timedelta(hours=2),
        source="user",
    )
    db.add(t1)
    db.add(t2)
    db.add(t3)
    tasks_added = 3

    log_action(
        db,
        farm_id=target_id,
        user_id=user.id,
        action="demo_ai_data.load",
        entity_type="farm",
        entity_id=target_id,
        meta={"zones": zones_added, "herds": herds_added, "tasks": tasks_added},
    )
    db.commit()

    return DemoAiDataOut(
        farm_id=target_id,
        skipped=False,
        zones_added=zones_added,
        herds_added=herds_added,
        tasks_added=tasks_added,
    )


@router.post("/analyze", response_model=DashboardAnalyzeOut)
def dashboard_analyze(
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    lang: Annotated[str, Query(description="Подписи: ru или en")] = "ru",
) -> DashboardAnalyzeOut:
    ids = get_accessible_farm_ids(db, user)
    overdue_total = 0
    today_total = 0
    zones_total = 0
    herds_total = 0
    for fid in ids:
        a, td = farm_task_metrics(db, fid)
        overdue_total += a
        today_total += td
        zones_total += len(list(db.exec(select(FieldZone).where(FieldZone.farm_id == fid)).all()))
        herds_total += len(list(db.exec(select(HerdGroup).where(HerdGroup.farm_id == fid)).all()))

    pending_n = _pending_tasks_count(db, ids)
    scans = zones_total + herds_total + min(pending_n, 50)
    avg_m = _avg_soil_moisture(db, ids)

    dq = 0.35
    if len(ids):
        dq += min(0.25, 0.06 * len(ids))
    dq += min(0.2, 0.015 * zones_total)
    dq += min(0.15, 0.04 * herds_total)
    data_quality = round(min(0.99, dq), 2)

    if avg_m is not None:
        crop_condition = round(min(0.99, max(0.15, 0.25 + (avg_m / 5) * 0.72)), 2)
        water_supply = round(min(0.99, max(0.2, 0.3 + (avg_m / 5) * 0.65)), 2)
    else:
        crop_condition = 0.42 if zones_total else 0.35
        water_supply = 0.45

    animal_health = round(min(0.99, max(0.12, 0.92 - 0.06 * overdue_total)), 2)

    devices_total = zones_total + herds_total

    insight_critical: str | None = None
    if overdue_total > 0:
        insight_critical = (
            f"Просроченных задач: {overdue_total}. Проверьте задачи и стадо."
        )
    insight_warning: str | None = None
    if today_total > 0:
        insight_warning = f"На сегодня запланировано задач: {today_total}."
    low_moisture = avg_m is not None and avg_m < 1.8
    if low_moisture and insight_warning is None:
        insight_warning = "Средняя влажность почвы по полям низкая — проверьте полив."
    elif low_moisture and insight_warning is not None:
        insight_warning = insight_warning + " Низкая влажность почвы по зонам."

    insight_info = (
        "Откройте вкладку ИИ-агента на ферме для персональных рекомендаций и создания задач."
    )

    ctx = build_dashboard_context(db, user)
    dash_prompt = (
        "Дай краткую аналитическую сводку для главного экрана: риски, полив, стадо, что сделать в первую очередь. "
        "5–8 предложений, без воды."
    )
    if llm_configured():
        try:
            narrative = run_openai_dashboard_narrative(ctx, dash_prompt)
        except Exception:  # noqa: BLE001
            narrative = run_rule_agent(ctx, dash_prompt)
    else:
        narrative = run_rule_agent(ctx, dash_prompt)

    recs: list[RecItemOut] = []
    if overdue_total > 0 or (avg_m is not None and avg_m < 2.0):
        recs.append(RecItemOut(id="vet", priority="high"))
    if today_total > 0 or zones_total > 0:
        recs.append(RecItemOut(id="harvest", priority="medium"))
    recs.append(RecItemOut(id="devices", priority="low"))
    # de-dup by id keeping first
    seen: set[str] = set()
    uniq: list[RecItemOut] = []
    for r in recs:
        if r.id not in seen:
            seen.add(r.id)
            uniq.append(r)

    scan_caption = _scan_caption(lang, len(ids), zones_total, herds_total, devices_total)
    activity_suggestions = _build_activity_suggestions(db, ids, lang=lang)
    stress_signals = _stress_signal_outs(_collect_zones(db, ids), lang=lang)

    return DashboardAnalyzeOut(
        scans=scans,
        data_quality=data_quality,
        crop_condition=crop_condition,
        animal_health=animal_health,
        water_supply=water_supply,
        devices_total=devices_total,
        insight_critical=insight_critical,
        insight_warning=insight_warning,
        insight_info=insight_info,
        narrative=narrative.strip(),
        recommendations=uniq,
        activity_suggestions=activity_suggestions,
        scan_caption=scan_caption,
        stress_signals=stress_signals,
    )


@router.post("/analyze/farm/{farm_id}", response_model=DashboardAnalyzeOut)
def dashboard_analyze_farm(
    farm_id: int,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    lang: Annotated[str, Query(description="Подписи: ru или en")] = "ru",
) -> DashboardAnalyzeOut:
    """Аналитика только по выбранной ферме; при настроенном LLM (OpenAI sk-… или Gemini AIza…) — текст через модель."""
    farm = get_farm_or_404(db, user, farm_id)
    ids = {farm_id}
    overdue_total = 0
    today_total = 0
    zones_total = 0
    herds_total = 0
    for fid in ids:
        a, td = farm_task_metrics(db, fid)
        overdue_total += a
        today_total += td
        zones_total += len(list(db.exec(select(FieldZone).where(FieldZone.farm_id == fid)).all()))
        herds_total += len(list(db.exec(select(HerdGroup).where(HerdGroup.farm_id == fid)).all()))

    pending_n = _pending_tasks_count(db, ids)
    scans = zones_total + herds_total + min(pending_n, 50)
    avg_m = _avg_soil_moisture(db, ids)

    dq = 0.35 + min(0.2, 0.02 * zones_total) + min(0.15, 0.05 * herds_total)
    data_quality = round(min(0.99, dq), 2)

    if avg_m is not None:
        crop_condition = round(min(0.99, max(0.15, 0.25 + (avg_m / 5) * 0.72)), 2)
        water_supply = round(min(0.99, max(0.2, 0.3 + (avg_m / 5) * 0.65)), 2)
    else:
        crop_condition = 0.42 if zones_total else 0.35
        water_supply = 0.45

    animal_health = round(min(0.99, max(0.12, 0.92 - 0.06 * overdue_total)), 2)
    devices_total = zones_total + herds_total

    insight_critical: str | None = None
    if overdue_total > 0:
        insight_critical = (
            f"Просроченных задач: {overdue_total}. Проверьте задачи и стадо."
        )
    insight_warning: str | None = None
    if today_total > 0:
        insight_warning = f"На сегодня запланировано задач: {today_total}."
    low_moisture = avg_m is not None and avg_m < 1.8
    if low_moisture and insight_warning is None:
        insight_warning = "Влажность почвы по полям низкая — проверьте полив."
    elif low_moisture and insight_warning is not None:
        insight_warning = insight_warning + " Низкая влажность почвы."

    insight_info = (
        "Вкладка «ИИ-агент» на этой странице — диалог, задачи и уведомления по этой ферме."
    )

    ctx = farm_context_block(db, farm)
    farm_prompt = (
        "Дай краткую аналитику по ЭТОЙ ферме: поля, стадо, задачи, полив, погода. 5–8 предложений, конкретно."
    )
    if llm_configured():
        try:
            narrative = run_openai_dashboard_narrative(ctx, farm_prompt)
        except Exception:  # noqa: BLE001
            narrative = run_rule_agent(ctx, farm_prompt)
    else:
        narrative = run_rule_agent(ctx, farm_prompt)

    recs: list[RecItemOut] = []
    if overdue_total > 0 or (avg_m is not None and avg_m < 2.0):
        recs.append(RecItemOut(id="vet", priority="high"))
    if today_total > 0 or zones_total > 0:
        recs.append(RecItemOut(id="harvest", priority="medium"))
    recs.append(RecItemOut(id="devices", priority="low"))
    seen: set[str] = set()
    uniq: list[RecItemOut] = []
    for r in recs:
        if r.id not in seen:
            seen.add(r.id)
            uniq.append(r)

    scan_caption = _scan_caption(lang, 1, zones_total, herds_total, devices_total)
    activity_suggestions = _build_activity_suggestions(db, ids, lang=lang)
    stress_signals = _stress_signal_outs(_collect_zones(db, ids), lang=lang)

    return DashboardAnalyzeOut(
        scans=scans,
        data_quality=data_quality,
        crop_condition=crop_condition,
        animal_health=animal_health,
        water_supply=water_supply,
        devices_total=devices_total,
        insight_critical=insight_critical,
        insight_warning=insight_warning,
        insight_info=insight_info,
        narrative=narrative.strip(),
        recommendations=uniq,
        activity_suggestions=activity_suggestions,
        scan_caption=scan_caption,
        stress_signals=stress_signals,
    )


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> DashboardSummary:
    ids = get_accessible_farm_ids(db, user)
    overdue_total = 0
    today_total = 0
    zones_total = 0
    herds_total = 0
    farms_meta: list[FarmKpi] = []
    for fid in sorted(ids):
        f = db.get(Farm, fid)
        if f is None:
            continue
        a, td = farm_task_metrics(db, fid)
        overdue_total += a
        today_total += td
        zones_total += len(list(db.exec(select(FieldZone).where(FieldZone.farm_id == fid)).all()))
        herds_total += len(list(db.exec(select(HerdGroup).where(HerdGroup.farm_id == fid)).all()))
        farms_meta.append(FarmKpi(id=fid, name=f.name, overdue=a, today=td))

    all_tasks: list[Task] = []
    for fid in ids:
        all_tasks.extend(list(db.exec(select(Task).where(Task.farm_id == fid)).all()))
    all_tasks.sort(key=lambda t: t.created_at, reverse=True)
    recent = [
        RecentTaskOut(
            id=t.id,
            farm_id=t.farm_id,
            title=t.title,
            kind=t.kind,
            status=t.status,
            due_at=t.due_at.isoformat() if t.due_at else None,
        )
        for t in all_tasks[:20]
    ]

    return DashboardSummary(
        farms_count=len(ids),
        overdue_total=overdue_total,
        today_tasks_total=today_total,
        zones_total=zones_total,
        herds_total=herds_total,
        farms=farms_meta,
        recent_tasks=recent,
    )
