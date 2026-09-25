from sqlalchemy import text


def test_root_returns_200(client):
    response = client.get("/api/")

    assert response.status_code == 200
    assert response.json() == {"message": "Hello from FastAPI"}


def test_health_db_uses_the_test_database(client, db):
    response = client.get("/api/health/db")

    assert response.status_code == 200
    assert response.json() == {"database": "ok"}
    assert db.execute(text("SELECT DATABASE()")).scalar().endswith("_test")
