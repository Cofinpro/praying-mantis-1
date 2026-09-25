"""Sending email over SMTP (BE-4.2).

Emails go out through FastAPI's BackgroundTasks, *after* the response was sent and
*after* the database commit. So a slow or broken mail server never slows down or
breaks the API, and an email is only sent for something that was really saved.
The in-app notification (BE-4.1) is the record; email is a best-effort extra.
"""

import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage

from app.config import settings

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Email:
    to: str
    subject: str
    body: str


def send_email(email: Email) -> bool:
    """Sends one email. Never raises: failures are logged, and the caller carries on."""
    if not settings.smtp_host:
        log.info("Email is switched off (no SMTP_HOST): not sending %r", email.subject)
        return False

    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = email.to
    message["Subject"] = email.subject
    message.set_content(email.body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            smtp.send_message(message)
        return True
    except (OSError, smtplib.SMTPException):
        log.exception("Could not send email %r to %s", email.subject, email.to)
        return False
