"""Files for a training: slides, exercises, handouts. No HTTP here (see routers/materials.py).

Who may do what:
- see and download: anyone who can see the training (its levels), its trainer, and admins
- upload and delete: admins and the training's trainer
"""

from collections.abc import Callable

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app import files
from app.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.models import NotificationType, Training, TrainingMaterial, User
from app.services import notifications

MAX_BYTES = 10 * 1024 * 1024
MAX_FILES = 20  # per training

# Extension → (the Content-Type we serve it with, a check of its first bytes). The extension decides,
# not the Content-Type the browser sends (browsers guess it from the name anyway), and the bytes must agree.
FILE_TYPES: dict[str, tuple[str, Callable[[bytes], bool]]] = {
    ".pdf": ("application/pdf", files.is_pdf),
    ".pptx": ("application/vnd.openxmlformats-officedocument.presentationml.presentation", files.is_zip),
    ".docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", files.is_zip),
    ".xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", files.is_zip),
    ".zip": ("application/zip", files.is_zip),
    ".png": ("image/png", files.is_png),
    ".jpg": ("image/jpeg", files.is_jpeg),
    ".jpeg": ("image/jpeg", files.is_jpeg),
    ".txt": ("text/plain; charset=utf-8", files.is_utf8_text),
    ".md": ("text/markdown; charset=utf-8", files.is_utf8_text),
}


# --- access ---


def can_manage(user: User, training: Training) -> bool:
    return user.is_admin or training.trainer_id == user.id


def _viewable_training(db: Session, user: User, training_id: int) -> Training:
    """The training, or 404 when it doesn't exist or the user can't see it (the same 404, see CLAUDE.md)."""
    training = db.get(Training, training_id)
    if training is None or not (can_manage(user, training) or user.level in training.levels):
        raise NotFound("Training not found")
    return training


def _manageable_training(db: Session, user: User, training_id: int) -> Training:
    training = _viewable_training(db, user, training_id)
    if not can_manage(user, training):
        raise Forbidden("Only admins and the trainer can change the materials")
    return training


def _material(db: Session, training: Training, material_id: int) -> TrainingMaterial:
    material = db.get(TrainingMaterial, material_id)
    if material is None or material.training_id != training.id:
        raise NotFound("Material not found")
    return material


# --- the operations ---


def list_for(db: Session, user: User, training_id: int) -> list[TrainingMaterial]:
    """Oldest first, without their bytes (deferred column)."""
    training = _viewable_training(db, user, training_id)
    return list(
        db.scalars(
            select(TrainingMaterial)
            .where(TrainingMaterial.training_id == training.id)
            .options(joinedload(TrainingMaterial.uploaded_by))
            .order_by(TrainingMaterial.created_at, TrainingMaterial.id)
        )
    )


def add(db: Session, user: User, training_id: int, raw_filename: str | None, data: bytes) -> TrainingMaterial:
    """Validates and stores one file, and tells everyone enrolled. `data` may be one byte over MAX_BYTES."""
    training = _manageable_training(db, user, training_id)
    if training.cancelled:
        raise Conflict("training_cancelled", "This training is cancelled")

    filename = files.clean_filename(raw_filename)
    if not filename:
        raise ValidationFailed("file", "The file needs a name", "material_name", raw_filename)
    file_type = FILE_TYPES.get(files.extension(filename))
    if file_type is None:
        allowed = ", ".join(sorted(FILE_TYPES))
        raise ValidationFailed("file", f"Use one of these file types: {allowed}", "material_type", filename)
    if not data:
        raise ValidationFailed("file", "The file is empty", "material_empty", filename)
    if len(data) > MAX_BYTES:
        raise ValidationFailed("file", "The file is too large (max 10 MB)", "material_too_large", filename)
    content_type, looks_right = file_type
    if not looks_right(data):
        raise ValidationFailed(
            "file", f"The file doesn't look like a {files.extension(filename)} file", "material_mismatch", filename
        )

    # Lock the training row, so two uploads at once can't both be number 20
    db.get(Training, training.id, with_for_update=True, populate_existing=True)
    count = db.scalar(select(func.count()).where(TrainingMaterial.training_id == training.id))
    if count >= MAX_FILES:
        raise Conflict("too_many_materials", f"A training can have at most {MAX_FILES} files")

    material = TrainingMaterial(
        training_id=training.id,
        filename=filename,
        content_type=content_type,
        size=len(data),
        data=data,
        uploaded_by=user,
    )
    db.add(material)
    notifications.notify(
        db,
        [person for person in notifications.enrolled_people(db, training) if person.id != user.id],
        NotificationType.MATERIAL_ADDED,
        f"New material for {training.name}: {filename}",
        link=notifications.training_link(training),
    )
    db.commit()  # the file and its notifications together
    db.refresh(material)
    return material


def get_file(db: Session, user: User, training_id: int, material_id: int) -> TrainingMaterial:
    training = _viewable_training(db, user, training_id)
    return _material(db, training, material_id)


def delete(db: Session, user: User, training_id: int, material_id: int) -> None:
    training = _manageable_training(db, user, training_id)
    db.delete(_material(db, training, material_id))
    db.commit()
