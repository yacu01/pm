# Project Plan

Kanban MVP: NextJS static frontend served by a Python FastAPI backend, SQLite persistence, AI chat via OpenRouter, all in one Docker container.

## Decisions (agreed with user)

- Database: `users` and `boards` tables; each board is stored as one JSON value in the same shape as the frontend `BoardData` type.
- AI board changes: the AI returns the whole updated board, validated against the schema before saving.
- Chat history: kept in the browser only (React state), sent with each request.
- Sign-in: backend checks the credentials and sets an HTTP-only session cookie; all `/api` board and chat routes require it.
- Frontend is built with `output: "export"` and served by FastAPI at `/`; API lives under `/api`.
- One Docker image, multi-stage: Node stage builds the frontend, Python stage (uv) runs the app on port 8000.
- `.env` (OPENROUTER_API_KEY) stays out of git and is passed to the container at runtime.
- Work stops for user review at the end of every part.

## Decisions made during the build

Runtime and tooling
- Python 3.15 using the `ghcr.io/astral-sh/uv:python3.15-trixie-slim` image; Node 26 (`node:26-slim`) for the frontend build stage.
- uv is not needed on the host: backend tests run inside the uv image (command in backend/AGENTS.md). The frontend must be built first so `frontend/out` can be copied in as `static/`.
- `backend/static/` is not in git; the Dockerfile copies `frontend/out` there.
- Start scripts pass `--env-file .env` only if `.env` exists, so the app runs before the AI key is set up.
- The app takes about 5 seconds to start; Docker accepts connections before then, so wait for `/api/health` before scripted requests.
- `.gitattributes` forces LF line endings on `.sh` scripts so they run on Mac/Linux after a Windows checkout.

Frontend
- Card editing is an inline form on the card (Edit, then Save/Cancel). Dragging and the drag ARIA attributes are turned off while editing; leaving them on marked the inputs `aria-disabled`.
- Board fills the viewport under a slim header: columns are at least 220px wide and share the remaining width; below that the board scrolls horizontally, and each column scrolls its cards vertically.
- Card edit and delete are icon buttons (inline SVG, `components/icons.tsx`) at the top right of the card, shown on hover or focus (always on touch screens).
- The AI chat is a drawer fixed to the right edge, closed by default and opened with the purple "AI chat" button in the header. On screens 1536px and wider the board makes room for the open drawer instead of sitting under it. An inline sidebar was tried first, but at 1280px it shrank the board so far that cards overflowed and dropped below the fold.
- Part 10 was built before Part 7. Until Part 7 lands, the UI starts from `initialData` and does not save manual edits, while the AI reads and saves the stored board; an AI reply replaces the on-screen board with the stored one.
- Playwright runs against the Docker container at http://127.0.0.1:8000, so the container must be started first. E2E tests sign in first via `tests/helpers.ts`.

Auth (Part 4) and database (Parts 5-6), details in docs/DATABASE.md
- Sessions use Starlette `SessionMiddleware` (signed cookie via `itsdangerous`). Secret from `SESSION_SECRET`, default `dev-secret`.
- Login checks the `users` table (scrypt hashes from the standard library), not hardcoded values. The "user" / "password" account is created at startup if missing.
- A user's board is seeded from `backend/app/seed_board.json` (the demo data) on the first `GET /api/board`, not at sign-in.
- Boards have exactly 5 columns. Columns can be renamed but not added, removed or reordered (column ids must match the stored board).
- Pydantic validates the cross-references JSON Schema cannot express: card keys match ids, every column card id exists, every card is in exactly one column. An invalid board gets 422 and is not saved.
- The DB is at `DB_PATH` (default `data/app.db`, `/app/data/app.db` in the container), on a named Docker volume `pm-data`. `docker volume rm pm-data` resets it.

AI (Parts 8-9)
- `openai` Python SDK 3.x with `base_url` set to OpenRouter. The client is a FastAPI dependency (`ai.get_client`) so tests can replace it with a mock.
- Chat uses `client.chat.completions.parse` with Pydantic `AIResponse` as the response format. The current board goes in the system prompt as JSON; the history (roles `user` / `assistant` only) and the new message follow.
- An AI board is validated with the same `BoardData` model and column-id check as `PUT /api/board` (shared `board.save`). If it is invalid, nothing is saved and the response is 200 with `board: null` and a note appended to the reply, so the chat can show it.
- Chat replies take several seconds (about 8s for a multi-card change), so the sidebar needs a loading state.
- The OpenRouter integration test runs only when `OPENROUTER_API_KEY` is set, for example by passing `--env-file .env` to the test container.
- Strict Structured Outputs do not allow objects with arbitrary keys, so the AI response model uses a card list (`cards: [Card]`). The backend converts it to the stored `cards` map before validating and saving.

