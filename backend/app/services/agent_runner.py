from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from openai import OpenAI
from sqlmodel import Session, select

from app.config import (
    GEMINI_OPENAI_COMPAT_BASE,
    gemini_key_effective,
    llm_configured,
    openai_configured,
    settings,
)
from app.metrics import farm_task_metrics
from app.models import Farm, FieldZone, HerdGroup, Notification, Task, User
from app.services import weather as weather_svc

_NOTIF_BODY_MAX = 8000


def _user_message_for_llm_failure(exc: BaseException) -> str:
    """Короткое объяснение без простыни JSON (особенно для 429 Gemini)."""
    t = str(exc)
    if "429" in t or "RESOURCE_EXHAUSTED" in t or "quota" in t.lower() or "Quota exceeded" in t:
        return (
            "Сервис Gemini вернул 429 — превышена квота бесплатного тарифа (лимит запросов или токенов в минуту/день). "
            "Это ограничение Google AI, а не ошибка логики приложения.\n\n"
            "Что сделать: подождать минуту и повторить; в `.env` попробовать `GEMINI_MODEL=gemini-1.5-flash`; "
            "в Google AI Studio проверить квоты и при необходимости включить оплату; либо использовать `OPENAI_API_KEY` "
            "с ключом вида `sk-…` для OpenAI."
        )
    short = t[:480] + ("…" if len(t) > 480 else "")
    return f"Ошибка ИИ ({short})."


def _mentions_weather_question(low: str) -> bool:
    if "погод" in low or "weather" in low or "прогноз" in low:
        return True
    if "завтра" in low and any(
        x in low for x in ("ташкент", "осадк", "дожд", "солн", "ветер", "туман", "жар", "мороз", "градус", "температ")
    ):
        return True
    return False


def _weather_rule_block(session: Session | None, farm: Farm | None, last_user: str) -> str:
    low = last_user.lower()
    if not _mentions_weather_question(low) or session is None or farm is None:
        return ""
    try:
        lat, lon = _farm_coords(farm)
        w = weather_svc.fetch_weather(lat, lon)
        cur = weather_svc.weather_summary(w)
        nxt = weather_svc.tomorrow_weather_summary(w)
        return (
            "\n\nПо запросу про погоду (Open-Meteo по координатам фермы, без платного ИИ):\n"
            f"— сейчас: {cur}\n"
            f"— завтра (следующий день в прогнозе): {nxt}"
        )
    except Exception as e:  # noqa: BLE001
        return f"\n\n(Погода: не удалось запросить Open-Meteo — {e})"


@dataclass
class AgentRunState:
    """Состояние одного запуска агента (уведомления, задачи)."""

    task_created: bool = False
    last_task_title: str = ""
    farmer_notified_via_tool: bool = False
    last_task_notification_id: int | None = None
    tool_trace: list[str] = field(default_factory=list)


def _farm_coords(farm: Farm) -> tuple[float, float]:
    lat = farm.latitude if farm.latitude is not None else settings.default_farm_lat
    lon = farm.longitude if farm.longitude is not None else settings.default_farm_lon
    return lat, lon


def build_dashboard_context(session: Session, user: User) -> str:
    """Агрегированный контекст по всем доступным фермам для сводки дашборда."""
    from app.deps import get_accessible_farm_ids

    ids = sorted(get_accessible_farm_ids(session, user))
    chunks: list[str] = []
    for fid in ids:
        farm = session.get(Farm, fid)
        if farm is not None:
            chunks.append(_context_block(session, farm))
    return "\n\n========\n\n".join(chunks) if chunks else "Нет доступных ферм."


def farm_context_block(session: Session, farm: Farm) -> str:
    """Публичная обёртка: контекст одной фермы для аналитики и агента."""
    return _context_block(session, farm)


