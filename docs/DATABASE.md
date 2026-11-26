# Database

SQLite, accessed with Python's built-in `sqlite3` module (no ORM). One file, created with its tables on startup if missing.

## Approach

Each user has one board, and the whole board is stored as a single JSON value in the same shape as the frontend `BoardData` type. The frontend and the AI always read and write the full board, so there is nothing to gain from splitting columns and cards into their own tables. Supporting more boards per user later only means dropping the `UNIQUE` on `boards.user_id`.

## Tables

```sql
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
```

- `PRAGMA foreign_keys = ON` is set on every connection.
- Timestamps are UTC text (`YYYY-MM-DD HH:MM:SS`).
- `password_hash` uses the standard library's `hashlib.scrypt`, stored as `salt$hash` in hex. On startup the "user" account is created with the password "password" if it does not exist, and login checks the `users` table instead of the hardcoded values in `auth.py`. Sign-in behaves the same, but more users can be added later without code changes.

## Board JSON (`boards.data`)

Defined by [board.schema.json](board.schema.json):

```json
{
  "columns": [
    { "id": "col-backlog", "title": "Backlog", "cardIds": ["card-1", "card-2"] }
  ],
  "cards": {
    "card-1": { "id": "card-1", "title": "Align roadmap themes", "details": "..." }
  }
}
```

- `columns`: exactly 5, in display order. Each column has its `cardIds` in display order.
- `cards`: every card on the board, keyed by its id.

JSON Schema cannot express the cross-references, so the backend's Pydantic models also check that:

1. every key in `cards` equals that card's `id`
2. every id in a column's `cardIds` exists in `cards`
3. every card appears in exactly one column
4. column ids are unique, and on save they match the stored board's column ids (columns can be renamed but not added, removed or reordered)

A board that fails any check is rejected with 422 and not saved.

## Seeding

- The seed board is the current demo data (`initialData` in `frontend/src/lib/kanban.ts`), copied to `backend/app/seed_board.json`.
- When a user's board is first requested (`GET /api/board`) and none exists, the seed board is inserted and returned.

## Location

- Path from the `DB_PATH` env var, default `data/app.db` relative to the backend (`/app/data/app.db` in the container). Tests point `DB_PATH` at a temp file.
- The start scripts mount a named Docker volume `pm-data` at `/app/data`, so data survives container restarts and rebuilds. `docker volume rm pm-data` resets it.

## Note for Part 9 (AI)

OpenAI-style Structured Outputs in strict mode do not allow objects with arbitrary keys, like the `cards` map. The AI response model will therefore use a card list (`cards: [Card]`), and the backend converts it to the stored map before validating and saving.
