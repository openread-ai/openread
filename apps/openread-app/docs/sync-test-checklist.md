# Sync Manual Test Checklist

> **Setup**: Two devices (Web + Desktop, or two browser tabs). **A** and **B** below. Same account on both.
>
> **Last tested**: 2026-03-04 | **MCP version**: @openread/mcp@0.0.1-test.9

---

## 1. Books

### Create

- [ ] Import a book on A. Appears on B with correct title/author/format. _(Test via file picker; drag-drop and OPDS use the same sync path.)_
- [ ] Import with auto-upload disabled. Metadata still syncs to B.
- [ ] Import the same book on both devices. No duplicate — one copy, latest metadata.

### Pull

- [ ] First sign-in on B. All books from A appear.
- [ ] Close B for 4+ days, reopen. Full re-sync occurs.
- [ ] Both devices open. Import on A — B receives it within seconds (Realtime), not 10s poll.

### Update

- [ ] Rename a book on A. Title updates on B.
- [ ] Change reading status on A. Status shows on B.
- [ ] Add/remove tags on A. Tags update on B.
- [ ] Bulk status change on A (multiple books). All update on B.
- [ ] Rename on A + change status on B simultaneously. Both changes survive (field-level LWW).

### Delete

- [x] Delete on A. Disappears on B within seconds. ✅ 2026-03-04 — Desktop→Web, all 27 books
- [x] Bulk delete 5 books on A. All disappear on B. ✅ 2026-03-04 — Bulk delete 14 books, same timestamp
- [ ] Delete on A while B is offline. Bring B online — book disappears.
- [ ] Go offline on A, delete, come back online. Deletion syncs to B.
- [ ] Delete then re-import same file. Book reappears on both devices.

---

## 2. Book Configs (Reading Progress)

### Progress Sync

- [ ] Read to page 50 on A, close book. Open on B — jumps to page 50, shows "Reading Progress Synced" toast.
- [ ] Read to page 80 on A, then go back to page 20. Open on B — reflects page 20 (backward sync works).
- [ ] Read several pages on A with B open on same book. B's progress updates within ~3s.

### Settings Sync

- [ ] Change font size on A. Open same book on B — font size matches.
- [ ] Change progress on A + change view settings on B simultaneously. Both survive (field-level LWW).

### Offline / Edge Cases

- [ ] Change progress on A, close reader within 3s. Reopen on B — progress DID sync (offline queue).
- [x] Delete a book on A. Config record is cleaned up on server (deleted_at set). ✅ 2026-03-04 — 13 configs soft-deleted

---

## 3. Book Notes (Highlights, Bookmarks, Annotations)

### Create

- [ ] Highlight text on A. Open book on B — highlight appears with correct color/style.
- [ ] Add a bookmark on A. Appears on B.
- [ ] Add an annotation on A. Note text appears on B.
- [ ] Add a highlight on A, close reader within 5s. Reopen on B — highlight DID sync (offline queue).

### Pull

- [ ] Add several highlights on A. Open book on B for the first time — all appear.

### Update

- [ ] Edit annotation text on A. Updated text appears on B.
- [ ] Change highlight color/style on A. Changes on B.
- [ ] Edit same note on A and B simultaneously. Later edit wins (LWW), no corruption.

### Delete

- [x] Delete a highlight/bookmark/annotation on A. Gone on B. _(All note types use same deletedAt path.)_ ✅ 2026-03-04 — 7 notes soft-deleted with parent books
- [ ] Delete a note offline. Come back online — deletion syncs to B.
- [ ] Delete a note, close reader within 5s. Reopen on B — note is gone.

---

## 4. AI Conversations & Messages

### Create & Pull

- [ ] Start a new AI chat on A. Open AI panel on B — conversation appears with all messages.
- [ ] With AI panel open on B, create a new chat on A. Appears on B within 30s (polling).
- [ ] Conversation with 10+ messages on A. Open on B — all messages in order, including long responses and tool calls.

### Update

- [ ] Rename a chat on A. Title updates on B.
- [ ] Send a new message in existing chat on A. Appears on B.

### Delete

