"""Отправка писем через SMTP (stdlib)."""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.config import settings

logger = logging.getLogger(__name__)


def smtp_configured() -> bool:
    return bool(settings.smtp_host and str(settings.smtp_host).strip())


def _from_addr() -> str:
    u = (settings.smtp_user or "").strip()
    f = (settings.email_from or "").strip()
    return f or u or "noreply@localhost"


def send_registration_code_email(to_addr: str, code: str) -> None:
    """Синхронная отправка кода регистрации. Бросает исключение при ошибке SMTP."""
    if not smtp_configured():
        raise RuntimeError("SMTP не настроен (нет SMTP_HOST)")

    host = str(settings.smtp_host).strip()
    port = int(settings.smtp_port)
    user = (settings.smtp_user or "").strip()
    password = (settings.smtp_password or "").strip()
    from_addr = _from_addr()

    subject = "Код подтверждения регистрации — Farm AI"
    text = (
        f"Ваш код подтверждения: {code}\n\n"
        "Введите его на странице регистрации. Код действителен 10 минут.\n\n"
        "Если вы не запрашивали регистрацию, проигнорируйте это письмо."
    )
    html = (
        f"<p>Здравствуйте!</p>"
        f"<p>Ваш код подтверждения: <strong style=\"font-size:22px;letter-spacing:0.15em\">{code}</strong></p>"
        "<p>Введите его на странице регистрации. Код действителен <strong>10 минут</strong>.</p>"
        "<p style=\"color:#666;font-size:13px\">Если вы не запрашивали регистрацию, проигнорируйте это письмо.</p>"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr.strip()
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")

    if settings.smtp_use_ssl:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, context=context, timeout=30) as server:
            if user and password:
                server.login(user, password)
            server.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=30) as server:
            server.ehlo_or_helo_if_needed()
            if settings.smtp_use_tls:
                context = ssl.create_default_context()
                server.starttls(context=context)
                server.ehlo()
            if user and password:
                server.login(user, password)
            server.send_message(msg)

    logger.info("SMTP: письмо с кодом регистрации отправлено на %s", to_addr)
