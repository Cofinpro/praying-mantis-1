"""Admin user management (/api/admin/users) and changing my own password (/api/me/password)."""

import pytest

from app.models import Client, Level
from app.security import hash_password, verify_password
from tests.conftest import auth_headers

NEW_USER = {
    "name": "Ana Costa",
    "email": "Ana.Costa@cofinpro.pt",
    "client": "DKB",
    "level": "expert",
    "password": "a-long-password",
}


@pytest.fixture
def admin(make_user):
    return make_user(name="Admin", is_admin=True)


class TestList:
    def test_admins_see_everyone_with_lead_and_role(self, client, make_user, admin):
        lead = make_user(name="Lead")
        make_user(name="Report", team_lead=lead)

        body = client.get("/api/admin/users", headers=auth_headers(admin)).json()

        by_name = {u["name"]: u for u in body}
        assert by_name["Report"]["team_lead"] == {"id": lead.id, "name": "Lead"}
        assert by_name["Lead"]["is_team_lead"] is True
        assert by_name["Admin"]["is_admin"] is True
        assert "password_hash" not in by_name["Admin"]

    def test_search_by_name_or_email(self, client, make_user, admin):
        make_user(name="Beatriz Reis", email="beatriz@cofinpro.pt")
        make_user(name="Hugo Ferreira", email="hugo@cofinpro.pt")

        body = client.get("/api/admin/users?search=beat", headers=auth_headers(admin)).json()

        assert [u["name"] for u in body] == ["Beatriz Reis"]

    def test_everyone_else_gets_403(self, client, make_user):
        assert client.get("/api/admin/users", headers=auth_headers(make_user())).status_code == 403


class TestCreate:
    def test_creates_a_user_who_can_log_in(self, client, admin):
        response = client.post("/api/admin/users", headers=auth_headers(admin), json=NEW_USER)

        assert response.status_code == 201
        body = response.json()
        assert body["email"] == "ana.costa@cofinpro.pt"  # stored lower-case
        assert body["is_admin"] is False
        login = client.post("/api/auth/login", json={"email": "ana.costa@cofinpro.pt", "password": "a-long-password"})
        assert login.status_code == 200

    def test_with_a_team_lead(self, client, make_user, admin):
        lead = make_user(name="Lead")

        body = client.post(
            "/api/admin/users", headers=auth_headers(admin), json=NEW_USER | {"team_lead_id": lead.id}
        ).json()

        assert body["team_lead"] == {"id": lead.id, "name": "Lead"}

    def test_email_must_be_unique(self, client, make_user, admin):
        make_user(email="ana.costa@cofinpro.pt")

        response = client.post("/api/admin/users", headers=auth_headers(admin), json=NEW_USER)

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "email_taken"

    @pytest.mark.parametrize(
        ("change", "field"),
        [
            ({"email": "not-an-email"}, "email"),
            ({"password": "short"}, "password"),
            ({"name": "   "}, "name"),
            ({"team_lead_id": 999999}, "team_lead_id"),
        ],
    )
    def test_invalid_input_is_a_422_on_the_field(self, client, admin, change, field):
        response = client.post("/api/admin/users", headers=auth_headers(admin), json=NEW_USER | change)

        assert response.status_code == 422
        assert response.json()["detail"][0]["loc"][-1] == field

    def test_only_admins(self, client, make_user):
        response = client.post("/api/admin/users", headers=auth_headers(make_user()), json=NEW_USER)

        assert response.status_code == 403


