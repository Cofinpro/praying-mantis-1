from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.errors import Conflict, NotFound, ValidationFailed
from app.models import User
from app.schemas.user import PasswordChange, UserCreate, UserUpdate
from app.security import hash_password, verify_password


def _escaped_like(search: str) -> str:
    # Escape LIKE wildcards, so searching for "_" or "%" matches them literally
    escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def search_users(db: Session, search: str | None, limit: int) -> list[User]:
    """Users whose name or email contains `search`, sorted by name.

    Case- and accent-insensitive ("ines" finds "Inês"), because the MySQL
    collation (utf8mb4_0900_ai_ci) is.
    """
    query = select(User).order_by(User.name, User.id).limit(limit)
    if search:
        pattern = _escaped_like(search)
        query = query.where(
            or_(User.name.like(pattern, escape="\\"), User.email.like(pattern, escape="\\"))
        )
    return list(db.scalars(query))


# --- admin user management ---


def list_users(db: Session, search: str | None) -> list[User]:
    """Every user (or those matching `search`), with lead, reports and avatar loaded up front."""
    query = (
        select(User)
        .options(joinedload(User.team_lead), selectinload(User.reports), joinedload(User.avatar))
        .order_by(User.name, User.id)
    )
    if search:
        pattern = _escaped_like(search)
        query = query.where(or_(User.name.like(pattern, escape="\\"), User.email.like(pattern, escape="\\")))
    return list(db.scalars(query).unique())


def get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFound("User not found")
    return user


def _email_is_free(db: Session, email: str, except_id: int | None = None) -> None:
    other = db.scalar(select(User).where(User.email == email))
    if other is not None and other.id != except_id:
        raise Conflict("email_taken", "A user with this email already exists")


def _check_team_lead(db: Session, user_id: int | None, team_lead_id: int | None) -> None:
    """The lead must exist, can't be the user, and can't be someone who (indirectly) reports to them."""
    if team_lead_id is None:
        return
    lead = db.get(User, team_lead_id)
    if lead is None:
        raise ValidationFailed("team_lead_id", "No user with this id", "team_lead_not_found", team_lead_id)
    # Walk up from the new lead: reaching the user means a loop (A leads B leads A)
    current, seen = lead, set()
    while current is not None and current.id not in seen:
        if current.id == user_id:
            raise ValidationFailed(
                "team_lead_id", "That would make a loop of team leads", "team_lead_cycle", team_lead_id
            )
        seen.add(current.id)
        current = current.team_lead


def create_user(db: Session, data: UserCreate) -> User:
    email = data.email.lower()
    _email_is_free(db, email)
    _check_team_lead(db, None, data.team_lead_id)
    user = User(
        name=data.name,
        email=email,
        client=data.client,
        level=data.level,
        is_admin=data.is_admin,
        is_hr=data.is_hr,
        team_lead_id=data.team_lead_id,
        password_hash=hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, user_id: int, data: UserUpdate, acting_admin: User) -> User:
    user = get_user(db, user_id)
    changes = data.model_dump(exclude_unset=True)
    for field in ("name", "email", "client", "level", "is_admin", "is_hr"):
        if field in changes and changes[field] is None:
            raise ValidationFailed(field, "This field can't be empty", "missing", None)
    if "email" in changes:
        changes["email"] = changes["email"].lower()
        _email_is_free(db, changes["email"], except_id=user.id)
    if "team_lead_id" in changes:
        _check_team_lead(db, user.id, changes["team_lead_id"])
    if changes.get("is_admin") is False and user.id == acting_admin.id:
        # Otherwise the last admin could lock everyone out of user management
        raise Conflict("cannot_demote_self", "You can't remove your own admin rights")
    for field, value in changes.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


def reset_password(db: Session, user_id: int, password: str) -> None:
    user = get_user(db, user_id)
    user.password_hash = hash_password(password)
    db.commit()


def change_own_password(db: Session, user: User, data: PasswordChange) -> None:
    if not verify_password(data.current_password, user.password_hash):
        raise ValidationFailed("current_password", "That isn't your current password", "wrong_password", None)
    if data.new_password == data.current_password:
        raise ValidationFailed("new_password", "Choose a password you haven't used here", "same_password", None)
    user.password_hash = hash_password(data.new_password)
    db.commit()