def _context_block(session: Session, farm: Farm) -> str:
    zones = list(session.exec(select(FieldZone).where(FieldZone.farm_id == farm.id)).all())
    herds = list(session.exec(select(HerdGroup).where(HerdGroup.farm_id == farm.id)).all())
    tasks = list(
        session.exec(
            select(Task).where(Task.farm_id == farm.id, Task.status == "pending")
        ).all()
    )
    lat, lon = _farm_coords(farm)
    try:
        w = weather_svc.fetch_weather(lat, lon)
        wtext = weather_svc.weather_summary(w)
    except Exception as e:  # noqa: BLE001
        wtext = f"погода недоступна ({e})"

    zlines = [f"- {z.name}: {z.crop_type or 'культура не указана'}, полив {z.irrigation_type}, влажность почвы {z.soil_moisture_0_5 if z.soil_moisture_0_5 is not None else '?'}/5" for z in zones]
    hlines = [f"- {h.name}: {h.head_count} голов, {h.animal_type}; {h.feeding_notes or ''}" for h in herds]
    tlines = [f"- [{t.kind}] {t.title} (до {t.due_at})" if t.due_at else f"- [{t.kind}] {t.title}" for t in tasks[:12]]

    overdue, today_n = farm_task_metrics(session, farm.id)
    return "\n".join(
        [
            f"Ферма: {farm.name} ({farm.region}). Координаты для погоды: {lat:.3f}, {lon:.3f}.",
            f"Погода: {wtext}",
            f"Метрики: просроченных задач {overdue}, на сегодня {today_n}.",
            "Поля:",
            *(zlines or ["- (нет зон)"]),
            "Стада:",
            *(hlines or ["- (нет групп)"]),
            "Активные задачи:",
            *(tlines or ["- (нет)"]),
        ]
    )


