# Code Review — Kanban MVP

Reviewed: `backend/`, `frontend/`, `Dockerfile`, `scripts/`, `docs/`. Verified: `npm run lint` clean, `npm run test:unit` 16/16 passing. Backend tests were not run (they need Docker plus a built frontend export).

## Summary

The backend is in good shape: clear layering, one shared validation path for manual and AI saves, and tests that cover the real failure modes of the board model. The frontend is well organised and matches the colour scheme.

Two things stop this from being a shippable MVP: a **real secret is committed to git**, and the **board is still not persisted** (Part 7), which creates a user-visible data-loss bug that is currently hidden because `initialData` happens to equal the seed board.

## Critical

### 1. A live API key is committed to the repository

`openai.key.txt` is tracked in git (added in `c949439`) and contains an `sk-proj-...` key, 168 characters. It is not in `.gitignore` or `.dockerignore`.

Impact: the key is exposed to anyone with the repo or its history, and removing the file in a later commit does not remove it from history.

Fix:

1. Revoke/rotate the key at the provider now.
2. `git rm --cached openai.key.txt`, add `openai.key.txt` and `*.key.txt` to `.gitignore` and `.dockerignore`.
3. Either rewrite history (`git filter-repo`) or accept that the old key is public and treat it as burned.
4. Keep using `.env` (`OPENROUTER_API_KEY`), which is correctly ignored.

### 2. The board is never loaded from or saved to the backend (Part 7)

`frontend/src/components/KanbanBoard.tsx:24` initialises from `initialData`; `frontend/src/lib/api.ts` has no `getBoard`/`saveBoard`. Every manual change (drag, rename, add, edit, delete) lives only in React state.

Consequences:

- Reload loses every manual change, silently. This breaks the "cards can be moved and edited" requirement.
- AI changes *are* persisted, so after a reload the screen reverts to `initialData` while the database holds the AI's version.
- Worse, the AI reads the **stored** board (`backend/app/ai.py:85`) while the user sees the **local** board. Repro: add card "X" manually, then ask "move X to Done". The model never sees X; if it returns a board, `onBoardUpdate` replaces the screen board and X vanishes.
- The bug is invisible today only because `initialData` and `backend/app/seed_board.json` are identical.

Fix: implement Part 7 as planned. Load via `GET /api/board` with a loading state, save via `PUT /api/board` after each mutation, delete `initialData`, and update the Vitest tests to mock the API. Debounce the column-title save (it fires on every keystroke at `KanbanColumn.tsx:46`) or save on blur.

## High

### 3. A failed `/api/me` leaves a permanently blank page

`frontend/src/app/page.tsx:13-15` — `getMe().then(...)` has no `catch`. If the backend is down or the request fails, `auth` stays `"loading"` and the component returns `null` forever, with no error and no retry. Add a `catch` that shows a "cannot reach server" state.

### 4. Chat fails ungracefully when the model call goes wrong

`backend/app/ai.py:91-94`:

- `completion.choices[0].message.parsed` can be `None` when the model refuses; `result.board` then raises `AttributeError` and returns a 500.
- No `try` around `client.chat.completions.parse`, so any OpenRouter error (bad key, 429, 5xx) is an unhandled 500.
- `OpenAI(...)` at `ai.py:73-76` uses the SDK default timeout (600s) and 2 retries, so a hung upstream leaves the UI on "Thinking..." for minutes.
- `os.environ["OPENROUTER_API_KEY"]` raises `KeyError` when the key is absent, even though the app is designed to start without it.

Fix: pass `timeout=` (e.g. 60s) and `max_retries=1` to the client; catch `OpenAIError` and return 502 with a readable detail; treat `parsed is None` as "no board change" with a clear reply; return 503 when the key is unset.

### 5. The session secret has a known default

`backend/app/main.py:22` falls back to `"dev-secret"`, and neither start script sets `SESSION_SECRET`. Anyone who can reach the app can forge a session cookie. Acceptable for a strictly local MVP, but it should not be the silent default: generate a random secret in the start scripts (or a `.env` template) and document that the default is local-only. Related: the container also runs as root with no `HEALTHCHECK` (`Dockerfile`).

### 6. Missing frontend export crashes at import time

`backend/app/main.py:34` — `StaticFiles(directory=STATIC_DIR)` raises at import if `backend/static` does not exist, so `uvicorn app.main:app` on the host fails with a stack trace unrelated to the real cause. Either create the directory in startup code or fail with an explicit message ("run npm run build in frontend/ first").

## Medium

