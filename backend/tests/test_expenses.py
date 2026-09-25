"""Expenses: submit with receipts, approved by the team lead and then by HR."""

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.models import Level, Notification, NotificationType
from app.services.expenses import MAX_RECEIPT_BYTES
from app.services.seats import office_today
from tests.conftest import auth_headers

PDF = b"%PDF-1.7\nreceipt\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
TODAY = office_today()


@pytest.fixture
def admin(make_user):
    return make_user(name="Alex Admin", is_admin=True, level=Level.SENIOR_ARCHITECT)


@pytest.fixture
def hr(make_user):
    return make_user(name="Helena Ribeiro", is_hr=True)


@pytest.fixture
def lead(make_user):
    return make_user(name="Sofia Martins")


@pytest.fixture
def joao(make_user, lead):
    return make_user(name="João Silva", team_lead=lead)


def submit(client, user, receipts=None, **fields):
    data = {"title": "Taxi to the client", "category": "travel", "amount": "12.50", "spent_on": TODAY.isoformat()}
    data |= fields
    files = [("receipts", (name, content, "application/octet-stream")) for name, content in (receipts or [("taxi.pdf", PDF)])]
    return client.post("/api/expenses", headers=auth_headers(user), data=data, files=files)


def act(client, user, expense_id, action, **body):
    return client.post(f"/api/expenses/{expense_id}/{action}", headers=auth_headers(user), json=body or None)


def notified(db, user, type_) -> list[str]:
    rows = db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.type == type_))
    return [n.message for n in rows]


def approvals(client, user) -> list[int]:
    return [e["id"] for e in client.get("/api/expense-approvals", headers=auth_headers(user)).json()]


# --- submitting ---


def test_an_expense_goes_to_the_team_lead_first(client, db, joao, lead, hr):
    response = submit(client, joao, receipts=[("taxi.pdf", PDF), ("Recibo café.png", PNG)])

    assert response.status_code == 201
    body = response.json()
    assert {k: body[k] for k in ("title", "category", "amount", "currency", "status", "waiting_for")} == {
        "title": "Taxi to the client",
        "category": "travel",
        "amount": "12.50",  # a string: JavaScript would read a JSON number as a float
        "currency": "EUR",
        "status": "pending_lead",
        "waiting_for": "Sofia Martins",
    }
    assert [(r["filename"], r["content_type"]) for r in body["receipts"]] == [
        ("taxi.pdf", "application/pdf"),
        ("Recibo café.png", "image/png"),
    ]
    assert notified(db, lead, NotificationType.EXPENSE_SUBMITTED) == [
        "João Silva submitted an expense: Taxi to the client (€12.50)"
    ]
    assert notified(db, hr, NotificationType.EXPENSE_SUBMITTED) == []  # not HR's turn yet


def test_without_a_team_lead_it_goes_straight_to_hr(client, db, make_user, hr, admin):
    rafael = make_user(name="Rafael Nunes")

    body = submit(client, rafael).json()

    assert (body["status"], body["waiting_for"]) == ("pending_hr", "HR")
    assert len(notified(db, hr, NotificationType.EXPENSE_SUBMITTED)) == 1
    assert notified(db, admin, NotificationType.EXPENSE_SUBMITTED) == []  # HR exists, so admins aren't bothered


def test_while_nobody_has_the_hr_role_the_admins_are_told(client, db, make_user, admin):
    submit(client, make_user(name="Rafael Nunes"))

    assert len(notified(db, admin, NotificationType.EXPENSE_SUBMITTED)) == 1


@pytest.mark.parametrize(
    ("fields", "receipts", "error_type"),
    [
        ({"amount": "0"}, None, "greater_than"),
        ({"amount": "12.345"}, None, "decimal_max_places"),
        ({"amount": "10000.01"}, None, "less_than_equal"),
        ({"title": "   "}, None, "string_too_short"),
        ({"category": "casino"}, None, "enum"),
        ({"spent_on": (TODAY + timedelta(days=1)).isoformat()}, None, "spent_in_future"),
        ({"spent_on": (TODAY - timedelta(days=91)).isoformat()}, None, "spent_too_long_ago"),
        ({}, [("r.pdf", PDF)] * 6, "receipt_count"),
        ({}, [("receipt.html", b"<html>")], "receipt_type"),
        ({}, [("receipt.png", PDF)], "receipt_mismatch"),
        ({}, [("receipt.pdf", b"")], "receipt_empty"),
        ({}, [("scan.pdf", PDF + b"x" * MAX_RECEIPT_BYTES)], "receipt_too_large"),
    ],
)
def test_invalid_expenses_are_refused(client, joao, fields, receipts, error_type):
    response = submit(client, joao, receipts=receipts, **fields)

    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == error_type


def test_at_least_one_receipt_is_needed(client, joao):
    data = {"title": "Taxi", "category": "travel", "amount": "12.50", "spent_on": TODAY.isoformat()}
    response = client.post("/api/expenses", headers=auth_headers(joao), data=data)

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "receipts"]


# --- the two approvals ---


