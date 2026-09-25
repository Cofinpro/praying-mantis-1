from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.errors import register_error_handlers
from app.routers import auth, enrollments, health, notifications, trainings, users

app = FastAPI(title="Praying Mantis API")

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