def _tool_create_task(
    session: Session,
    farm_id: int,
    user_id: int,
    args: dict[str, Any],
    state: AgentRunState,
) -> str:
    title = str(args.get("title") or "Задача").strip()[:500]
    kind = str(args.get("kind") or "other")
    if kind not in ("irrigation", "feeding", "other"):
        kind = "other"
    desc_raw = args.get("instructions_for_farmer")
    description = (
        str(desc_raw).strip()[:4000]
        if desc_raw is not None and str(desc_raw).strip()
        else (
            "Пошагово выполните работу по названию задачи; при необходимости уточните детали у агронома или ветеринара. "
            "Закупки и продажи — только по вашему решению на реальных площадках."
        )
    )
    t = Task(
        farm_id=farm_id,
        title=title,
        kind=kind,
        status="pending",
        source="agent",
        description=description,
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    state.task_created = True
    state.last_task_title = title
    state.tool_trace.append(f"create_task:{t.id}")
    pre = f"Задача: {title}\nТип: {kind}\n\n"
    body = (pre + (description or "Откройте вкладку «Задачи» на ферме для деталей."))[:_NOTIF_BODY_MAX]
    n = Notification(
        user_id=user_id,
        title="ИИ-агент создал задачу",
        body=body,
        farm_id=farm_id,
    )
    session.add(n)
    session.commit()
    session.refresh(n)
    state.last_task_notification_id = n.id
    return json.dumps({"ok": True, "task_id": t.id, "title": title}, ensure_ascii=False)


def _tool_notify_farmer(
    session: Session,
    farm_id: int,
    user_id: int,
    args: dict[str, Any],
    state: AgentRunState,
) -> str:
    title = str(args.get("title") or "Совет агента").strip()[:200]
    advice = str(args.get("advice") or "").strip()
    if not advice:
        return json.dumps({"ok": False, "error": "advice пустой"}, ensure_ascii=False)
    state.farmer_notified_via_tool = True
    state.tool_trace.append("notify_farmer")
    session.add(
        Notification(
            user_id=user_id,
            title=title,
            body=advice[:_NOTIF_BODY_MAX],
            farm_id=farm_id,
        )
    )
    session.commit()
    return json.dumps({"ok": True}, ensure_ascii=False)


def _tool_list_tasks(session: Session, farm_id: int, state: AgentRunState) -> str:
    state.tool_trace.append("list_tasks")
    tasks = list(session.exec(select(Task).where(Task.farm_id == farm_id)).all())[:30]
    out = [{"id": t.id, "title": t.title, "kind": t.kind, "status": t.status, "due_at": t.due_at.isoformat() if t.due_at else None} for t in tasks]
    return json.dumps(out, ensure_ascii=False)


def run_rule_agent(
    context: str,
    last_user: str,
    *,
    session: Session | None = None,
    farm: Farm | None = None,
) -> str:
    low = last_user.lower()
    wx = _weather_rule_block(session, farm, last_user)
    if wx:
        return (
            "Ответ без нейросети (или после сбоя ИИ). Ниже — погода по данным фермы и полный контекст.\n"
            + wx
            + "\n\n"
            + context
        )
    if any(x in low for x in ("сводк", "что сегодня", "статус", "итог")):
        return (
            "Краткая сводка по контексту ниже.\n\n"
            + context
            + "\n\nРекомендация: проверьте просроченные задачи и полив, если осадков мало и влажность почвы низкая."
        )
    if any(x in low for x in ("полив", "irrigation", "влаж")):
        return (
            "По поливу ориентируйтесь на влажность почвы по зонам и прогноз осадков (см. контекст). "
            "Если вероятность дождя высокая, полив можно сократить или перенести.\n\n"
            + context
        )
    if any(x in low for x in ("корм", "стад", "коров")):
        return (
            "Кормление: смотрите группы стада и заметки по рациону. В жару добавьте воду; в холод — энергию рациона.\n\n"
            + context
        )
    if any(x in low for x in ("куп", "закуп", "цен", "продаж", "урожай", "рынок", "семен", "корм закуп")):
        return (
            "Закупки и продажи: приложение не совершает сделок и не оплачивает товары — только советы.\n"
            "Что сделать: сравнить цены у нескольких поставщиков и элеваторов; проверить качество и документы; "
            "заложить логистику и хранение; фиксировать условия договора.\n\n"
            + context
        )
    if any(x in low for x in ("аналит", "риск", "эту ферм", "конкретно", "первую очередь", "dashboard")):
        if "просрочен" in context:
            return (
                "Аналитика: в данных есть просроченные задачи — закройте их в первую очередь.\n"
                "Полив: сверьте влажность по зонам с прогнозом осадков.\n"
                "Стадо: проверьте кормление и ветеринарные задачи по расписанию.\n\n"
                + context
            )
        return (
            "Приоритеты: ближайшие задачи по сроку; полив при низкой влажности почвы; кормление стада по графику.\n\n"
            + context
        )
    return (
        "Я вижу данные по выбранной ферме. Задайте вопрос точнее (полив, кормление, сводка) или скажите, что сделать.\n\n"
        + context
    )


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": (
                "Создать задачу на ферме. Обязательно заполни instructions_for_farmer: полный пошаговый совет "
                "(что сделать, как, сроки, безопасность). Краткий title для списка задач."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Краткое название для списка задач"},
                    "kind": {"type": "string", "enum": ["irrigation", "feeding", "other"]},
                    "instructions_for_farmer": {
                        "type": "string",
                        "description": (
                            "Развёрнутая инструкция: шаги, объёмы, инструменты, когда проверить результат. "
                            "Если речь о закупках — ориентиры по ценам и площадкам; автопокупки нет."
                        ),
                    },
                },
                "required": ["title", "kind"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "notify_farmer",
            "description": (
                "Отправить полный совет в колокольчик уведомлений приложения (без создания задачи). "
                "Используй для длинных рекомендаций: закупки семян/кормов/техники по выгодной цене (как план), "
                "стратегия продаж урожая, сравнение вариантов. Автооплаты и реальные сделки через приложение недоступны."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Короткий заголовок уведомления"},
                    "advice": {
                        "type": "string",
                        "description": "Полный текст: что, как, сроки, риски, чек-лист",
                    },
                },
                "required": ["title", "advice"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_tasks",
            "description": "Показать задачи фермы.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]


def _openai_sdk_client_and_model() -> tuple[OpenAI, str] | None:
    """OpenAI (sk-…) или Gemini через OpenAI-совместимый endpoint Google."""
    if openai_configured():
        return OpenAI(api_key=settings.openai_api_key), settings.openai_model
    gk = gemini_key_effective()
    if gk:
        return OpenAI(api_key=gk, base_url=GEMINI_OPENAI_COMPAT_BASE), settings.gemini_model
    return None


def run_openai_dashboard_narrative(context: str, user_instruction: str) -> str:
    """Один запрос к Chat Completions для текстовой сводки (дашборд «Анализировать»)."""
    pair = _openai_sdk_client_and_model()
    if not pair:
        raise RuntimeError("LLM not configured")
    client, model = pair
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "Ты аналитик агроданных. Отвечай на русском. Кратко и по делу: риски, полив, стадо, "
                    "приоритеты. 5–8 предложений, без общих фраз."
                ),
            },
            {
                "role": "user",
                "content": f"Данные по фермам:\n{context}\n\nЗадача: {user_instruction}",
            },
        ],
        temperature=0.35,
        max_tokens=900,
    )
    return (resp.choices[0].message.content or "").strip() or "—"