def test_lead_then_hr_approve_it(client, db, joao, lead, hr):
    expense_id = submit(client, joao).json()["id"]
    assert approvals(client, lead) == [expense_id]
    assert approvals(client, hr) == []

    after_lead = act(client, lead, expense_id, "approve").json()
    assert (after_lead["status"], after_lead["waiting_for"]) == ("pending_hr", "HR")
    assert notified(db, joao, NotificationType.EXPENSE_LEAD_APPROVED) == [
        "Sofia Martins approved your expense Taxi to the client: it's with HR now"
    ]
    assert approvals(client, lead) == []
    assert approvals(client, hr) == [expense_id]

    done = act(client, hr, expense_id, "approve").json()
    assert (done["status"], done["waiting_for"]) == ("approved", None)
    assert (done["lead_decision"]["by"]["name"], done["lead_decision"]["approved"]) == ("Sofia Martins", True)
    assert (done["hr_decision"]["by"]["name"], done["hr_decision"]["approved"]) == ("Helena Ribeiro", True)
    assert notified(db, joao, NotificationType.EXPENSE_APPROVED) == ["Your expense Taxi to the client (€12.50) was approved"]


def test_admins_can_give_the_hr_approval(client, joao, lead, admin):
    expense_id = submit(client, joao).json()["id"]
    act(client, lead, expense_id, "approve")

    assert act(client, admin, expense_id, "approve").json()["status"] == "approved"


def test_each_step_has_its_own_decider(client, make_user, joao, lead, hr):
    expense_id = submit(client, joao).json()["id"]

    assert act(client, hr, expense_id, "approve").status_code == 403  # HR can't skip the team lead
    assert act(client, make_user(), expense_id, "approve").status_code == 404  # a stranger can't even see it
    act(client, lead, expense_id, "approve")
    assert act(client, lead, expense_id, "approve").status_code == 403  # the lead isn't HR


def test_nobody_approves_their_own_expense(client, hr):
    expense_id = submit(client, hr).json()["id"]  # HR without a team lead: waits for HR

    assert expense_id not in approvals(client, hr)
    assert act(client, hr, expense_id, "approve").status_code == 403


def test_two_different_people_approve_every_expense(client, make_user):
    lead_in_hr = make_user(name="Hana Lead", is_hr=True)
    report = make_user(team_lead=lead_in_hr)
    expense_id = submit(client, report).json()["id"]
    act(client, lead_in_hr, expense_id, "approve")

    response = act(client, lead_in_hr, expense_id, "approve")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "second_approver_needed"
    assert expense_id not in approvals(client, lead_in_hr)


def test_a_decided_expense_cannot_be_decided_again(client, joao, lead, hr):
    expense_id = submit(client, joao).json()["id"]
    act(client, lead, expense_id, "approve")
    act(client, hr, expense_id, "approve")

    response = act(client, hr, expense_id, "reject", reason="Changed my mind")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "not_pending"


# --- rejecting and withdrawing ---


def test_rejecting_needs_a_reason_the_submitter_sees(client, db, joao, lead):
    expense_id = submit(client, joao).json()["id"]
    assert act(client, lead, expense_id, "reject", reason="  ").status_code == 422

    body = act(client, lead, expense_id, "reject", reason="This was a personal trip").json()

    assert (body["status"], body["rejection_reason"], body["waiting_for"]) == ("rejected", "This was a personal trip", None)
    assert (body["lead_decision"]["approved"], body["hr_decision"]) == (False, None)
    assert notified(db, joao, NotificationType.EXPENSE_REJECTED) == [
        "Sofia Martins rejected your expense Taxi to the client: This was a personal trip"
    ]


def test_hr_can_reject_after_the_lead_approved(client, joao, lead, hr):
    expense_id = submit(client, joao).json()["id"]
    act(client, lead, expense_id, "approve")

    body = act(client, hr, expense_id, "reject", reason="No VAT number on the receipt").json()

    assert body["status"] == "rejected"
    assert (body["lead_decision"]["approved"], body["hr_decision"]["approved"]) == (True, False)


def test_the_submitter_can_withdraw_while_it_is_pending(client, joao, lead, hr):
    first = submit(client, joao).json()["id"]
    second = submit(client, joao).json()["id"]
    act(client, lead, second, "approve")
    act(client, hr, second, "approve")

    assert act(client, lead, first, "withdraw").status_code == 403  # only the submitter
    assert act(client, joao, first, "withdraw").json()["status"] == "withdrawn"
    assert act(client, joao, second, "withdraw").json()["detail"]["code"] == "not_withdrawable"
    assert approvals(client, lead) == []


# --- reading ---


def test_my_expenses_are_newest_first(client, joao):
    ids = [submit(client, joao, title=f"Expense {n}").json()["id"] for n in range(3)]

    body = client.get("/api/me/expenses", headers=auth_headers(joao)).json()

    assert [e["id"] for e in body] == ids[::-1]


def test_who_can_open_an_expense_and_its_receipts(client, make_user, joao, lead, hr):
    expense = submit(client, joao, receipts=[("Recibo café.pdf", PDF)]).json()
    url = f"/api/expenses/{expense['id']}"
    receipt_url = f"{url}/receipts/{expense['receipts'][0]['id']}/file"

    for viewer in (joao, lead, hr):
        assert client.get(url, headers=auth_headers(viewer)).status_code == 200
    assert client.get(url, headers=auth_headers(make_user())).status_code == 404

    response = client.get(receipt_url, headers=auth_headers(hr))
    assert response.content == PDF
    assert response.headers["content-disposition"].startswith("attachment;")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert client.get(receipt_url, headers=auth_headers(make_user())).status_code == 404
