# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Project requirements, color scheme and coding standards live in AGENTS.md (imported below). Read docs/PLAN.md before starting work: it records agreed decisions and which parts are done. Work stops for user review at the end of every plan part; tick the checkboxes in PLAN.md and update the relevant AGENTS.md when a part changes code.

@AGENTS.md

## Commands

Run the app (builds the Docker image, runs container `pm` on http://localhost:8000; takes about 5s to accept requests, poll `/api/health`):

```
scripts/start.ps1    # Windows      scripts/start.sh  # Mac/Linux
scripts/stop.ps1     #              scripts/stop.sh
docker volume rm pm-data   # reset the SQLite database
```

Frontend (in `frontend/`):

```
npm run build                         # static export to frontend/out (needed before backend tests)
npm run lint
npm run test:unit                     # Vitest
npx vitest run src/lib/kanban.test.ts # single file; add -t "name" for one test
npm run test:e2e                      # Playwright; needs the container running (scripts/start.*)
npx playwright test tests/auth.spec.ts
```

Backend: uv is not installed on the host. Build the frontend first, then from the project root:

```
docker run --rm -v "$PWD/backend:/src:ro" -v "$PWD/frontend/out:/out:ro" ghcr.io/astral-sh/uv:python3.15-trixie-slim sh -c "cp -r /src /app && cp -r /out /app/static && cd /app && uv sync --locked -q && uv run pytest -q"
```

Append a pytest selector (e.g. `uv run pytest -q tests/test_board.py::test_name`) for a single test. Add `--env-file .env` to the `docker run` to include the live OpenRouter test (skipped without `OPENROUTER_API_KEY`).

## Architecture

One Docker image, multi-stage: Node builds the NextJS static export (`output: "export"`), the Python stage copies it to `backend/static/` and FastAPI serves it at `/` (mounted last so `/api/*` wins). There is no Next server at runtime, so no server components, API routes or middleware in the frontend.

- Board data shape is shared across layers: `BoardData = { columns: [{id, title, cardIds}], cards: {id: {id, title, details}} }`. Defined in `frontend/src/lib/kanban.ts`, Pydantic `BoardData` in `backend/app/board.py`, JSON Schema in `docs/board.schema.json`. Change all three together.
- Persistence: SQLite (`backend/app/db.py`, stdlib `sqlite3`), `users` and `boards` tables; each board is one JSON blob per user. Board is seeded from `backend/app/seed_board.json` on first `GET /api/board`. Details in docs/DATABASE.md.
- Validation: `board.save(user_id, board)` is the single save path for both `PUT /api/board` and AI chat. It enforces cross-references (cards in exactly one column, keys match ids) and that column ids match the stored board (exactly 5 fixed columns; rename only).
- Auth: Starlette `SessionMiddleware` signed cookie; `current_user` / `current_user_id` dependencies in `auth.py` guard routes. Default account "user"/"password" is created at startup.
- AI: `POST /api/chat` uses the `openai` SDK against OpenRouter (`openai/gpt-oss-120b`) with Structured Outputs (`chat.completions.parse` with `AIResponse`). The AI returns the whole board with cards as a list (strict mode forbids arbitrary-key objects); the backend converts it to the map, validates and saves. Invalid AI boards return 200 with `board: null` and a note in the reply. Chat history lives only in the browser and is sent each request. Tests override the `ai.get_client` dependency with a mock.
- Tests: `backend/tests/conftest.py` gives each test a temp `DB_PATH` plus `client` / `signed_in` fixtures. Playwright runs against the real container, not a dev server, and signs in via `frontend/tests/helpers.ts`.

## Current state

Part 7 (frontend load/save through `/api/board`) is not done: `KanbanBoard` starts from `initialData` and manual edits are not persisted, while AI chat reads and saves the stored board and replaces the on-screen board with it.

Per-area notes: `backend/AGENTS.md`, `frontend/AGENTS.md`, `scripts/AGENTS.md`.
