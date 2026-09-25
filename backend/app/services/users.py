from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import User


def search_users(db: Session, search: str | None, limit: int) -> list[User]:
    """Users whose name or email contains `search`, sorted by name.

    Case- and accent-insensitive ("ines" finds "Inês"), because the MySQL
    collation (utf8mb4_0900_ai_ci) is.
    """
    query = select(User).order_by(User.name, User.id).limit(limit)
    if search:
        # Escape LIKE wildcards, so searching for "_" or "%" matches them literally
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        query = query.where(
            or_(User.name.like(pattern, escape="\\"), User.email.like(pattern, escape="\\"))
        )
    return list(db.scalars(query))
