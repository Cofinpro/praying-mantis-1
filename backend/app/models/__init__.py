"""SQLAlchemy models (the database shape).

Import every model here, so Alembic sees all tables through Base.metadata.
"""

from app.database import Base

__all__ = ["Base"]