## Target layout

```
backend/
  pyproject.toml, uv.lock
  app/main.py        FastAPI app, session middleware, static mount, routers
  app/auth.py        login/logout/me, current_user / current_user_id
  app/db.py          SQLite access, schema creation, user and board seeding
  app/seed_board.json  demo board used to seed new users
  app/board.py       board routes and Pydantic models
  app/ai.py          OpenRouter client and chat route
  tests/             pytest; conftest.py gives each test a temp DB
  static/            frontend export, copied in by the Dockerfile (not in git)
  data/              SQLite file (Docker volume pm-data; not in git)
frontend/            NextJS app (static export to out/)
scripts/             start/stop for Mac, Linux (.sh) and Windows (.ps1)
Dockerfile, .dockerignore, .gitattributes
docs/                PLAN.md, DATABASE.md, board.schema.json
```

---

## Part 1: Plan

- [x] Review AGENTS.md, existing frontend and this plan
- [x] Agree open decisions with user (see above)
- [x] Expand this plan with substeps, tests and success criteria
- [x] Create frontend/AGENTS.md describing the existing code
- [x] User approves the plan

Success: user signs off on this document.

## Part 2: Scaffolding

- [x] Create `backend/` with uv project (`pyproject.toml`), FastAPI, uvicorn, pytest, httpx
- [x] `app/main.py` with `GET /api/health` returning `{"status": "ok"}`
- [x] Serve a placeholder `static/index.html` ("hello world") at `/`, which calls `/api/health` and shows the result
- [x] `Dockerfile` (Python + uv for now), `.dockerignore`
- [x] `scripts/start.sh`, `scripts/stop.sh` (Mac/Linux) and `scripts/start.ps1`, `scripts/stop.ps1` (Windows): build image, run container named `pm` on port 8000 with `--env-file .env` (only if the file exists); stop removes it
- [x] Update backend/AGENTS.md and scripts/AGENTS.md

Tests:
- pytest: `/api/health` returns 200 and the expected JSON; `/` returns the HTML
- Manual: run start script, open http://localhost:8000, see hello world and API result; stop script stops the container

Success: container starts with one script, page and API respond, stop script cleans up.

## Part 3: Add in Frontend