class TestUpdate:
    def test_changes_only_what_was_sent(self, client, make_user, admin):
        user = make_user(name="Old", level=Level.JUNIOR, client=Client.VV)

        body = client.patch(
            f"/api/admin/users/{user.id}", headers=auth_headers(admin), json={"level": "senior"}
        ).json()

        assert (body["name"], body["level"], body["client"]) == ("Old", "senior", "VV")

    def test_sets_and_removes_the_team_lead(self, client, make_user, admin):
        lead, user = make_user(name="Lead"), make_user()

        set_ = client.patch(f"/api/admin/users/{user.id}", headers=auth_headers(admin), json={"team_lead_id": lead.id})
        removed = client.patch(f"/api/admin/users/{user.id}", headers=auth_headers(admin), json={"team_lead_id": None})

        assert set_.json()["team_lead"]["id"] == lead.id
        assert removed.json()["team_lead"] is None

    def test_a_user_cant_lead_themselves_or_their_own_lead(self, client, make_user, admin):
        top = make_user(name="Top")
        middle = make_user(name="Middle", team_lead=top)

        self_lead = client.patch(f"/api/admin/users/{top.id}", headers=auth_headers(admin), json={"team_lead_id": top.id})
        loop = client.patch(f"/api/admin/users/{top.id}", headers=auth_headers(admin), json={"team_lead_id": middle.id})

        assert self_lead.json()["detail"][0]["type"] == "team_lead_cycle"
        assert loop.json()["detail"][0]["type"] == "team_lead_cycle"

    def test_email_stays_unique(self, client, make_user, admin):
        make_user(email="taken@cofinpro.pt")
        user = make_user()

        response = client.patch(f"/api/admin/users/{user.id}", headers=auth_headers(admin), json={"email": "taken@cofinpro.pt"})

        assert response.json()["detail"]["code"] == "email_taken"

    def test_admins_cant_remove_their_own_admin_rights(self, client, admin):
        response = client.patch(f"/api/admin/users/{admin.id}", headers=auth_headers(admin), json={"is_admin": False})

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "cannot_demote_self"

    def test_can_make_someone_else_admin_and_back(self, client, make_user, admin):
        user = make_user()

        up = client.patch(f"/api/admin/users/{user.id}", headers=auth_headers(admin), json={"is_admin": True})
        down = client.patch(f"/api/admin/users/{user.id}", headers=auth_headers(admin), json={"is_admin": False})

        assert (up.json()["is_admin"], down.json()["is_admin"]) == (True, False)

    def test_can_give_and_take_the_hr_role(self, client, make_user, admin):
        user = make_user()

        up = client.patch(f"/api/admin/users/{user.id}", headers=auth_headers(admin), json={"is_hr": True})
        down = client.patch(f"/api/admin/users/{user.id}", headers=auth_headers(admin), json={"is_hr": False})

        assert (up.json()["is_hr"], down.json()["is_hr"]) == (True, False)

    def test_unknown_user_is_404(self, client, admin):
        assert client.patch("/api/admin/users/999999", headers=auth_headers(admin), json={"name": "X"}).status_code == 404


class TestPasswords:
    def test_admin_resets_someones_password(self, client, db, make_user, admin):
        user = make_user(password_hash=hash_password("old-password"))

        response = client.post(
            f"/api/admin/users/{user.id}/password", headers=auth_headers(admin), json={"password": "brand-new-pass"}
        )

        assert response.status_code == 204
        db.refresh(user)
        assert verify_password("brand-new-pass", user.password_hash)

    def test_i_change_my_own_password(self, client, db, make_user):
        me = make_user(password_hash=hash_password("old-password"))

        response = client.post(
            "/api/me/password",
            headers=auth_headers(me),
            json={"current_password": "old-password", "new_password": "brand-new-pass"},
        )

        assert response.status_code == 204
        db.refresh(me)
        assert verify_password("brand-new-pass", me.password_hash)

    def test_the_current_password_must_be_right(self, client, make_user):
        me = make_user(password_hash=hash_password("old-password"))

        response = client.post(
            "/api/me/password", headers=auth_headers(me), json={"current_password": "wrong", "new_password": "brand-new-pass"}
        )

        assert response.status_code == 422
        assert response.json()["detail"][0]["loc"][-1] == "current_password"

    def test_the_new_password_needs_8_characters_and_must_differ(self, client, make_user):
        me = make_user(password_hash=hash_password("old-password"))

        short = client.post("/api/me/password", headers=auth_headers(me), json={"current_password": "old-password", "new_password": "short"})
        same = client.post("/api/me/password", headers=auth_headers(me), json={"current_password": "old-password", "new_password": "old-password"})

        assert short.json()["detail"][0]["loc"][-1] == "new_password"
        assert same.json()["detail"][0]["type"] == "same_password"
