import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from app.auth_utils import create_access_token, hash_password, verify_password
from app.config import settings
from app.db import get_session
from app.deps import get_current_user
from app.limiter import limiter
from app.email_register_pending import put_email_pending, take_email_if_valid
from app.mail_smtp import send_registration_code_email, smtp_configured
from app.models import User
from app.sms_pending import put_pending, take_if_valid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterBody(BaseModel):
    email: EmailStr
    password: str


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeOut(BaseModel):
    id: int
    email: str
    phone: str | None = None
    first_name: str = ""
    last_name: str = ""
    niche: str | None = None


class RegisterEmailSendBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    password_confirm: str = Field(min_length=8)
    first_name: str = Field(default="", max_length=120)
    last_name: str = Field(default="", max_length=120)
    niche: str = Field(default="", max_length=200)
    phone: str | None = Field(default=None, max_length=32)


class RegisterEmailSendOut(BaseModel):
    ok: bool = True
    detail: str = "Код отправлен на email"
    expires_in_minutes: int = 10
    debug_code: str | None = None


class RegisterEmailVerifyBody(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=8)


class RegisterSmsSendBody(BaseModel):
    email: EmailStr
    password: str
    phone: str = Field(min_length=10, max_length=32)


class RegisterSmsSendOut(BaseModel):
    ok: bool = True
    detail: str = "Код отправлен на номер телефона"
    debug_code: str | None = None


class RegisterSmsVerifyBody(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=8)


@router.post("/register", response_model=TokenOut)
@limiter.limit("8/minute")
def register(
    request: Request,
    body: RegisterBody,
    db: Annotated[Session, Depends(get_session)],
) -> TokenOut:
    if len(body.password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Пароль не короче 8 символов")
    if db.exec(select(User).where(User.email == body.email)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email уже занят")
    user = User(email=body.email, hashed_password=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(access_token=create_access_token(str(user.id)))


def _normalize_phone_optional(raw: str | None) -> str | None:
    """Пусто = None; если введён неполный номер — не сохраняем (без ошибки)."""
    if raw is None or not str(raw).strip():
        return None
    s = str(raw).strip().replace(" ", "")
    digits = sum(1 for c in s if c.isdigit())
    if digits < 10:
        return None
    return s


@router.post("/register/email-send", response_model=RegisterEmailSendOut)
@limiter.limit("6/minute")
def register_email_send(
    request: Request,
    body: RegisterEmailSendBody,
    db: Annotated[Session, Depends(get_session)],
) -> RegisterEmailSendOut:
    if body.password != body.password_confirm:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Пароли не совпадают")
    if db.exec(select(User).where(User.email == body.email)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email уже занят")
    phone = _normalize_phone_optional(body.phone)
    code = put_email_pending(
        body.email,
        hash_password(body.password),
        first_name=body.first_name,
        last_name=body.last_name,
        niche=body.niche or "",
        phone=phone,
    )
    out = RegisterEmailSendOut()
    mailed = False
    if smtp_configured():
        try:
            send_registration_code_email(body.email, code)
            mailed = True
        except Exception:
            logger.exception("Не удалось отправить письмо с кодом на %s", body.email)
            if not settings.sms_debug_return_code:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Не удалось отправить письмо. Проверьте SMTP_HOST, логин/пароль и доступ к почтовому серверу.",
                )
    elif not settings.sms_debug_return_code:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Почта не настроена: задайте SMTP_HOST (и SMTP_USER, SMTP_PASSWORD) в .env сервера или включите SMS_DEBUG_RETURN_CODE=true для режима разработки.",
        )

    if settings.sms_debug_return_code:
        out.debug_code = code
    if mailed:
        out.detail = "Код отправлен на указанный email"
    elif settings.sms_debug_return_code:
        out.detail = "SMTP не настроен или ошибка отправки — код в поле debug_code (режим разработки)"
    return out


@router.post("/register/email-verify", response_model=TokenOut)
@limiter.limit("12/minute")
def register_email_verify(
    request: Request,
    body: RegisterEmailVerifyBody,
    db: Annotated[Session, Depends(get_session)],
) -> TokenOut:
    ent = take_email_if_valid(body.email, body.code)
    if ent is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный или просроченный код (срок 10 минут)",
        )
    if db.exec(select(User).where(User.email == body.email)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email уже занят")
    user = User(
        email=body.email,
        hashed_password=ent["hashed_password"],
        phone=ent["phone"],
        first_name=ent["first_name"] or "",
        last_name=ent["last_name"] or "",
        niche=ent["niche"] or None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(access_token=create_access_token(str(user.id)))


def _normalize_phone(raw: str) -> str:
    s = raw.strip().replace(" ", "")
    if not s:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Укажите номер телефона")
    digits = sum(1 for c in s if c.isdigit())
    if digits < 10:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Номер телефона слишком короткий")
    return s


@router.post("/register/sms-send", response_model=RegisterSmsSendOut)
@limiter.limit("6/minute")
def register_sms_send(
    request: Request,
    body: RegisterSmsSendBody,
    db: Annotated[Session, Depends(get_session)],
) -> RegisterSmsSendOut:
    if len(body.password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Пароль не короче 8 символов")
    if db.exec(select(User).where(User.email == body.email)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email уже занят")
    phone = _normalize_phone(body.phone)
    if db.exec(select(User).where(User.phone == phone)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Этот номер уже привязан к аккаунту")
    code = put_pending(body.email, hash_password(body.password), phone)
    out = RegisterSmsSendOut()
    if settings.sms_debug_return_code:
        out.debug_code = code
    return out


@router.post("/register/sms-verify", response_model=TokenOut)
@limiter.limit("12/minute")
def register_sms_verify(
    request: Request,
    body: RegisterSmsVerifyBody,
    db: Annotated[Session, Depends(get_session)],
) -> TokenOut:
    ent = take_if_valid(body.email, body.code)
    if ent is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неверный или просроченный код")
    if db.exec(select(User).where(User.email == body.email)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email уже занят")
    user = User(email=body.email, hashed_password=ent["hashed_password"], phone=ent["phone"])
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(access_token=create_access_token(str(user.id)))


@router.post("/login", response_model=TokenOut)
@limiter.limit("20/minute")
def login(
    request: Request,
    body: LoginBody,
    db: Annotated[Session, Depends(get_session)],
) -> TokenOut:
    user = db.exec(select(User).where(User.email == body.email)).first()
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный email или пароль")
    return TokenOut(access_token=create_access_token(str(user.id)))


@router.get("/me", response_model=MeOut)
def me(user: Annotated[User, Depends(get_current_user)]) -> MeOut:
    return MeOut(
        id=user.id,
        email=user.email,
        phone=user.phone,
        first_name=user.first_name or "",
        last_name=user.last_name or "",
        niche=user.niche,
    )