def run_openai_agent(
    session: Session,
    farm: Farm,
    messages: list[dict[str, str]],
    user_id: int,
) -> str:
    pair = _openai_sdk_client_and_model()
    if not pair:
        raise RuntimeError("LLM not configured")
    client, model = pair
    state = AgentRunState()
    system = (
        "Ты агент-помощник фермера. Отвечай на русском. "
        "Давай практичные, полные ответы: что сделать, как пошагово, сроки, на что обратить внимание. "
        "Если предлагаешь закупить семена, корм, технику или продать урожай — распиши план действий и критерии "
        "выгодной цены; приложение не совершает покупки и не подключается к биржам — только советы и задачи. "
        "Создавая задачу через create_task, всегда заполняй instructions_for_farmer развёрнутой инструкцией. "
        "Для большого совета без задачи вызывай notify_farmer — текст попадёт в уведомления пользователя. "
        "Используй list_tasks когда нужен актуальный список. Не выдумывай датчики; опирайся на контекст и погоду."
    )
    ctx = _context_block(session, farm)
    api_messages: list[dict[str, Any]] = [
        {"role": "system", "content": system},
        {"role": "system", "content": "Контекст фермы:\n" + ctx},
        *[{"role": m["role"], "content": m["content"]} for m in messages if m["role"] in ("user", "assistant")],
    ]
    for _ in range(5):
        resp = client.chat.completions.create(
            model=model,
            messages=api_messages,
            tools=TOOLS,
            tool_choice="auto",
        )
        choice = resp.choices[0].message
        if choice.tool_calls:
            api_messages.append(
                {
                    "role": "assistant",
                    "content": choice.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                        }
                        for tc in choice.tool_calls
                    ],
                }
            )
            for tc in choice.tool_calls:
                name = tc.function.name
                raw = tc.function.arguments or "{}"
                try:
                    args = json.loads(raw)
                except json.JSONDecodeError:
                    args = {}
                if name == "create_task":
                    out = _tool_create_task(session, farm.id, user_id, args, state)
                elif name == "notify_farmer":
                    out = _tool_notify_farmer(session, farm.id, user_id, args, state)
                elif name == "list_tasks":
                    out = _tool_list_tasks(session, farm.id, state)
                else:
                    out = '{"error":"unknown tool"}'
                api_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": out,
                    }
                )
            continue
        reply = (choice.content or "").strip() or "Готово."
        if (
            state.task_created
            and not state.farmer_notified_via_tool
            and state.last_task_notification_id is not None
            and len(reply) > 40
        ):
            n2 = session.get(Notification, state.last_task_notification_id)
            if n2 is not None:
                extra = f"\n\n---\nОтвет в чате:\n{reply}"
                n2.body = (n2.body + extra)[:_NOTIF_BODY_MAX]
                session.add(n2)
                session.commit()
        return reply

    return "Превышено число шагов агента."


def run_agent_chat(
    session: Session,
    farm: Farm | None,
    messages: list[dict[str, str]],
    user_id: int,
) -> str:
    last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    if farm is None:
        return "Выберите ферму в интерфейсе, чтобы я использовал поля, стада и погоду."

    if llm_configured():
        try:
            return run_openai_agent(session, farm, messages, user_id)
        except Exception as e:  # noqa: BLE001
            return (
                _user_message_for_llm_failure(e)
                + "\n\nРежим без LLM:\n\n"
                + run_rule_agent(_context_block(session, farm), last_user, session=session, farm=farm)
            )

    return run_rule_agent(_context_block(session, farm), last_user, session=session, farm=farm)
