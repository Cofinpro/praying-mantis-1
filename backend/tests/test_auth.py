from datetime import timedelta

import jwt
import pytest

from app.config import settings
from app.models import Client, Level, User
from app.security import create_access_token, hash_password
from app.seed import SEED_PASSWORD, seed

PASSWORD = "password123"


@pytest.fixture
def lead(db):
    user = User(
        name="Sofia Martins",
        email="sofia@test.local",
        password_hash=hash_password(PASSWORD),
        client=Client.DKB,
        level=Level.ARCHITECT,
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def employee(db, lead):
    user = User(
        name="João Silva",
        email="joao@test.local",
        password_hash=hash_password(PASSWORD),
        client=Client.DKB,
        level=Level.JUNIOR,
        team_lead=lead,
    )
    db.add(user)
    db.flush()
    return user


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --- POST /api/auth/login ---


def test_login_returns_a_bearer_token_for_the_user(client, employee):
    response = client.post("/api/auth/login", json={"email": employee.email, "password": PASSWORD})

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    payload = jwt.decode(body["access_token"], settings.jwt_secret, algorithms=["HS256"])
    assert payload["sub"] == str(employee.id)
    assert payload["exp"] - payload["iat"] == 8 * 60 * 60


def test_login_with_wrong_password_is_401(client, employee):
    response = client.post("/api/auth/login", json={"email": employee.email, "password": "wrong"})

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid email or password"}


def test_login_with_unknown_email_gives_the_same_401(client, employee):
    response = client.post("/api/auth/login", json={"email": "nobody@test.local", "password": PASSWORD})

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid email or password"}


def test_login_with_malformed_body_is_422(client):
    response = client.post("/api/auth/login", json={"email": "joao@test.local"})  # no password

    assert response.status_code == 422


# --- GET /api/auth/me ---


def test_me_returns_the_contract_shape(client, employee):
    token = create_access_token(employee.id)

    response = client.get("/api/auth/me", headers=auth_header(token))

    assert response.status_code == 200
    assert response.json() == {
        "id": employee.id,
        "name": "João Silva",
        "email": "joao@test.local",
        "client": "DKB",
        "level": "junior",
        "is_admin": False,
        "is_team_lead": False,
        "team_lead": {"id": employee.team_lead.id, "name": "Sofia Martins"},
        "avatar_url": None,
    }


def test_me_for_a_team_lead(client, lead, employee):
    token = create_access_token(lead.id)

    body = client.get("/api/auth/me", headers=auth_header(token)).json()

    assert body["is_team_lead"] is True
    assert body["team_lead"] is None


def test_seed_users_can_log_in(client, db):
    seed(db)
    response = client.post(
        "/api/auth/login", json={"email": "admin@cofinpro.pt", "password": SEED_PASSWORD}
    )

    assert response.status_code == 200


def test_login_then_me(client, employee):
    token = client.post(
        "/api/auth/login", json={"email": employee.email, "password": PASSWORD}
    ).json()["access_token"]

    response = client.get("/api/auth/me", headers=auth_header(token))

    assert response.json()["email"] == employee.email


def test_me_never_exposes_the_password_hash(client, employee):
    body = client.get("/api/auth/me", headers=auth_header(create_access_token(employee.id))).json()

    assert "password_hash" not in body


@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="missing token"),
        pytest.param({"Authorization": "Bearer not-a-jwt"}, id="garbage token"),
        pytest.param({"Authorization": "Basic dXNlcjpwYXNz"}, id="wrong scheme"),
    ],
)
def test_me_without_a_valid_token_is_401(client, headers):
    response = client.get("/api/auth/me", headers=headers)

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_me_with_an_expired_token_is_401(client, employee):
    token = create_access_token(employee.id, expires_in=timedelta(seconds=-1))

    assert client.get("/api/auth/me", headers=auth_header(token)).status_code == 401


def test_me_with_a_token_signed_by_another_secret_is_401(client, employee):
    forged = jwt.encode({"sub": str(employee.id), "exp": 9999999999}, "x" * 32, algorithm="HS256")

    assert client.get("/api/auth/me", headers=auth_header(forged)).status_code == 401


def test_me_with_an_unsigned_token_is_401(client, employee):
    # The classic "alg: none" attack: a token with no signature at all
    unsigned = jwt.encode({"sub": str(employee.id), "exp": 9999999999}, None, algorithm="none")

    assert client.get("/api/auth/me", headers=auth_header(unsigned)).status_code == 401


def test_me_for_a_deleted_user_is_401(client, db, employee):
    token = create_access_token(employee.id)
    db.delete(employee)
    db.flush()

    assert client.get("/api/auth/me", headers=auth_header(token)).status_code == 401
