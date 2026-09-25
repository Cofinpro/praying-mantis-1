from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

from app.models import Client, Level


class TeamLeadSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class CurrentUserRead(BaseModel):
    """GET /api/auth/me. No password_hash: if it's not in the schema, it can't leak."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    client: Client
    level: Level
    is_admin: bool
    is_team_lead: bool
    team_lead: TeamLeadSummary | None
    # e.g. "/api/users/16/avatar?v=1790350000", relative to the API's base URL; null = show initials
    avatar_url: str | None


class UserSummary(BaseModel):
    """GET /api/users: just enough to pick someone, e.g. a trainer."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    level: Level


# --- admin user management (/api/admin/users) and passwords ---

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
# 8+ characters. No other composition rules: length is what makes a password hard to guess.
Password = Annotated[str, Field(min_length=8, max_length=128)]


class UserAdminRead(BaseModel):
    """A user as admins manage them: everything /me has, for anyone."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    client: Client
    level: Level
    is_admin: bool
    is_team_lead: bool
    team_lead: TeamLeadSummary | None
    avatar_url: str | None


class UserCreate(BaseModel):
    """POST /api/admin/users. EmailStr here (not at login): new accounts need a real address."""

    name: Name
    email: EmailStr
    client: Client
    level: Level
    is_admin: bool = False
    team_lead_id: int | None = None
    password: Password


class UserUpdate(BaseModel):
    """PATCH /api/admin/users/{id}: only the fields sent change. team_lead_id: null removes the lead."""

    name: Name | None = None
    email: EmailStr | None = None
    client: Client | None = None
    level: Level | None = None
    is_admin: bool | None = None
    team_lead_id: int | None = None


class PasswordReset(BaseModel):
    """POST /api/admin/users/{id}/password: an admin sets a new password for someone."""

    password: Password


class PasswordChange(BaseModel):
    """POST /api/me/password: I change my own, proving I know the current one."""

    current_password: str = Field(min_length=1)
    new_password: Password
