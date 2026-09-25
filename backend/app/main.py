import asyncio
import contextlib
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.errors import register_error_handlers
from app.scheduler import remind_forever
from app.routers import admin_reminders, admin_reports, admin_users, avatars, auth, enrollments, health, notifications, seats, trainings, users

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown. Like Spring's @PostConstruct / @PreDestroy, around `yield`."""
    task = None
    if settings.reminders_every_minutes > 0:
        task = asyncio.create_task(remind_forever(settings.reminders_every_minutes))
    yield
    if task is not None:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="Praying Mantis API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)

app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(trainings.router, prefix="/api")
app.include_router(trainings.me_router, prefix="/api")
app.include_router(enrollments.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(seats.router, prefix="/api")
app.include_router(avatars.router, prefix="/api")
app.include_router(admin_users.router, prefix="/api")
app.include_router(admin_users.me_router, prefix="/api")
app.include_router(admin_reminders.router, prefix="/api")
app.include_router(admin_reports.router, prefix="/api")
