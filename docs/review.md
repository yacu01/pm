# Code Review

Scope: `backend/app`, `backend/tests`, `frontend/src`, `frontend/tests`, `Dockerfile`, `scripts/`, ignore files. Commit `cf785dc`. Reviewed by reading the code; tests were not run as part of this review.

## Summary

The backend is small and well structured: one `BoardData` model and one `board.save` path validate both manual and AI edits, and the tests cover the important invalid-board cases. The frontend components are small, typed and follow the colour scheme.

Two issues block calling this a working MVP: an API key file is committed to git, and the board is not loaded from or saved to the backend (Part 7), which causes data loss and makes the AI work on a different board from the one the user sees.

## Critical

### 1. API key committed to git
`openai.key.txt` is tracked (`git ls-files` lists it) and is not in `.gitignore`. Anyone with the repo or its history has the key.
Fix: revoke the key at the provider, `git rm --cached openai.key.txt`, add it to `.gitignore`. Removing it in a new commit does not remove it from history, so treat the key as burned. Keep secrets in `.env` only. (The Dockerfile copies only `frontend/` and `backend/`, so the key is not in the image.)

### 2. Board is not persisted from the UI (Part 7 not done)
- `frontend/src/components/KanbanBoard.tsx:24` starts from `initialData`; `frontend/src/lib/api.ts` has no `getBoard` / `saveBoard`.
- Manual drag, rename, add, edit and delete are lost on reload.
- The AI reads the stored board (`backend/app/ai.py:85`), not the on-screen one. Add card "X" by hand, then ask the AI to move it: the AI never sees X, and when it returns a board `onBoardUpdate` (`KanbanBoard.tsx:185`) replaces the screen and X disappears.
- After any AI change, a reload shows `initialData` again while the DB holds the AI version.
- This is hidden only because `initialData` and `backend/app/seed_board.json` are currently identical.

Fix: implement Part 7 as planned. Column rename fires `onRename` on every keystroke (`KanbanColumn.tsx:46`), so save on blur or debounce rather than PUT per key.

## High

### 3. Blank page if `/api/me` fails
`frontend/src/app/page.tsx:14` has no `catch`; on a network error `auth` stays `"loading"` and the page renders `null` forever. Show a "cannot reach server" message.

### 4. Chat endpoint error handling
`backend/app/ai.py`:
- `:94-95` `message.parsed` is `None` on a model refusal, so `result.board` raises `AttributeError` (500).
- `:91` no handling of OpenRouter errors (bad key, 429, 5xx): unhandled 500.
- `:73` client uses SDK defaults (long timeout, retries), so the UI can sit on "Thinking..." for minutes. Set `timeout` and `max_retries`.
- `:75` `os.environ["OPENROUTER_API_KEY"]` raises `KeyError` (500) when the key is not set, although the start scripts deliberately allow running without `.env`. Return a clear 503.

### 5. Known default session secret
`backend/app/main.py:22` falls back to `"dev-secret"` and the start scripts never set `SESSION_SECRET`, so session cookies can be forged by anyone who reads the repo. Acceptable only for strictly local use; generate a secret in the start scripts or require it via `.env`.

### 6. App fails at import without the frontend build
`backend/app/main.py:34` `StaticFiles(directory=STATIC_DIR)` raises at import if `backend/static` is missing, giving an unrelated-looking stack trace when running outside Docker. Fail with an explicit message or `check_dir=False`.

## Medium

7. Empty column titles are accepted: `Column.title` has no `min_length` (`backend/app/board.py:20`) and the input allows clearing it. Card and column titles of only spaces also pass `min_length=1` (relevant for AI output, which is not trimmed).
8. `ai.py:106` catches every `HTTPException` as "the board change was invalid"; catch only the 422 from `board.save`.
9. Chat input is unbounded: `ChatRequest` (`ai.py:62-64`) accepts any length of `message` and `history`, and trusts client-supplied `assistant` turns. Cap sizes.
10. Session expiry is not handled: `sendChat` throws on 401 (`api.ts:37-39`) and the chat shows "Something went wrong" instead of returning to login.
11. `login()` returns `false` for any non-ok status (`api.ts:17`), so a 500 or network failure shows "Invalid username or password".
12. Last write wins: `PUT /api/board` and chat both replace the whole board; two tabs or a manual save racing an AI reply silently drop changes. Once Part 7 lands this becomes reachable in normal use (save in flight while the AI replies).
13. `db.get_board` (`db.py:77-81`) is select-then-insert; two concurrent first requests can hit the `UNIQUE(user_id)` constraint and 500. Use `INSERT ... ON CONFLICT DO NOTHING` then select.
14. Start scripts return before the app is ready (~5s), so `npm run test:e2e` right after start fails. Add a `/api/health` wait loop.
15. `db.verify_password` (`db.py:44`) raises `ValueError` on a malformed stored hash (500 on login).
16. Stale card edit form: `KanbanCard` copies `card.title/details` into local state when editing starts (`KanbanCard.tsx:25-29`). If an AI reply changes that card while the form is open, Save writes the old text back over the AI change.
17. No logging of AI failures or invalid AI boards; diagnosing chat problems in the container is hard.

## Low / nits

18. `KanbanBoard.tsx:33` `useMemo(() => board.cards, [board.cards])` does nothing; use `board.cards`.
19. `db.get_user` returns a bare tuple read as `user[0]` / `user[1]` (`auth.py:25`, `auth.py:31`); a small NamedTuple reads better.
20. `ai.py:64` `history: list[ChatMessage] = []`; `Field(default_factory=list)` is the idiomatic form.
21. `ai.py:87` `SYSTEM_PROMPT.format(...)` breaks if a literal `{` is ever added to the prompt.
22. The "(The board change was invalid...)" note is appended to the assistant reply and then sent back as history on the next turn.
23. `test_test_route_removed` (`test_ai.py:93`) passes trivially for any unknown route; drop it.
24. `KanbanBoard` shows column titles twice (header pills and the columns).
25. `handleAddCard` stores the placeholder "No details yet." as real card data (`KanbanBoard.tsx:68`).
26. Dependencies: `@types/node` is `^20` while the build uses Node 26; `frontend/README.md` is create-next-app boilerplate and there is no root README.
27. Error text uses `text-red-600`, outside the palette; fine for errors.

## Test gaps

- No test for a model refusal (`parsed is None`), an `OpenAIError`, or a missing API key.
- No test for empty or whitespace-only column titles.
- No frontend test for the `/api/me` failure path or a 401 from chat.
- No test that manual changes call `saveBoard` (comes with Part 7).
- Until Part 7 removes `initialData`, nothing checks it stays equal to `seed_board.json`.

## Done well

- Single validation path (`board.save`) for manual and AI saves, with cross-reference checks JSON Schema cannot express, and tests for each invalid case.
- Invalid AI boards degrade to a reply note instead of an error, and nothing is saved.
- Cards-as-list for strict Structured Outputs, converted back to the map, is clean.
- scrypt with `compare_digest`, HTTP-only signed cookie, tamper test, temp DB per test.
- Start scripts only pass `--env-file` when `.env` exists.

## Suggested order

1. Revoke the key and untrack `openai.key.txt` (1).
2. Part 7 (2), including save-on-blur for column titles and the stale edit form (16).
3. Blank page (3) and chat error handling (4).
4. Session secret (5), then the medium items.
