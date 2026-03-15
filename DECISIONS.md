# Decision Log - Журнал Рішень

## Format
Each decision includes: date, problem, options considered, chosen solution, reasoning.

---

## Decision 001 - 2026-03-05
**Problem:** Choose WebSocket library
**Options:**
- A: Socket.IO - higher abstraction, auto-reconnect, fallbacks
- B: Native WebSocket - lower overhead, more control

**Chosen:** Socket.IO (Option A)
**Reasoning:** Automatic reconnect is critical for commercial quiz rooms. If a player's phone disconnects briefly, they should rejoin seamlessly. Socket.IO handles this out of the box.

---

## Decision 002 - 2026-03-05
**Problem:** Frontend framework
**Options:**
- A: React - component-based, good ecosystem
- B: Vanilla JS - no build step, simpler
- C: Vue.js - similar to React but lighter

**Chosen:** React (Option A)
**Reasoning:** Component reusability for PlayerView, HostView, ProjectorView. Strong ecosystem for future features. Team familiarity assumption.

---
## Decision 003 - 2026-03-05
**Problem:** Choose persistent storage backend for session history
**Options:**
- A: better-sqlite3 — embedded, file-based, zero config, synchronous API
- B: PostgreSQL / MySQL — full relational DB, requires separate process
- C: JSON files — simplest, no dependencies, hard to query

**Chosen:** better-sqlite3 (Option A)
**Reasoning:** The system is a local-network tool for a single venue — there is no multi-server deployment need. SQLite requires no daemon, no connection string, and the synchronous API fits naturally into the existing Node.js callback style. The `data/sessions.db` file is trivially backed up by copying one file.

---

## Decision 004 - 2026-03-05
**Problem:** Where to generate QR codes — client or server
**Options:**
- A: Server-side (Node.js `qrcode` → PNG buffer) — one request, no JS bundle cost
- B: Client-side (`qrcode` in browser bundle) — no server round-trip, larger bundle

**Chosen:** Server-side (Option A)
**Reasoning:** Generating QR codes server-side keeps the browser bundle small and lets `<img src="/api/qr/:roomCode">` work in any context. The server already knows the correct LAN IP, which the client cannot determine reliably.

---

## Decision 005 - 2026-03-05
**Problem:** i18n approach — library vs. hand-rolled
**Options:**
- A: `react-i18next` / `i18next` — full-featured, namespace support, plurals
- B: Hand-rolled `TRANSLATIONS` object + `useLang()` hook — zero dependencies

**Chosen:** Hand-rolled (Option B)
**Reasoning:** Only two languages (Ukrainian, English) and a small, stable set of strings. A full i18n library would add ~40 KB to the bundle and significant configuration overhead for a problem that is solved in ~80 lines. The `useLang()` hook is straightforward to extend if a third language is ever needed.

---

## Decision 006 - 2026-03-05
**Problem:** How players discover the room — typed code vs. QR vs. direct URL
**Options:**
- A: Typed code only (original design)
- B: QR code only
- C: All three: QR scan → direct URL with `?room=` pre-fill → manual code entry

**Chosen:** All three (Option C)
**Reasoning:** Different venue setups suit different flows. A projector screen works best with a typed code. A printed flyer or tablet works best with a QR scan. Sharing a link in a chat works best with a pre-filled URL. Supporting all three costs little (one `URLSearchParams` read on mount, one `<img>` tag) and removes friction for every scenario.

---

## Decision 007 - 2026-03-05
**Problem:** Stats dashboard data — live polling vs. SQLite persistence
**Options:**
- A: Store results in memory, poll `/api/active-quizzes` — lost on server restart
- B: Persist to SQLite after each quiz ends — survives restarts, queryable

**Chosen:** SQLite persistence (Option B)
**Reasoning:** Session history is only useful if it survives across server restarts and multiple quiz nights. Polling active sessions gives no historical data. Writing to SQLite at the end of `endQuiz()` is a single atomic transaction and adds no latency to the game flow.

---

## Decision 008 - 2026-03-05
**Problem:** Image and audio in questions — URL reference vs. file upload
**Options:**
- A: URL reference — host stores media elsewhere, quiz JSON contains a URL string
- B: File upload — server stores media files, quiz JSON references internal paths

**Chosen:** URL reference (Option A)
**Reasoning:** File upload requires multipart form handling, static file serving, storage management, and size limits — significant infrastructure for an optional feature. URL references keep the backend unchanged: the quiz JSON gains two optional fields (`image`, `audio`), and the browser fetches media directly. Venues typically already host images on an existing server or CDN.

