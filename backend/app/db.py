import hashlib
import json
import os
import secrets
import sqlite3
from contextlib import closing
from pathlib import Path

SEED_BOARD = Path(__file__).parent / "seed_board.json"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS boards (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


def db_path() -> Path:
    return Path(os.environ.get("DB_PATH", "data/app.db"))


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path(), autocommit=True)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    salt, digest = stored.split("$")
    candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1)
    return secrets.compare_digest(candidate.hex(), digest)


def init_db():
    db_path().parent.mkdir(parents=True, exist_ok=True)
    with closing(connect()) as conn:
        conn.executescript(SCHEMA)
    if get_user("user") is None:
        create_user("user", "password")


def create_user(username: str, password: str) -> int:
    with closing(connect()) as conn:
        cursor = conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, hash_password(password)),
        )
        return cursor.lastrowid


def get_user(username: str) -> tuple[int, str] | None:
    """Return (id, password_hash) or None."""
    with closing(connect()) as conn:
        return conn.execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()


def get_board(user_id: int) -> dict:
    """Return the user's board, inserting the seed board if they have none."""
    with closing(connect()) as conn:
        row = conn.execute("SELECT data FROM boards WHERE user_id = ?", (user_id,)).fetchone()
        if row:
            return json.loads(row[0])
        data = SEED_BOARD.read_text()
        conn.execute("INSERT INTO boards (user_id, data) VALUES (?, ?)", (user_id, data))
        return json.loads(data)


def save_board(user_id: int, board: dict):
    with closing(connect()) as conn:
        conn.execute(
            """INSERT INTO boards (user_id, data) VALUES (?, ?)
               ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP""",
            (user_id, json.dumps(board)),
        )
