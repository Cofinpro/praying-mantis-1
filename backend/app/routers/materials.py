from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, File, Response, UploadFile, status

from app.dependencies import CurrentUser, DbSession
from app.schemas.material import MaterialRead
from app.services import materials as service

router = APIRouter(prefix="/trainings/{training_id}/materials", tags=["materials"])

UNAUTHORIZED = {401: {"description": "Missing, invalid or expired token"}}
NOT_FOUND = {404: {"description": "Training (or file) not found, or not for your level"}}
MANAGE = {403: {"description": "Only admins and the trainer"}}


@router.get("", responses=UNAUTHORIZED | NOT_FOUND)
def list_materials(training_id: int, db: DbSession, user: CurrentUser) -> list[MaterialRead]:
    """The training's files, oldest first. Everyone who can see the training can see them."""
    return [MaterialRead.model_validate(m) for m in service.list_for(db, user, training_id)]


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    responses=UNAUTHORIZED
    | NOT_FOUND
    | MANAGE
    | {
        409: {"description": "training_cancelled | too_many_materials"},
        422: {"description": "material_name | material_type | material_empty | material_too_large | material_mismatch"},
    },
)
def upload_material(
    training_id: int,
    db: DbSession,
    user: CurrentUser,
    file: Annotated[UploadFile, File(description="PDF, PPTX, DOCX, XLSX, ZIP, PNG, JPEG, TXT or MD, max 10 MB")],
) -> MaterialRead:
    """Add a file (multipart/form-data, field `file`). Everyone enrolled gets a notification."""
    # A plain `def`, so FastAPI runs it in a worker thread: the sync file read and DB calls don't block
    # the event loop. Read one byte past the limit, so an oversized upload is refused without reading it all.
    data = file.file.read(service.MAX_BYTES + 1)
    return MaterialRead.model_validate(service.add(db, user, training_id, file.filename, data))


@router.get(
    "/{material_id}/file",
    response_class=Response,
    responses=UNAUTHORIZED | NOT_FOUND | {200: {"content": {"application/octet-stream": {}}}},
)
def download_material(training_id: int, material_id: int, db: DbSession, user: CurrentUser) -> Response:
    """The file itself, always as a download (never shown inline), so an uploaded HTML or SVG can't run here."""
    material = service.get_file(db, user, training_id, material_id)
    # filename= is a plain-ASCII fallback; filename*= (RFC 6266) carries the real UTF-8 name, e.g. "Sessão 1.pdf"
    ascii_name = material.filename.encode("ascii", "replace").decode().replace('"', "'")
    return Response(
        content=material.data,
        media_type=material.content_type,
        headers={
            "Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(material.filename)}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",  # behind a login: no shared caches
        },
    )


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT, responses=UNAUTHORIZED | NOT_FOUND | MANAGE)
def delete_material(training_id: int, material_id: int, db: DbSession, user: CurrentUser) -> Response:
    service.delete(db, user, training_id, material_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