- [x] Set `output: "export"` in next.config.ts; confirm `npm run build` produces `frontend/out`
- [x] Multi-stage Dockerfile: Node stage runs `npm ci && npm run build`; Python stage copies `out/` and serves it at `/`
- [x] Remove the Part 2 placeholder HTML
- [x] Add card editing (title and details) to the board, as required by AGENTS.md and missing from the demo
- [x] Point Playwright at the container (baseURL http://127.0.0.1:8000, no dev webServer) so e2e tests exercise the real build
- [x] Update frontend/AGENTS.md

Tests:
- Vitest: existing tests pass; new tests for editing a card
- Playwright against the container: board loads with 5 columns, add card, edit card, rename column, drag between columns
- pytest: `/` serves the exported index.html

Success: http://localhost:8000 shows the working demo board from inside Docker; all tests green.

## Part 4: Fake sign-in

- [x] Backend: `POST /api/login` (checks "user"/"password", sets signed HTTP-only cookie), `POST /api/logout`, `GET /api/me` (401 if not signed in)
- [x] Session secret from env with a fixed dev default
- [x] Frontend: on load call `/api/me`; show login form if 401, otherwise the board; logout button in the header
- [x] Error message on wrong credentials

Tests:
- pytest: login success/failure, cookie set, `/api/me` with and without cookie, logout clears cookie
- Vitest: login form renders, submits, shows error on failure
- Playwright: unauthenticated visit shows login; wrong password shows error; correct login shows board; logout returns to login; reload keeps session

Success: board is only visible after signing in; logout works.

## Part 5: Database modeling

- [x] Write `docs/DATABASE.md`: approach, tables, JSON board format, seeding
- [x] Proposed schema:
  - `users(id INTEGER PK, username TEXT UNIQUE, password_hash TEXT, created_at)`
  - `boards(id INTEGER PK, user_id INTEGER UNIQUE REFERENCES users, data TEXT (JSON), updated_at)`
- [x] Save `docs/board.schema.json` (JSON Schema for `BoardData`: columns with id/title/cardIds, cards map with id/title/details)
- [x] DB file at `DB_PATH` (default `backend/data/app.db`) on the named volume `pm-data` so data survives container restarts; created with tables on startup if missing
- [x] Seed the user's board with the current demo data on the first `GET /api/board` (changed from "on first sign-in")
- [x] Login moves from hardcoded values to the `users` table with scrypt password hashes
- [x] User signs off

Success: user approves DATABASE.md and the schema.

## Part 6: Backend board API

- [x] `app/db.py`: create tables if missing, seed "user" account, get/save board JSON
- [x] Pydantic models matching the board schema, including checks that every card id in a column exists in `cards` and vice versa
- [x] `GET /api/board` returns the signed-in user's board (seeding if none)
- [x] `PUT /api/board` validates and replaces the board
- [x] Docker volume for `backend/data` in start scripts

Tests (pytest, temp DB per test):
- DB is created when missing; tables exist
- GET returns seeded board; PUT then GET round-trips
- "user" account created with a hashed password
- Invalid boards rejected with 422 and not saved: dangling card id, card in no column, card in two columns, card key not matching id, missing column, reordered columns, empty card title
- Routes return 401 without session
- Two users have separate boards
- Board survives an app restart (plus a manual check across a container restart)

Success: board persists across requests and container restarts.

## Part 7: Frontend + Backend

- [ ] `src/lib/api.ts`: `getBoard`, `saveBoard`
- [ ] Board loads from `GET /api/board` after sign-in (loading state)
- [ ] Every change (move, rename, add, edit, delete) saves the full board with `PUT /api/board`
- [ ] Remove `initialData` from the frontend (the backend seed is `backend/app/seed_board.json`); update the Vitest tests that render the board to use mocked API data

Tests:
- Vitest: API functions mocked; board renders fetched data; changes call `saveBoard`
- Playwright: make each kind of change, reload page, change is still there; restart container, change is still there

Success: the board is fully persistent.

## Part 8: AI connectivity

- [x] Add `openai` Python SDK pointed at OpenRouter (`https://openrouter.ai/api/v1`), model `openai/gpt-oss-120b`, key from `OPENROUTER_API_KEY`
- [x] `POST /api/ai/test` (signed-in) asks "What is 2+2?" and returns the reply

Tests:
- pytest unit test with the client mocked
- pytest integration test (skipped if no key) that asks "2+2" and checks "4" is in the reply
- Manual: call the route in the running container

Success: a real reply comes back from OpenRouter inside Docker.

## Part 9: AI with board context and Structured Outputs

- [x] `POST /api/chat` takes `{message, history: [{role, content}]}`
- [x] System prompt explains the app and the board format; the current board JSON and the history are sent with the message
- [x] Structured Outputs response model: `{reply: str, board: {columns, cards: [Card]} | null}` (cards as a list for strict mode; converted to the `cards` map before validation)
- [x] If `board` is present, validate and save it, then return `{reply, board}`; otherwise return `{reply, board: null}`
- [x] Remove the Part 8 test route

Tests:
- pytest with mocked client: reply only leaves board unchanged; reply with board saves it; invalid board from AI is rejected and not saved; history and board are included in the request
- Integration test (skipped if no key): "Add a card called X to Backlog" results in a saved board containing X

Success: the AI can create, edit and move one or more cards via chat.

## Part 10: AI chat sidebar

- [x] `ChatSidebar` component: message list, input, send button (purple), loading state, collapsible
- [x] History held in React state and sent with each message
- [x] When the response includes a board, replace the board state so the UI refreshes immediately
- [x] Styled with the project color scheme

Tests:
- Vitest: sending a message shows user and AI messages; a board in the response updates the board
- Playwright with the chat route mocked: message flow and board refresh
- Manual end-to-end with the real model: ask it to add and move cards and see the board update

Success: user can chat with the AI in a sidebar and see the board change when the AI updates it.
