from typing import Literal

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    # A plain string, not EmailStr: login only checks whether the email matches a user.
    # EmailStr would also reject reserved domains like .test, which the seed users first used.
    email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
