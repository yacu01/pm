# Frontend

NextJS 16 (App Router), React 19, TypeScript, Tailwind CSS 4. Built as a static export (`output: "export"` in next.config.ts, output in `out/`) and served by the FastAPI backend at `/` inside Docker. Board state still lives in React state and resets on reload.

## Structure

- `src/app/layout.tsx` - root layout; loads Space Grotesk (display) and Manrope (body) via next/font
- `src/app/page.tsx` - auth gate: calls `/api/me` on load, shows `LoginForm` if signed out, otherwise `KanbanBoard` (with logout)
- `src/app/globals.css` - Tailwind import and color scheme CSS variables (`--accent-yellow`, `--primary-blue`, `--secondary-purple`, `--navy-dark`, `--gray-text`, surfaces, stroke, shadow)
- `src/lib/kanban.ts` - types (`Card`, `Column`, `BoardData`), `initialData` (5 columns, 8 cards), `moveCard` (reorder within or move between columns), `createId`
- `src/lib/api.ts` - fetch helpers: `getMe`, `login`, `logout`, `sendChat` (POST `/api/chat` with message and history)
- `src/components/LoginForm.tsx` - username/password form; shows an error on failed login
- `src/components/icons.tsx` - inline SVG icons (pencil, trash, plus, close, chat, send, log out)
- `src/components/ChatSidebar.tsx` - AI chat drawer (`isOpen` / `onClose` props; opened from the header "AI chat" button): message list, input, purple Send button, "Thinking..." loading state, error message. History lives in its React state and is sent with each message; a `board` in the response is passed to `onBoardUpdate`
- `src/components/KanbanBoard.tsx` - owns board state; full-height layout: slim header (title, card count, AI chat and Log out buttons), then a horizontally scrolling grid of columns (min 220px each); holds chat open state and renders `ChatSidebar` (which can replace the board); dnd-kit `DndContext` with drag overlay; handlers for move, rename column, add, edit and delete card
- `src/components/KanbanColumn.tsx` - droppable column; editable title input with card count badge; vertically scrolling sortable card list; `NewCardForm`
- `src/components/KanbanCard.tsx` - sortable card with title, details, and pencil / trash icon buttons at the top right (shown on hover or focus); edit swaps in an inline form (drag disabled while editing)
- `src/components/KanbanCardPreview.tsx` - card shown while dragging
- `src/components/NewCardForm.tsx` - toggleable form to add a card (title required, details optional)

## Data model

`BoardData = { columns: Column[]; cards: Record<string, Card> }`. Columns hold ordered `cardIds`; card content lives in the `cards` map.

## Not yet implemented

- Loading and saving the board through the backend API (Part 7); the UI still starts from `initialData`

## Tests

- Unit (Vitest + Testing Library, jsdom): `src/lib/kanban.test.ts` (moveCard), `src/components/KanbanBoard.test.tsx` (columns render, rename, add/remove card, edit/cancel edit card), `src/components/LoginForm.test.tsx` (fetch mocked: render, success, error), `src/components/ChatSidebar.test.tsx` (fetch mocked: messages shown, history sent, board updated, error, open/close). Run `npm run test:unit`.
- E2E (Playwright, Chromium): `tests/chat.spec.ts` (chat route mocked with `page.route`: message flow, board refresh), `tests/auth.spec.ts` (login shown when signed out, wrong password error, sign in / reload / log out), `tests/kanban.spec.ts` (load, add card, edit card, rename column, drag between columns; signs in first via `tests/helpers.ts`). Runs against the Docker container at http://127.0.0.1:8000, so start it first with `scripts/start.*`. Run `npm run test:e2e`.
