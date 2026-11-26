import json
import sqlite3

from app import db


def test_db_created_with_tables(client, temp_db):
    assert temp_db.exists()
    with sqlite3.connect(temp_db) as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"users", "boards"} <= tables


def test_user_seeded_with_hashed_password(client):
    user_id, password_hash = db.get_user("user")
    assert password_hash != "password"
    assert db.verify_password("password", password_hash)
    assert not db.verify_password("wrong", password_hash)


def test_get_returns_seeded_board(signed_in):
    response = signed_in.get("/api/board")
    assert response.status_code == 200
    board = response.json()
    assert board == json.loads(db.SEED_BOARD.read_text())
    assert [c["title"] for c in board["columns"]] == ["Backlog", "Discovery", "In Progress", "Review", "Done"]


def test_put_then_get_round_trips(signed_in):
    board = signed_in.get("/api/board").json()
    board["columns"][0]["title"] = "Ideas"
    board["cards"]["card-x"] = {"id": "card-x", "title": "New", "details": ""}
    board["columns"][1]["cardIds"].append("card-x")
    board["columns"][4]["cardIds"].append(board["columns"][0]["cardIds"].pop())

    assert signed_in.put("/api/board", json=board).status_code == 200
    assert signed_in.get("/api/board").json() == board


def invalid(signed_in, change):
    board = signed_in.get("/api/board").json()
    change(board)
    response = signed_in.put("/api/board", json=board)
    assert response.status_code == 422
    assert signed_in.get("/api/board").json() != board


def test_rejects_dangling_card_id(signed_in):
    invalid(signed_in, lambda b: b["columns"][0]["cardIds"].append("missing"))


def test_rejects_card_not_in_any_column(signed_in):
    invalid(signed_in, lambda b: b["cards"].update(orphan={"id": "orphan", "title": "O", "details": ""}))


def test_rejects_card_in_two_columns(signed_in):
    invalid(signed_in, lambda b: b["columns"][1]["cardIds"].append(b["columns"][0]["cardIds"][0]))


def test_rejects_mismatched_card_key(signed_in):
    invalid(signed_in, lambda b: b["cards"]["card-1"].update(id="other"))


def test_rejects_missing_column(signed_in):
    invalid(signed_in, lambda b: b["columns"].pop())


def test_rejects_reordered_columns(signed_in):
    invalid(signed_in, lambda b: b["columns"].reverse())


def test_rejects_empty_card_title(signed_in):
    invalid(signed_in, lambda b: b["cards"]["card-1"].update(title=""))


def test_routes_require_session(client):
    assert client.get("/api/board").status_code == 401
    assert client.put("/api/board", json={}).status_code == 401


def test_users_have_separate_boards(client):
    db.create_user("other", "secret")
    client.post("/api/login", json={"username": "user", "password": "password"})
    board = client.get("/api/board").json()
    board["columns"][0]["title"] = "Mine"
    client.put("/api/board", json=board)

    client.post("/api/logout")
    client.post("/api/login", json={"username": "other", "password": "secret"})
    assert client.get("/api/board").json()["columns"][0]["title"] == "Backlog"


def test_board_survives_app_restart(signed_in):
    board = signed_in.get("/api/board").json()
    board["columns"][0]["title"] = "Persisted"
    signed_in.put("/api/board", json=board)
    db.init_db()
    assert signed_in.get("/api/board").json()["columns"][0]["title"] == "Persisted"
