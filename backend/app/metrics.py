from datetime import date, datetime

from sqlmodel import Session, select

from app.models import Task


def farm_task_metrics(session: Session, farm_id: int) -> tuple[int, int]:
    """alerts_count: просроченные pending; today_tasks: pending с due сегодня (UTC)."""
    now = datetime.utcnow()
    today = date.today()
    tasks = list(session.exec(select(Task).where(Task.farm_id == farm_id)).all())
    pending = [t for t in tasks if t.status == "pending"]
    overdue = sum(1 for t in pending if t.due_at is not None and t.due_at < now)
    due_today = sum(
        1 for t in pending if t.due_at is not None and t.due_at.date() == today
    )
    return overdue, due_today
