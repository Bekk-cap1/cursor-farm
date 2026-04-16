from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.audit_service import log_action
from app.db import get_session
from app.deps import FarmAccess, get_current_user, get_farm_or_404, require_editor
from app.models import Task, User

router = APIRouter(prefix="/farms/{farm_id}/tasks", tags=["tasks"])


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    kind: str = "other"
    due_at: datetime | None = None
    description: str | None = None


class TaskPatch(BaseModel):
    status: str | None = None


class TaskRead(BaseModel):
    id: int
    farm_id: int
    title: str
    kind: str
    status: str
    due_at: datetime | None
    description: str | None
    source: str


@router.get("", response_model=list[TaskRead])
def list_tasks(
    farm_id: int,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[Task]:
    get_farm_or_404(db, user, farm_id)
    rows = list(db.exec(select(Task).where(Task.farm_id == farm_id)).all())
    rows.sort(key=lambda t: t.created_at, reverse=True)
    return rows


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(
    farm_id: int,
    body: TaskCreate,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    access: Annotated[FarmAccess, Depends(require_editor)],
) -> Task:
    if access.farm.id != farm_id:
        raise HTTPException(status_code=404, detail="Farm not found")
    kind = body.kind if body.kind in ("irrigation", "feeding", "other") else "other"
    t = Task(
        farm_id=farm_id,
        title=body.title.strip(),
        kind=kind,
        status="pending",
        due_at=body.due_at,
        description=body.description,
        source="user",
    )
    db.add(t)
    log_action(db, farm_id=farm_id, user_id=user.id, action="task.create", entity_type="task", meta={"title": t.title})
    db.commit()
    db.refresh(t)
    return t


@router.patch("/{task_id}", response_model=TaskRead)
def patch_task(
    farm_id: int,
    task_id: int,
    body: TaskPatch,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    access: Annotated[FarmAccess, Depends(require_editor)],
) -> Task:
    if access.farm.id != farm_id:
        raise HTTPException(status_code=404, detail="Farm not found")
    t = db.get(Task, task_id)
    if t is None or t.farm_id != farm_id:
        raise HTTPException(status_code=404, detail="Task not found")
    if body.status is not None:
        if body.status not in ("pending", "done", "cancelled"):
            raise HTTPException(status_code=400, detail="Недопустимый status")
        t.status = body.status
    db.add(t)
    log_action(
        db,
        farm_id=farm_id,
        user_id=user.id,
        action="task.update",
        entity_type="task",
        entity_id=task_id,
        meta={"status": t.status},
    )
    db.commit()
    db.refresh(t)
    return t


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    farm_id: int,
    task_id: int,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    access: Annotated[FarmAccess, Depends(require_editor)],
) -> None:
    if access.farm.id != farm_id:
        raise HTTPException(status_code=404, detail="Farm not found")
    t = db.get(Task, task_id)
    if t is None or t.farm_id != farm_id:
        raise HTTPException(status_code=404, detail="Task not found")
    log_action(db, farm_id=farm_id, user_id=user.id, action="task.delete", entity_type="task", entity_id=task_id)
    db.delete(t)
    db.commit()
