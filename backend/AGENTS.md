# Backend

Python FastAPI app, managed with uv (Python 3.15).

- `app/main.py`: FastAPI app. `GET /api/health` returns `{"status": "ok"}`. The NextJS export is served from `static/` at `/` (mounted last so `/api` routes take precedence). `static/` is not in git: the Dockerfile copies `frontend/out` there.
- `app/auth.py`: `POST /api/login` (checks the `users` table), `POST /api/logout`, `GET /api/me` (401 if not signed in). `current_user(request)` returns the username, `current_user_id(request)` the user's id; both raise 401 if not signed in.
- `app/db.py`: SQLite via stdlib `sqlite3`, a new connection per call. `init_db()` (run at startup) creates tables and the "user"/"password" account; `get_board` (seeds from `app/seed_board.json` if missing), `save_board`, `create_user`, scrypt password hashing. Path from `DB_PATH`, default `data/app.db`. See docs/DATABASE.md.
- `app/board.py`: Pydantic `BoardData` model with cross-reference checks; `GET /api/board`, `PUT /api/board` (422 if invalid or if column ids differ from the stored board). `save(user_id, board)` is shared with the chat route.
- `app/ai.py`: OpenRouter via the `openai` SDK (model `openai/gpt-oss-120b`, key from `OPENROUTER_API_KEY`). `get_client()` is a FastAPI dependency (override it in tests). `POST /api/chat` takes `{message, history: [{role, content}]}`, sends the system prompt with the current board, then calls `chat.completions.parse` with `AIResponse` (`reply`, `board` with cards as a list). A returned board is converted to the `cards` map, validated and saved via `board.save`. Response: `{reply, board}`, where `board` is null if nothing changed or the AI board was invalid (a note is then appended to the reply).
- Sessions: Starlette `SessionMiddleware` (signed, HTTP-only `session` cookie). Secret from `SESSION_SECRET` env var, default `dev-secret`.
- `tests/`: pytest with FastAPI's `TestClient`. `conftest.py` gives every test its own temp DB (`DB_PATH`) and `client` / `signed_in` fixtures.

Dependencies: `fastapi[standard]` (includes uvicorn), `itsdangerous` (session signing), `openai` (OpenRouter client); dev: `pytest`, `httpx`.

uv is not required on the host. Build the frontend first (`npm run build` in `frontend/`), then run tests in a container from the project root:

```
docker run --rm -v "$PWD/backend:/src:ro" -v "$PWD/frontend/out:/out:ro" ghcr.io/astral-sh/uv:python3.15-trixie-slim sh -c "cp -r /src /app && cp -r /out /app/static && cd /app && uv sync --locked -q && uv run pytest -q"
```

Add `--env-file .env` to the `docker run` to also run the live OpenRouter test (skipped without a key).

The root `Dockerfile` is multi-stage: a Node stage builds the frontend export, then the Python stage installs locked dependencies with `uv sync --locked` and runs uvicorn on port 8000.