7. **No login rate limiting.** `POST /api/login` (`backend/app/auth.py:28`) allows unlimited attempts; scrypt is the only cost. Fine for a local MVP, but worth a note in the docs or a simple per-IP counter.
8. **Column titles can be empty.** `backend/app/board.py:20` has no `min_length` on `Column.title`, and the UI input (`KanbanColumn.tsx:44`) has no `maxLength` or blank guard. A blank column name persists. Add `min_length=1` (and a `maxLength`) and trim on save.
9. **Unbounded chat input and history.** `ChatRequest` (`ai.py:62-64`) accepts an arbitrarily long `history` and `message`, and trusts client-supplied `assistant` turns. This is a token-cost and prompt-injection vector. Cap the number of history messages and the message length, and consider keeping history server-side later.
10. **`ai.py:106` swallows every `HTTPException`** as "the board change was invalid". If `board.save` ever raises for another reason, the user is told the AI's change was invalid. Catch the specific 422 case.
11. **Session expiry mid-session is invisible.** `sendChat` throws on any non-ok response (`api.ts:37`) and `ChatSidebar.tsx:39-41` shows "Something went wrong". A 401 should return the user to the login screen.
12. **Misleading login error.** `login()` returns `false` for a 500 or network failure (`api.ts:11-18`), so `LoginForm` shows "Invalid username or password" when the server is actually broken. Distinguish status codes.
13. **No concurrency control on board writes.** `PUT /api/board` and the chat save both replace the whole board, last-write-wins. Two tabs, or a manual save racing an AI reply, silently discard the other change. A cheap mitigation is an `updated_at`/version check; at minimum, note the limitation.
14. **Seed insert can race.** `db.get_board` (`db.py:74-82`) does select-then-insert; two concurrent first requests can hit the `UNIQUE` constraint and 500. Use `INSERT ... ON CONFLICT DO NOTHING` then re-select.
15. **No payload size limit** on `PUT /api/board`.
16. **Start scripts do not wait for health.** The plan notes the app needs ~5s, but `start.sh`/`start.ps1` return immediately, so `npm run test:e2e` right after starting fails on connection refused. Add a `/api/health` wait loop.
17. **`verify_password` can 500.** `db.py:44` unpacks `stored.split("$")`; a corrupt hash raises `ValueError`. Cheap to guard.
18. **No logging.** No request logging config, no error logging, nothing to diagnose an AI failure in the container beyond uvicorn's access log.

## Low / nits

19. `KanbanBoard.tsx:33` — `useMemo(() => board.cards, [board.cards])` is a no-op; just use `board.cards`.
20. `db.get_user` returns a bare tuple read as `user[0]`/`user[1]` (`auth.py:22`, `auth.py:31`); a `NamedTuple` or dataclass would read better.
21. `ai.py:64` — `history: list[ChatMessage] = []`; Pydantic copies it so there is no bug, but `Field(default_factory=list)` is the idiomatic form.
22. `ai.py:87` — `SYSTEM_PROMPT.format(...)` breaks if a literal brace is ever added to the prompt; an f-string or explicit `.replace` is safer.
23. `tests/chat.spec.ts:7` strips a hard-coded `card-` prefix from `data-testid`; brittle if card ids change shape. Expose the id directly.
24. `test_test_route_removed` (`test_ai.py:93`) asserts 404/405, which would also pass if the route never existed. Assert the current router surface instead, or drop the test.
25. `frontend/README.md` is still the create-next-app boilerplate, and there is no root `README.md`. Replace both with a short "how to run" pointing at `scripts/`.
26. `docs/DATABASE.md:65` says the default `DB_PATH` is relative "to the backend"; it is relative to the process working directory (`/app` in the container).
27. Error text uses `text-red-600`, which is outside the defined palette. Acceptable for errors; keep everything else on the CSS variables (it currently is).
28. `KanbanBoard` renders the column titles twice (header pills plus the columns themselves); cosmetic clutter.

## Test gaps

- No test that `initialData` and `seed_board.json` stay in sync (worth one test until Part 7 deletes `initialData`).
- No test for `parsed is None` / model refusal, or for an `OpenAIError` from the client.
- No test for an empty column title, an oversized `history`, or a 401 from `/api/chat`.
- Frontend has no test for the `/api/me` failure path (finding 3).
- No test that manual mutations trigger `saveBoard` — that arrives with Part 7.

## Done well

- One `BoardData` model validates both `PUT /api/board` and AI output, including the cross-reference rules JSON Schema cannot express; the "reject and don't save" behaviour is correct and tested.
- The AI board is validated before saving, and an invalid board degrades to a note rather than a 500.
- Cards-as-list workaround for strict Structured Outputs is the right call, and the conversion to the map is clean.
- scrypt hashing with `compare_digest`, per-test temp DBs, and cookie-tampering tests are all solid.
- Frontend is consistently typed, components are small and single-purpose, and the colour scheme is centralised in CSS variables.
- `.env` handling in the start scripts (only pass `--env-file` when it exists) is a nice touch.

## Suggested order

1. Rotate the key and remove `openai.key.txt` from git (finding 1).
2. Part 7: load/save the board, delete `initialData`, add the save tests (finding 2).
3. Fix the `/api/me` blank page (3) and the chat error paths (4).
4. Then the medium items, starting with the empty column title and the chat input caps.
