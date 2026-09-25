"""Profile pictures: PUT/DELETE /api/me/avatar and GET /api/users/{id}/avatar."""

from tests.conftest import auth_headers

# The smallest valid headers for each format, plus some bytes
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 100
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 100


def upload(client, user, data=JPEG, content_type="image/jpeg"):
    return client.put(
        "/api/me/avatar", headers=auth_headers(user), files={"file": ("me.jpg", data, content_type)}
    )


class TestUpload:
    def test_sets_my_picture_and_returns_me_with_its_url(self, client, make_user):
        me = make_user()

        response = upload(client, me)

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == me.id
        assert body["avatar_url"].startswith(f"/api/users/{me.id}/avatar?v=")

    def test_me_shows_the_url_and_no_picture_means_null(self, client, make_user):
        me, other = make_user(), make_user()
        upload(client, me)

        assert client.get("/api/auth/me", headers=auth_headers(me)).json()["avatar_url"].startswith("/api/users/")
        assert client.get("/api/auth/me", headers=auth_headers(other)).json()["avatar_url"] is None

    def test_accepts_png_and_webp(self, client, make_user):
        me = make_user()

        assert upload(client, me, PNG, "image/png").status_code == 200
        assert upload(client, me, WEBP, "image/webp").status_code == 200

    def test_replacing_changes_the_picture(self, client, make_user):
        me = make_user()
        upload(client, me, JPEG, "image/jpeg")

        upload(client, me, PNG, "image/png")

        response = client.get(f"/api/users/{me.id}/avatar")
        assert response.headers["content-type"] == "image/png"
        assert response.content == PNG

    def test_rejects_other_file_types(self, client, make_user):
        response = upload(client, make_user(), b"GIF89a" + b"\x00" * 10, "image/gif")

        assert response.status_code == 422
        assert response.json()["detail"][0]["type"] == "avatar_type"

    def test_rejects_a_file_that_isnt_what_it_claims(self, client, make_user):
        response = upload(client, make_user(), b"<script>alert(1)</script>", "image/jpeg")

        assert response.status_code == 422
        assert response.json()["detail"][0]["type"] == "avatar_not_image"

    def test_rejects_files_over_512_kb(self, client, make_user):
        response = upload(client, make_user(), JPEG + b"\x00" * (512 * 1024))

        assert response.status_code == 422
        assert response.json()["detail"][0]["type"] == "avatar_too_large"

    def test_needs_a_login(self, client):
        response = client.put("/api/me/avatar", files={"file": ("me.jpg", JPEG, "image/jpeg")})

        assert response.status_code == 401


class TestServe:
    def test_serves_the_bytes_with_long_caching_and_no_login(self, client, make_user):
        me = make_user()
        upload(client, me)

        response = client.get(f"/api/users/{me.id}/avatar")

        assert response.status_code == 200
        assert response.content == JPEG
        assert response.headers["content-type"] == "image/jpeg"
        assert "immutable" in response.headers["cache-control"]
        assert response.headers["x-content-type-options"] == "nosniff"

    def test_404_without_a_picture(self, client, make_user):
        assert client.get(f"/api/users/{make_user().id}/avatar").status_code == 404


class TestDelete:
    def test_removes_my_picture(self, client, make_user):
        me = make_user()
        upload(client, me)

        response = client.delete("/api/me/avatar", headers=auth_headers(me))

        assert response.status_code == 204
        assert client.get(f"/api/users/{me.id}/avatar").status_code == 404
        assert client.get("/api/auth/me", headers=auth_headers(me)).json()["avatar_url"] is None

    def test_deleting_when_there_is_none_is_fine(self, client, make_user):
        assert client.delete("/api/me/avatar", headers=auth_headers(make_user())).status_code == 204


class TestShownElsewhere:
    def test_approvals_include_the_requesters_picture(self, client, db, make_user):
        from datetime import UTC, datetime, timedelta

        from app.models import Enrollment, EnrollmentStatus, Level, Training

        lead = make_user()
        employee = make_user(team_lead=lead)
        upload(client, employee)
        training = Training(
            name="T",
            description="d",
            starts_at=datetime.now(UTC) + timedelta(days=3),
            ends_at=datetime.now(UTC) + timedelta(days=3, hours=2),
            max_seats=5,
            created_by=lead,
            levels=[Level.JUNIOR],
        )
        db.add(training)
        db.flush()
        db.add(Enrollment(training_id=training.id, user_id=employee.id, status=EnrollmentStatus.PENDING))
        db.flush()

        items = client.get("/api/approvals", headers=auth_headers(lead)).json()

        assert items[0]["user"]["avatar_url"].startswith(f"/api/users/{employee.id}/avatar?v=")

    def test_seat_map_includes_the_occupants_picture(self, client, db, make_user):
        from datetime import date, timedelta

        from app.models import Client, Seat, SeatReservation

        me, colleague = make_user(client=Client.DKB), make_user(client=Client.DKB)
        upload(client, colleague)
        seat = Seat(label="DKB-01", zone=Client.DKB, pos_x=0, pos_y=0)
        db.add(seat)
        day = date.today() + timedelta(days=1)
        while day.weekday() >= 5:
            day += timedelta(days=1)
        db.flush()
        db.add(SeatReservation(seat_id=seat.id, user_id=colleague.id, date=day))
        db.flush()

        seats = client.get(f"/api/seats?date={day}", headers=auth_headers(me)).json()

        taken = next(s for s in seats if s["label"] == "DKB-01")
        assert taken["taken_by"]["avatar_url"].startswith(f"/api/users/{colleague.id}/avatar?v=")
