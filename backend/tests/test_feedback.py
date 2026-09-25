"""Ratings and comments after a completed training."""

from datetime import UTC, datetime, timedelta

import pytest

from app.models import Enrollment, EnrollmentStatus, Level, Training
from tests.conftest import auth_headers


@pytest.fixture
def make_training(db, make_user):
    def _make(days_ago=3, cancelled=False, trainer=None, levels=(Level.JUNIOR,)):
        start = datetime.now(UTC) - timedelta(days=days_ago)
        training = Training(
            name="Past training",
            description="d",
            starts_at=start,
            ends_at=start + timedelta(hours=2),
            max_seats=10,
            created_by=make_user(is_admin=True),
            trainer=trainer,
            levels=list(levels),
            cancelled_at=start - timedelta(days=1) if cancelled else None,
        )
        db.add(training)
        db.flush()
        return training

    return _make


@pytest.fixture
def attend(db):
    def _attend(training, user, status=EnrollmentStatus.APPROVED):
        db.add(Enrollment(training_id=training.id, user_id=user.id, status=status))
        db.flush()

    return _attend


def rate(client, user, training, rating=5, comment=None):
    return client.put(
        f"/api/trainings/{training.id}/feedback", headers=auth_headers(user), json={"rating": rating, "comment": comment}
    )


class TestRate:
    def test_someone_who_completed_it_can_rate_and_comment(self, client, make_user, make_training, attend):
        me, training = make_user(), make_training()
        attend(training, me)

        response = rate(client, me, training, 4, "  Very practical  ")

        assert response.status_code == 200
        assert (response.json()["rating"], response.json()["comment"]) == (4, "Very practical")

    def test_rating_again_edits_it(self, client, make_user, make_training, attend):
        me, training = make_user(), make_training()
        attend(training, me)
        rate(client, me, training, 2)

        rate(client, me, training, 5, "Better on reflection")

        summary = client.get(f"/api/trainings/{training.id}/feedback", headers=auth_headers(me)).json()
        assert (summary["rating_count"], summary["mine"]["rating"]) == (1, 5)

    @pytest.mark.parametrize(
        ("days_ago", "cancelled", "status"),
        [
            (-3, False, EnrollmentStatus.APPROVED),  # not happened yet
            (3, True, EnrollmentStatus.APPROVED),  # cancelled
            (3, False, EnrollmentStatus.PENDING),  # never approved
            (3, False, EnrollmentStatus.WITHDRAWN),  # withdrew
        ],
    )
    def test_only_after_completing_it(self, client, make_user, make_training, attend, days_ago, cancelled, status):
        me, training = make_user(), make_training(days_ago=days_ago, cancelled=cancelled)
        attend(training, me, status)

        response = rate(client, me, training)

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "not_completed"

    def test_a_person_who_didnt_attend_gets_409(self, client, make_user, make_training):
        response = rate(client, make_user(), make_training())

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "not_completed"

    @pytest.mark.parametrize("rating", [0, 6])
    def test_rating_is_1_to_5(self, client, make_user, make_training, attend, rating):
        me, training = make_user(), make_training()
        attend(training, me)

        assert rate(client, me, training, rating).status_code == 422

    def test_another_levels_training_is_404(self, client, make_user, make_training):
        response = rate(client, make_user(level=Level.SENIOR), make_training(levels=(Level.JUNIOR,)))

        assert response.status_code == 404


class TestSummary:
    def test_average_count_and_mine_for_everyone(self, client, make_user, make_training, attend):
        a, b, other = make_user(), make_user(), make_user()
        training = make_training()
        for person, stars in ((a, 5), (b, 4)):
            attend(training, person)
            rate(client, person, training, stars)

        mine = client.get(f"/api/trainings/{training.id}/feedback", headers=auth_headers(a)).json()
        theirs = client.get(f"/api/trainings/{training.id}/feedback", headers=auth_headers(other)).json()

        assert (mine["average_rating"], mine["rating_count"], mine["mine"]["rating"], mine["can_rate"]) == (4.5, 2, 5, True)
        assert (theirs["mine"], theirs["can_rate"]) == (None, False)

    def test_comments_with_names_only_for_admins_and_the_trainer(self, client, make_user, make_training, attend):
        trainer, attendee, colleague = make_user(name="Trainer"), make_user(name="Ana"), make_user()
        admin = make_user(is_admin=True)
        training = make_training(trainer=trainer)
        attend(training, attendee)
        rate(client, attendee, training, 3, "Too fast")

        for viewer in (admin, trainer):
            body = client.get(f"/api/trainings/{training.id}/feedback", headers=auth_headers(viewer)).json()
            assert [(c["user"]["name"], c["rating"], c["comment"]) for c in body["comments"]] == [("Ana", 3, "Too fast")]
        hidden = client.get(f"/api/trainings/{training.id}/feedback", headers=auth_headers(colleague)).json()
        assert hidden["comments"] is None

    def test_trainings_carry_the_average_and_my_rating(self, client, make_user, make_training, attend):
        me = make_user()
        training = make_training()
        attend(training, me)
        rate(client, me, training, 4)

        body = client.get(f"/api/trainings/{training.id}", headers=auth_headers(me)).json()

        assert (body["average_rating"], body["rating_count"], body["my_rating"]) == (4.0, 1, 4)

    def test_no_ratings_means_null_average(self, client, make_user, make_training):
        me = make_user()
        body = client.get(f"/api/trainings/{make_training().id}", headers=auth_headers(me)).json()

        assert (body["average_rating"], body["rating_count"], body["my_rating"]) == (None, 0, None)