---

## Decision 009 - 2026-03-05
**Problem:** Drag-to-reorder questions — library vs. HTML5 native DnD
**Options:**
- A: `react-beautiful-dnd` or `dnd-kit` — polished UX, large bundle (~25–60 KB gzip)
- B: HTML5 Drag and Drop API — zero new dependencies, ~30 lines of code

**Chosen:** HTML5 DnD (Option B)
**Reasoning:** The quiz creator is a desktop/tablet tool — mobile drag quirks of the HTML5 API (which affect touch devices) are acceptable. Adding a large drag library for a single list within one component is not justified. The `draggable` prop + four event handlers (`dragstart`, `dragover`, `drop`, `dragend`) are sufficient.

---

## Decision 010 - 2026-03-05
**Problem:** Audio playback — stop at answer reveal vs. play to end
**Options:**
- A: Stop audio when REVEAL_ANSWER arrives — clean transition, no bleed
- B: Let audio finish its current loop — simpler, but music plays over the answer screen

**Chosen:** Stop at reveal (Option A)
**Reasoning:** The audio bar disappears on the answer-reveal screen. If music continued playing invisibly during the answer, it would be confusing. Calling `audioRef.current.pause()` in the REVEAL_ANSWER handler keeps the experience clean. The `loop` attribute means music fills the full question duration without requiring a track of exactly the right length.

---

## Decision 011 - 2026-03-12
**Problem:** GPIO button handling — embed in Node.js backend vs. separate process
**Options:**
- A: Python subprocess spawned by Node.js using `child_process`
- B: Separate `gpio-service.py` process connecting via Socket.IO

**Chosen:** Separate Python process (Option B)
**Reasoning:** RPi.GPIO is a Python library — there is no equivalent native Node.js GPIO library that is stable on Pi 5. A separate process keeps the Node.js backend hardware-agnostic and deployable on non-Pi machines. The service connects as a normal Socket.IO client, so no backend changes are needed to support or test it (aside from the `podium-button-press` event handler).

---

## Decision 012 - 2026-03-12
**Problem:** SideMonitor communication — localStorage vs. HTTP polling
**Options:**
- A: `localStorage` + `storage` events (cross-tab communication)
- B: HTTP polling `GET /api/podium/status` every 2 seconds

**Chosen:** HTTP polling (Option B)
**Reasoning:** PlayerView (HDMI-1) and SideMonitor (HDMI-2) run in separate Chromium processes launched against different X displays (`:0` and `:1`). Separate OS-level processes do not share the same localStorage namespace or receive each other's storage events. HTTP polling is the only reliable cross-process communication path without adding a separate IPC channel.

---

## Decision 014 - 2026-03-15
**Problem:** Allow quiz images to work offline without requiring an external CDN or manual file placement
**Options:**
- A: URL reference only — host pastes an external image URL into the quiz editor
- B: Browser-based file upload — Quiz Creator uploads the file to the server's `media/` folder via `POST /api/media/upload`; stores filename in the quiz JSON

**Chosen:** Browser upload (Option B)
**Reasoning:** Decision 008 chose URL reference because file upload added infrastructure. However, the LAN-only / offline requirement means external URLs cannot be trusted — if a venue has no internet, the image will not load. Uploading through the browser (multer, 5 MB limit, MIME whitelist) keeps the file local and the upload experience is equivalent to attaching an image in any CMS. The `media/` folder already existed for manual file placement; this adds only the upload endpoint and a `<input type="file">` in the creator. Decision 008 remains correct for audio (rare, typically served externally) — this decision covers images only.

---

## Decision 013 - 2026-03-12
**Problem:** Category mode — optional vs. mandatory
**Options:**
- A: Optional — hosts choose standard or category mode per quiz
- B: Mandatory — all quizzes must use category mode; standard quizzes rejected at launch

**Chosen:** Mandatory (Option B)
**Reasoning:** The podium hardware game flow assumes category selection happens between every question. The PlayerView, ProjectorView, and game pacing are all designed around this flow. Allowing standard quizzes would skip the CATEGORY_SELECT phase and produce a disjointed player experience (e.g. buttons sitting idle, timebar appearing without context). Enforcing category mode at the server level makes the constraint explicit and prevents subtle bugs.

**Update (Session 9, 14 March 2026):** The server-side `categoryMode: true` rejection check was later removed because all standard-format quizzes were deleted from the library and the QuizCreator was simplified to always produce category format. The constraint is now enforced at the editor level rather than the server level.

---
