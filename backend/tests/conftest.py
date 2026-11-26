import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    path = tmp_path / "data" / "test.db"
    monkeypatch.setenv("DB_PATH", str(path))
    return path


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


@pytest.fixture
def signed_in(client):
    client.post("/api/login", json={"username": "user", "password": "password"})
    return client
