"""The reminder loop: runs services.reminders.send_due() every REMINDERS_EVERY_MINUTES.

It lives inside the web process (started by main.py's lifespan), so there's no separate
worker to deploy. On Render's free plan the process sleeps when idle, so a GitHub Actions
cron (.github/workflows/wake-backend.yml) wakes it up twice a day, and the first loop
turn after waking catches up on whatever is due.
"""

import asyncio
import logging

from app.database import SessionLocal
from app.email import send_email
from app.services import reminders

log = logging.getLogger(__name__)


def run_once() -> reminders.ReminderRun | None:
    """One pass with its own session. Never raises: a bad pass is logged, the next one tries again."""
    try:
        with SessionLocal() as db:
            run = reminders.send_due(db)
    except Exception:
        log.exception("Sending reminders failed")
        return None
    for email in run.emails:
        send_email(email)  # never raises either
    if run.trainings or run.seats:
        log.info("Sent %d training and %d seat reminders", run.trainings, run.seats)
    return run


async def remind_forever(every_minutes: int) -> None:
    while True:
        # A worker thread: send_due() is sync SQLAlchemy and would block the event loop
        await asyncio.to_thread(run_once)
        await asyncio.sleep(every_minutes * 60)
