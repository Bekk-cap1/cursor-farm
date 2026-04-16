from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.db import get_session
from app.deps import get_current_user, get_farm_or_404
from app.models import Farm, User
from app.services.agent_runner import run_agent_chat

router = APIRouter(prefix="/agent", tags=["agent"])


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    farm_id: int | None = None
    messages: list[ChatMessage] = Field(min_length=1)


class ChatResponse(BaseModel):
    reply: str
    farm_id: int | None


@router.post("/chat", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    db: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> ChatResponse:
    farm: Farm | None = None
    if body.farm_id is not None:
        farm = get_farm_or_404(db, user, body.farm_id)
    msgs = [{"role": m.role, "content": m.content} for m in body.messages]
    reply = run_agent_chat(db, farm, msgs, user.id)
    return ChatResponse(reply=reply, farm_id=body.farm_id)
