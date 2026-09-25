from typing import Annotated

from fastapi import APIRouter, File, Response, UploadFile, status

from app.dependencies import CurrentUser, DbSession
from app.schemas.user import CurrentUserRead
from app.services import avatars as service

router = APIRouter(tags=["avatars"])

UNAUTHORIZED = {401: {"description": "Missing, invalid or expired token"}}


@router.put(
    "/me/avatar",
    responses=UNAUTHORIZED | {422: {"description": "avatar_type | avatar_too_large | avatar_not_image"}},
)
async def upload_avatar(
    db: DbSession, user: CurrentUser, file: Annotated[UploadFile, File(description="JPEG, PNG or WebP, max 512 KB")]
) -> CurrentUserRead:
    """Set or replace my profile picture (multipart/form-data, field `file`). Returns me, with the new avatar_url."""
    # Read one byte past the limit, so an oversized upload is rejected without reading all of it
    data = await file.read(service.MAX_BYTES + 1)
    return CurrentUserRead.model_validate(service.set_avatar(db, user, data, file.content_type))


@router.delete("/me/avatar", status_code=status.HTTP_204_NO_CONTENT, responses=UNAUTHORIZED)
def delete_avatar(db: DbSession, user: CurrentUser) -> Response:
    """Remove my profile picture (back to initials)."""
    service.remove_avatar(db, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/users/{user_id}/avatar",
    response_class=Response,
    responses={200: {"content": {"image/jpeg": {}, "image/png": {}, "image/webp": {}}}, 404: {"description": "No picture"}},
)
def get_avatar(user_id: int, db: DbSession) -> Response:
    """The picture itself. No login needed, because <img src> can't send a Bearer token.
    avatar_url carries a version (?v=…), so the image can be cached for a year."""
    avatar = service.get_avatar(db, user_id)
    return Response(
        content=avatar.data,
        media_type=avatar.content_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"},
    )
