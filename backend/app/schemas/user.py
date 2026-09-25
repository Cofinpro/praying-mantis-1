from pydantic import BaseModel, ConfigDict

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