- [ ] Delete a conversation on A. Disappears on B (messages cascade-deleted too).

---

## 5. User Settings

### Roaming (should sync)

- [ ] Change theme on A. B matches.
- [ ] Change AI provider on A. B reflects it.
- [ ] Change default highlight color on A. B uses the new default.

### Per-Device (should NOT sync)

- [ ] `lastSyncedAt*` timestamps stay per-device.
- [ ] Desktop-only settings (`alwaysOnTop`, custom root dir) don't affect web.

---

## 6. Credentials

- [ ] Add BYOK API key on A. B can use it for AI chat. Key prefix displays correctly on both.
- [ ] Delete key on A. B no longer has it.
- [ ] Create platform API token on A. Visible on B. Revoke on A — gone on B.

---

## 7. Edge Cases

### Offline

- [ ] Full offline session on A: import, highlight, change status, delete a book. Come online — ALL sync to B.
- [ ] Different changes offline on A and B. Both online simultaneously — LWW resolves, no data loss.

### Conflict Resolution

- [ ] Delete book on A + edit title on B (before B receives delete). Later action wins.
- [ ] Same field edited on both devices. Later write wins on both.

### Scale

- [ ] 500+ book library syncs within 60s.
- [ ] Book with 200+ highlights syncs without truncation.
- [ ] Rapid-fire: change status on 20 books quickly. All sync.

### Auth

- [ ] Sign out during sync — no crash or corruption.
- [ ] Switch accounts — old data gone, new data loads.

### Platform

- [ ] Web-to-Desktop and Desktop-to-Web CRUD sync both work.
- [ ] Desktop Realtime works (or falls back to polling gracefully).

---

## 8. Regression Guards

- [ ] Library page load: only `GET /api/sync` in network tab, no `POST` (pull-only on load).
- [ ] Delete on A, refresh B immediately — book doesn't ghost-restore on A.
- [ ] Desktop launch: console shows "Migration 20251029: old Images dir not found, skipping" (not "Permission denied").

---

## 9. MCP Server (@openread/mcp)

### Package & Startup

- [x] `npx -y -p @openread/mcp mcp --version` returns current version. ✅ 2026-03-04 — `0.0.1-test.9`
- [x] Server starts, authenticates, shows "MCP server ready". ✅ 2026-03-04
- [x] No `@napi-rs/canvas` warning in stderr. ✅ 2026-03-04 — Module.\_resolveFilename stub
- [ ] JWT refresh — queries work after token expiry (>1hr session).

### Read Operations

- [x] `list_books` returns correct data. ✅ 2026-03-04 — Returns `totalCount: 0` after all books deleted
- [ ] `search_book` returns matching results.
- [ ] `get_chapter` returns chapter content.
- [ ] `search_library` searches across books.

### Soft-Delete Filtering

- [x] Soft-deleted books excluded from `list_books`. ✅ 2026-03-04 — `totalCount: 0, books: []`
- [x] Soft-deleted books excluded from `countBooks`. ✅ 2026-03-04
- [ ] Soft-deleted books excluded from `getBookById`.

### Security (RLS)

- [ ] MCP token cannot INSERT into books table (RLS rejects).
- [ ] MCP token cannot UPDATE books table (RLS rejects).
- [ ] MCP token cannot DELETE from books table (RLS rejects).
- [ ] MCP token blocked on all 7 tables (book_configs, book_notes, ai_conversations, ai_messages, user_settings, mcp_platform_tokens).

---

## 10. Database Migrations

- [x] `trigger_books_updated_at` dropped. ✅ 2026-03-04 — Verified via pg_trigger
- [x] `sync_books_atomic` RPC updated (returns only changed records). ✅ 2026-03-04
- [x] `user_settings` table created with RLS. ✅ 2026-03-04
- [x] MCP read-only RLS policies on 7 tables. ✅ 2026-03-04 — Verified via pg_policies
- [x] Storage files (R2) preserved during tombstone window. ✅ 2026-03-04 — EPUBs + images still in bucket

---

> **Environment**: Web + Desktop, normal + offline network, pre-seed 5-10 books with highlights. Keep DevTools/console open.
