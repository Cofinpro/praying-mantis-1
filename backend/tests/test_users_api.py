import pytest

from app.models import Level
from tests.conftest import auth_headers


@pytest.fixture
def admin(make_user):
    return make_user(name="Alex Admin", email="admin@test.local", is_admin=True)


@pytest.fixture
def employee(make_user):
    return make_user(name="João Silva", email="joao@test.local")


# --- 401 vs 403 ---


def test_without_a_token_is_401(client):
    # 401: "I don't know who you are". Logging in would help.
    response = client.get("/api/users")

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_as_a_non_admin_is_403(client, employee):
    # 403: "I know who you are, and you may not". Logging in again won't help.
    response = client.get("/api/users", headers=auth_headers(employee))

    assert response.status_code == 403
    assert response.json() == {"detail": "Admins only"}
    assert "WWW-Authenticate" not in response.headers


def test_team_leads_are_not_admins(client, make_user):
    lead = make_user(email="lead@test.local")
    make_user(email="report@test.local", team_lead=lead)

    assert client.get("/api/users", headers=auth_headers(lead)).status_code == 403


def test_as_an_admin_is_200(client, admin):
    assert client.get("/api/users", headers=auth_headers(admin)).status_code == 200


# --- GET /api/users ---


def test_returns_the_contract_shape_sorted_by_name(client, admin, employee):
    response = client.get("/api/users", headers=auth_headers(admin))

    assert response.json() == [
        {"id": admin.id, "name": "Alex Admin", "email": "admin@test.local", "level": "junior"},
        {"id": employee.id, "name": "João Silva", "email": "joao@test.local", "level": "junior"},
    ]


def test_search_matches_part_of_the_name_or_email(client, admin, make_user):
    make_user(name="Sofia Martins", email="sofia@test.local", level=Level.ARCHITECT)
    make_user(name="Bruno Pinto", email="bruno.martins@test.local")
    make_user(name="Hugo Ferreira", email="hugo@test.local")

    response = client.get("/api/users", params={"search": "martins"}, headers=auth_headers(admin))

    assert [u["name"] for u in response.json()] == ["Bruno Pinto", "Sofia Martins"]


def test_search_ignores_accents_and_case(client, admin, make_user):
    make_user(name="Inês Rocha", email="ines@test.local")

    response = client.get("/api/users", params={"search": "INES R"}, headers=auth_headers(admin))

    assert [u["name"] for u in response.json()] == ["Inês Rocha"]


def test_search_treats_like_wildcards_literally(client, admin, make_user):
    make_user(name="Under_score", email="u@test.local")
    make_user(name="Undertaker", email="t@test.local")

    def names(search: str) -> list[str]:
        response = client.get("/api/users", params={"search": search}, headers=auth_headers(admin))
        return [user["name"] for user in response.json()]

    assert names("r_s") == ["Under_score"]
    assert names("%") == []


def test_limit(client, admin, make_user):
    for _ in range(5):
        make_user()

    response = client.get("/api/users", params={"limit": 3}, headers=auth_headers(admin))

    assert len(response.json()) == 3


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 101}, {"search": "x" * 101}])
def test_invalid_query_is_422(client, admin, params):
    assert client.get("/api/users", params=params, headers=auth_headers(admin)).status_code == 422


def test_never_exposes_the_password_hash(client, admin):
    body = client.get("/api/users", headers=auth_headers(admin)).json()

    assert all("password_hash" not in user for user in body)
