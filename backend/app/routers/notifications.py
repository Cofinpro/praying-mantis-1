from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.dependencies import CurrentUser, DbSession
from app.schemas.notification import NotificationList, NotificationRead
from app.services import notifications as service

router = APIRouter(prefix="/notifications", tags=["notifications"])

UNAUTHORIZED = {401: {"description": "Missing, invalid or expired token"}}


@router.get("", responses=UNAUTHORIZED)
def list_notifications(
    db: DbSession, user: CurrentUser, limit: Annotated[int, Query(ge=1, le=100)] = 20
) -> NotificationList:
    """My latest notifications, newest first, and how many are unread. FE polls this every 30 s."""
    unread, items = service.list_for(db, user, limit)
    return NotificationList(
        unread_count=unread, items=[NotificationRead.model_validate(n) for n in items]
    )


@router.post(
    "/read-all", status_code=status.HTTP_204_NO_CONTENT, responses=UNAUTHORIZED
)
def mark_all_read(db: DbSession, user: CurrentUser) -> Response:
    service.mark_all_read(db, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{notification_id}/read",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=UNAUTHORIZED | {404: {"description": "Not found (or not yours)"}},
)
def mark_read(notification_id: int, db: DbSession, user: CurrentUser) -> Response:
    service.mark_read(db, user, notification_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
