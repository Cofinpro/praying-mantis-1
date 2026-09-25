"""Training materials: who may upload, see, download and delete them, and which files are accepted."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import Enrollment, EnrollmentStatus, Level, Notification, NotificationType, Training, TrainingMaterial
from app.services.materials import MAX_BYTES, MAX_FILES
from tests.conftest import auth_headers

NOW = datetime.now(UTC).replace(microsecond=0)
PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"


@pytest.fixture
def admin(make_user):
    return make_user(name="Alex Admin", is_admin=True, level=Level.SENIOR_ARCHITECT)


@pytest.fixture
def trainer(make_user):
    return make_user(name="Pedro Alves", level=Level.SENIOR)


@pytest.fixture
def joao(make_user):
    return make_user(name="João Silva", level=Level.JUNIOR)


@pytest.fixture
def training(db, admin, trainer):
    starts_at = NOW + timedelta(days=3)
    training = Training(
        name="Git basics",
        description="About it",
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=2),
        max_seats=5,
        created_by=admin,
        trainer=trainer,
        levels=[Level.JUNIOR],
    )
    db.add(training)
    db.flush()
    return training


def upload(client, user, training, filename="slides.pdf", data=PDF):
    return client.post(
        f"/api/trainings/{training.id}/materials",
        headers=auth_headers(user),
        files={"file": (filename, data, "application/octet-stream")},
    )


def url(training, suffix=""):
    return f"/api/trainings/{training.id}/materials{suffix}"


# --- uploading ---


@pytest.mark.parametrize("who", ["admin", "trainer"])
def test_admins_and_the_trainer_can_upload(client, request, training, who):
    response = upload(client, request.getfixturevalue(who), training)

    assert response.status_code == 201
    body = response.json()
    assert (body["filename"], body["content_type"], body["size"]) == ("slides.pdf", "application/pdf", len(PDF))
    assert body["uploaded_by"]["name"] == request.getfixturevalue(who).name


def test_participants_cannot_upload_or_delete(client, db, training, trainer, joao):
    material_id = upload(client, trainer, training).json()["id"]

    assert upload(client, joao, training).status_code == 403
    assert client.delete(url(training, f"/{material_id}"), headers=auth_headers(joao)).status_code == 403


def test_everyone_enrolled_is_told_about_a_new_file(client, db, training, trainer, joao, make_user):
    rejected = make_user(level=Level.JUNIOR)
    db.add_all([
        Enrollment(training_id=training.id, user_id=joao.id, status=EnrollmentStatus.APPROVED),
        Enrollment(training_id=training.id, user_id=rejected.id, status=EnrollmentStatus.REJECTED),
    ])
    db.flush()

    upload(client, trainer, training, "Exercises.zip", b"PK\x03\x04rest")

    rows = db.scalars(select(Notification).where(Notification.type == NotificationType.MATERIAL_ADDED)).all()
    assert [(n.user_id, n.message) for n in rows] == [(joao.id, "New material for Git basics: Exercises.zip")]


@pytest.mark.parametrize(
    ("filename", "data", "error_type"),
    [
        ("notes.exe", b"MZ...", "material_type"),
        ("page.html", b"<script>alert(1)</script>", "material_type"),
        ("slides.pdf", b"", "material_empty"),
        ("slides.pdf", b"not a pdf at all", "material_mismatch"),
        ("photo.png", PDF, "material_mismatch"),
        ("notes.txt", b"\xff\xfe\x00binary", "material_mismatch"),
        ("slides.pdf", PDF + b"x" * MAX_BYTES, "material_too_large"),
    ],
)
def test_only_real_files_of_the_allowed_types_are_accepted(client, admin, training, filename, data, error_type):
    response = upload(client, admin, training, filename, data)

    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == error_type


def test_folders_in_the_name_are_dropped(client, admin, training):
    response = upload(client, admin, training, "..\\..\\Users\\me\\Sessão 1.pdf")

    assert response.json()["filename"] == "Sessão 1.pdf"


def test_a_cancelled_training_takes_no_new_files(client, db, admin, training):
    training.cancelled_at = NOW
    db.flush()

    response = upload(client, admin, training)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "training_cancelled"


def test_a_training_holds_at_most_20_files(client, db, admin, training):
    db.add_all(
        TrainingMaterial(training_id=training.id, filename=f"{i}.pdf", content_type="application/pdf", size=1, data=b"x")
        for i in range(MAX_FILES)
    )
    db.flush()

    response = upload(client, admin, training)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "too_many_materials"


# --- seeing and downloading ---


def test_people_of_the_trainings_level_see_and_download_the_files(client, training, trainer, joao):
    upload(client, trainer, training, "Sessão 1.pdf")

    [material] = client.get(url(training), headers=auth_headers(joao)).json()
    response = client.get(url(training, f"/{material['id']}/file"), headers=auth_headers(joao))

    assert response.status_code == 200
    assert response.content == PDF
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"] == (
        "attachment; filename=\"Sess?o 1.pdf\"; filename*=UTF-8''Sess%C3%A3o%201.pdf"
    )
    assert response.headers["x-content-type-options"] == "nosniff"


def test_files_are_listed_oldest_first(client, trainer, training):
    for name in ["1-intro.pdf", "2-exercises.md"]:
        upload(client, trainer, training, name, PDF if name.endswith(".pdf") else "# Übungen".encode())

    names = [m["filename"] for m in client.get(url(training), headers=auth_headers(trainer)).json()]

    assert names == ["1-intro.pdf", "2-exercises.md"]


def test_other_levels_get_a_404(client, training, trainer, make_user):
    material_id = upload(client, trainer, training).json()["id"]
    expert = make_user(level=Level.EXPERT)

    assert client.get(url(training), headers=auth_headers(expert)).status_code == 404
    assert client.get(url(training, f"/{material_id}/file"), headers=auth_headers(expert)).status_code == 404


# --- deleting ---


def test_deleting_a_file(client, admin, training):
    material_id = upload(client, admin, training).json()["id"]

    response = client.delete(url(training, f"/{material_id}"), headers=auth_headers(admin))

    assert response.status_code == 204
    assert client.get(url(training), headers=auth_headers(admin)).json() == []


def test_a_file_belongs_to_its_training(client, db, admin, training):
    material_id = upload(client, admin, training).json()["id"]
    other = Training(
        name="Other", description="x", starts_at=training.starts_at, ends_at=training.ends_at,
        max_seats=1, created_by=admin, levels=[Level.JUNIOR],
    )
    db.add(other)
    db.flush()

    assert client.get(url(other, f"/{material_id}/file"), headers=auth_headers(admin)).status_code == 404
    assert client.delete(url(other, f"/{material_id}"), headers=auth_headers(admin)).status_code == 404
