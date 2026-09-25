from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MaterialUploader(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class MaterialRead(BaseModel):
    """A file of a training, without its bytes (GET …/materials/{id}/file downloads it)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    content_type: str
    size: int  # bytes
    uploaded_by: MaterialUploader | None  # null when that account was deleted
    created_at: datetime
