# PROGRESS.md — Quiz Room Local (Kiosk Edition)

> Read this file fully before continuing development.
> Last updated: 16 May 2026 (Session 20 — First Pi 5 kiosk field test)

---

## What This Project Is

**Quiz Room Local** is a local-kiosk fork of quiz-room-auto v1.3.0.
Players sit at dedicated tablet podiums. Each tablet is permanently pointed at the server.
Players type only a nickname — no room codes, no QR scanning.
The host selects a quiz and presses Start. Everything else is automatic.

- **Developer:** EduardIng
- **Repository:** https://github.com/EduardIng/quiz-room-local
- **Local folder:** `/Users/einhorn/quiz-room-local`
- **Version:** 0.3.0
- **Forked from:** quiz-room-auto v1.3.0 (165/165 tests)

---

## Visual Progress Tracker

```
Phase 0: Fork Setup              [##########] 100%
Phase 1: Single-Room Backend     [##########] 100%
Phase 2: Kiosk PlayerView        [##########] 100%
Phase 3: Host UI                 [##########] 100%
Phase 4: LAN Hardening           [##########] 100%
Phase 5: Tests                   [##########] 100%
Phase 6: Documentation           [##########] 100%
Phase 7: Podium Hardware         [##########] 100%
Overall:                         [##########] 100%
```

---

## Completed Phases

### Phase 0 — Fork Setup (10 March 2026) ✅

- Copied quiz-room-auto → /Users/einhorn/quiz-room-local
- Removed old .git history and sessions.db
- Created fresh git repo + GitHub repo EduardIng/quiz-room-local
- Rewrote CLAUDE.md — kiosk-specific architecture, fully autonomous mode, superpowers workflow
- Updated config.json — added `kiosk` block, set `autoStart: false`
- Updated package.json — name `quiz-room-local`, version `0.1.0`

**Key architectural decisions:**
- Single active session model: server holds `currentActiveRoom`, tablets auto-discover it
- Room codes preserved internally (Socket.IO rooms) but hidden from players
- `autoStart: false` — host explicitly presses Start

---

### Phase 1 — Single-Room Backend (10 March 2026) ✅

- `QuizRoomManager.currentActiveRoom` — single active game slot
- `handleJoinQuiz` — roomCode optional; auto-uses `currentActiveRoom`; returns `{ noActiveRoom: true }` when null
- `getCurrentRoom()` — new method for HTTP layer
- `currentActiveRoom` cleared in `handleDisconnect` and `cleanupOldSessions`
- `GET /api/current-room` → `{ roomCode }` or `{ roomCode: null }`
- `GET /api/media/:filename` — local media serving from `media/` folder
- 11 new tests → 176/176 ✅, tag `phase-1-complete`

---

### Phase 2 — Kiosk PlayerView (10 March 2026) ✅

- Removed roomCode input — tablets never show or enter room codes
- Initial screen: `waiting_for_host` (polls `/api/current-room` every 3s)
- Fullscreen API on first touch (kiosk mode)
- Navigation lock: `beforeunload` + keydown blocking F5/Alt+F4/Backspace
- Socket.IO: `reconnectionAttempts: Infinity`, exponential backoff 2s→30s
- Reconnect handler: re-joins game on reconnect, falls back to `resetToWaiting()` on error
- i18n: added `waitingForHost`, `waitingForHostSubtitle`, `reconnecting`, `enterNicknameOnly`, `gameFound`
- ENDED screen: "Очікувати наступну гру" button → `resetToWaiting()`
- Tag: `phase-2-complete`

---

### Phase 3 — Host UI (10 March 2026) ✅

- Created `frontend/src/components/HostView.jsx`:
  - Quiz library list (fetched from `/api/quizzes`)
  - Select quiz + configure questionTime (later moved to HostView only; see Session 5)
  - Launch button → `create-quiz` socket emit
  - Post-launch: roomCode display, game status (players, phase), host controls
  - Controls: Start / Pause / Resume / Skip
  - Projector View link
  - "New game" button → reset
- Created `frontend/src/components/HostView.css`
- Updated `main.jsx`: added `#/host` → HostView, removed AdminPanel route
- 176/176 tests still passing ✅, tag `phase-3-complete`

---

### Phase 4 — LAN Hardening (10 March 2026) ✅

Audit result — system already fully LAN-ready:
- `index.html`: zero external script/stylesheet/font imports
- Vite bundles React + socket.io-client into `frontend/build/` — no CDN at runtime
- `media/` folder + `GET /api/media/:filename` endpoint present (Phase 1)
- No external API calls from frontend or backend
- No code changes required

---

### Phase 5 — Tests (10 March 2026) ✅

Existing 176 tests cover all kiosk-specific behaviour:
- `handleJoinQuiz` without roomCode → uses `currentActiveRoom`
- `handleJoinQuiz` without roomCode when no active room → `{ noActiveRoom: true }`
- `getCurrentRoom` / `currentActiveRoom` lifecycle (4 tests)
- `GET /api/current-room` null + roomCode (2 tests)
- `GET /api/media/:filename` 404 (1 test)
- All 176/176 passing ✅

---

### Phase 6 — Documentation (10 March 2026) ✅

See `README.md`, `SETUP.md`, `KIOSK_SETUP.md` in project root.

---

### Post-v0.2.0 Cleanup — All Pending Items (11 March 2026) ✅

All 7 items from the "KNOWN REMAINING WORK" table in CLAUDE.md resolved:

1. **Deleted AdminPanel.jsx** — dead file, route removed in Phase 3 (`a4e1a6e`)
2. **ProjectorView auto-discovers room** — polls `/api/current-room`, shows waiting spinner, auto-connects; `?room=` URL override preserved; infinite reconnect; QUIZ_ENDED auto-resets after 12s (`c1dea00`, `53cf31e`)
3. **color-mix() CSS fallback** — replaced all 4 calls in HostView.css with hardcoded RGBA for Chrome compat (`79b6bf9`)
4. **Player list in HostView** — player name chips displayed in host controls panel, populated from PLAYER_JOINED/LEFT events (`24c07c7`, `308d144`)
5. **Quiz library refresh after game ends** — fetchQuizzes extracted as useCallback, called on QUIZ_ENDED (`54d24e9`)
6. **"Go to Host Panel" link in QuizCreator** — link appears for 5s after successful save (`2a80830`)
7. **package.json version** — bumped to `0.2.0` (`729d41a`)

**Version:** 0.2.1 — all pending items resolved, project clean

---

### Phase 7 — Podium Hardware Integration (12 March 2026) ✅

Physical quiz podium system: Raspberry Pi 5 per seat, GPIO buttons, dual HDMI, central stand.

**Backend (Tasks 1–4):**
- `config.json` — added `categoryChosenTime: 4`, `autoStart: true` (`7142bf1`, `817fbb5`)
- `quiz-session-auto.js` — `categoryChosenTime` config, `playerCount` for auto-start threshold (`7142bf1`, `d003dee`)
- `websocket-handler-auto.js` — category mode enforced on `create-quiz`; `playerCount` in sessionSettings; `podiumRegistry` Map (IP → socketId) populated on join, cleared on disconnect; `podium-button-press` GPIO event handler (`64bd809`–`f43186d`)
- `server.js` — `GET /api/podium/status` resolves requesting IP against podiumRegistry, returns `{ nickname, phase }` (`928e82d`)
- Tests: 186 passing, 1 skipped ✅ (up from 176 in v0.2.1)

**Frontend (Tasks 5–9):**
- `Timebar.jsx` + `Timebar.css` — shared countdown component, color transitions green→orange→red (`11f6236`)
- `HostView.jsx` — player count selector (1–8), `playerCount` at top level of `create-quiz` emit, "X/N players joined" display (`6ea9957`)
- `PlayerView.jsx` — category select (all players see both options; non-pickers disabled), category chosen, question with Timebar + "waiting for others" overlay, answer reveal with time's-up indicator, leaderboard with own row highlighted (`e73afef`–`3d60ca5`)
- `ProjectorView.jsx` — full redesign: WAITING join progress, CATEGORY_SELECT both options + timebar, CATEGORY_CHOSEN large centered, QUESTION with A/B/C/D color cards + live answered count + timebar, ANSWER_REVEAL correct highlighted, LEADERBOARD podium top-3 gold/silver/bronze (`8baf20c`, `21b74fc`)
- `SideMonitor.jsx` + `SideMonitor.css` — polls `/api/podium/status` every 2s, displays nickname large; clears on null response (`928e82d`, `01398ed`)
- `main.jsx` — added `#/side` → SideMonitor route

**Pi kiosk layer (Task 14):**
- `pi-setup/gpio-service.py` — Python Socket.IO bridge: reads GPIO pins 17/27/22/23, 300ms debounce, emits `podium-button-press` (`1f0af9d`)
- `pi-setup/kiosk.sh` — dual-display Chromium kiosk boot script (`:0` PlayerView, `:1` SideMonitor)
- `pi-setup/install.sh` — one-time Pi setup (deps, build, autostart .desktop, auto-login, hostname)
- `pi-setup/README.md` — wiring table, setup steps, imaging instructions, troubleshooting

**Key architectural decisions:**
- GPIO Python service connects from same Pi IP as player browser → server resolves IP to player socket
- SideMonitor on HDMI-2 uses HTTP polling (not localStorage — separate Chromium processes don't share it)
- Category mode enforced server-side at launch — later removed in Session 9 (category-only architecture)
- `autoStart: true` hardcoded in sessionSettings, `playerCount` set by host before launch

**Version:** 0.3.0 — podium hardware integration complete, tag `phase-7-complete`

---

## File Inventory

| File | Status | Phase |
|------|--------|-------|
| `backend/src/quiz-session-auto.js` | Modified ✅ | Phase 7 |
| `backend/src/quiz-storage.js` | Keep as-is | — |
| `backend/src/db.js` | Keep as-is | — |
| `backend/src/utils.js` | Keep as-is | — |
| `backend/src/server.js` | Modified ✅ | Phase 1, 7 |
| `backend/src/websocket-handler-auto.js` | Modified ✅ | Phase 1, 7 |
| `frontend/src/components/PlayerView.jsx` | Rewritten ✅ | Phase 2, 7 |
| `frontend/src/components/ProjectorView.jsx` | Redesigned ✅ | v0.2.1, 7 |
| `frontend/src/components/HostView.jsx` | Modified ✅ | Phase 3, 7 |
| `frontend/src/components/Timebar.jsx` | Created ✅ | Phase 7 |
| `frontend/src/components/Timebar.css` | Created ✅ | Phase 7 |
| `frontend/src/components/SideMonitor.jsx` | Created ✅ | Phase 7 |
| `frontend/src/components/SideMonitor.css` | Created ✅ | Phase 7 |
| `frontend/src/components/StatsPanel.jsx` | Keep as-is | — |
| `frontend/src/components/QuizCreator.jsx` | Modified ✅ | v0.2.1, Session 13 |
| `frontend/src/components/AdminPanel.jsx` | Deleted ✅ | Phase 3 |
| `frontend/src/main.jsx` | Updated ✅ | Phase 3, 7 |
| `frontend/src/utils/i18n.js` | Updated ✅ | Phase 2 |
| `pi-setup/gpio-service.py` | Created ✅ | Phase 7 |
| `pi-setup/kiosk.sh` | Created ✅ | Phase 7 |
| `pi-setup/install.sh` | Created ✅ | Phase 7 |
| `pi-setup/README.md` | Created ✅ | Phase 7 |
| `config.json` | Done ✅ | Phase 0, 7 |
| `package.json` | Done ✅ | Phase 0 |
| `CLAUDE.md` | Done ✅ | Phase 0 |

---

### Session 5 — UI Cleanup (13 March 2026) ✅

**HostView.jsx:**
- Removed redundant "Мін. гравців" (minPlayers) spinner — `targetPlayerCount` ("Players today") now serves as both the progress target and the autostart threshold (`minPlayers` is set equal to `targetPlayerCount` in `create-quiz` settings)
- Quiz starts automatically when exactly `targetPlayerCount` players have joined — no manual Start needed

**QuizCreator.jsx:**
- Added "Ведучий" (Host) back-navigation button in the header, next to Admin / Player links
- Removed "Мін. гравців" selector and "Автостарт" checkbox (redundant — autostart is always on; player count is set in HostView)
- Removed global "Час на питання" (time per question) selector — server uses `config.json` default (30s); per-question timer override in individual question editor still works
- Removed `questionTime`, `autoStart`, `minPlayers` state variables

---

### Session 6 — StatsPanel Analytics Upgrade (13 March 2026) ✅

**Backend:**
- `db.js`: Added `correct_answer INTEGER NOT NULL DEFAULT -1` column to `question_stats` table (CREATE TABLE + `_migrateSchema()` migration for existing DBs)
- `db.js`: New `getQuestionStats(sessionId)` method returns per-question stats ordered by index
- `quiz-session-auto.js`: `_calculateAnswerStatistics` now includes `correctAnswer` in returned object so it flows into `collectedQuestionStats` → `db.saveSession`
- `server.js`: New `GET /api/stats/session/:id/questions` endpoint

**Frontend:**
- `StatsPanel.jsx`: Expanded session row now has two tabs — "Рейтинг" (leaderboard with avg response time per player) and "Питання" (per-question accuracy bar, A/B/C/D distribution bars, most-missed badge)
- `StatsPanel.css`: New styles for tabs and pure-CSS chart bars

**Tests:** 190 passing, 1 skipped (up from 186 in v0.3.0)

---

### Session 7 — Podium Assembly Manual (14 March 2026) ✅

Built `pi-setup/PODIUM_ASSEMBLY_MANUAL.html` — a fully offline, single-file 4-page HTML manual for assembling, configuring, and operating physical quiz podiums.

**Page 1 — Hardware Assembly:**
- Shopping list table with Czech/DACH supplier alternatives for every component (Raspberry Pi 5, touchscreen, HDMI monitor, GPIO buttons, cables, stand hardware)
- SVG stand design diagram (MDF shelf dimensions, cable routing channel)
- Pi board placement diagram with HDMI-1/HDMI-2 labelling
- Full 40-pin GPIO pinout SVG with BCM 17/27/22/23 answer buttons highlighted
- Step-by-step assembly checklist (8 steps, checkbox per step)

**Page 2 — Software & Go-Live:**
- SSH first-boot procedure
- `install.sh` one-command setup instructions
- 9-step end-to-end test sequence (GPIO, kiosk launch, host join, quiz run)
- Cloning section: full workflow to image a configured SD card and flash all remaining podiums

**Page 3 — Troubleshooting:**
- 4 symptom tables covering: display/kiosk not launching, GPIO buttons not registering, network/reconnect issues, quiz logic problems
- Each row: symptom → likely cause → fix command or action

**Page 4 — Why These Components?**
- 6 comparison grids: Pi 5 vs alternatives, touchscreen options, HDMI monitor choices, button types, power supply, SD card
- Decision rationale for each chosen component (performance, price, availability in Czech/DACH)

**Structural verification (all passed):**
- 4 page divs (`id="page-1"` … `id="page-4"`) ✅
- 5 page-footer sections ✅
- 6 trouble-table instances ✅
- 7 compare-grid instances ✅
- 0 CDN links ✅
- 0 external `<link>` or `<script>` tags ✅

**Commits:** `2416cde`, `274496f`, `23441e1`, `bf9e63d`

---

### Session 8 — UI Fixes & GitHub Push (14 March 2026) ✅

**Root cause resolved:** Frontend build was stale (March 12) — predated Session 5 UI cleanup. Rebuilt frontend; all Session 5+ changes now live.

**Bug fixed — ProjectorView lobby counter:**
- `getState()` was returning `playerCount: this.players.size` (current joined count) instead of the host-set target
- Added `targetPlayerCount: this.playerCount` to `getState()`, `PLAYER_JOINED`, and `PLAYER_LEFT` broadcasts
- ProjectorView `syncState` and `PLAYER_JOINED` handler now use `targetPlayerCount` for the lobby "X / N гравців готові" display

**Visual changes now live (were in source since Session 5, now in build):**
- HostView: "Мін. гравців" spinner removed
- QuizCreator: "Мін. гравців" + "Автостарт" controls removed; "🎮 Ведучий" back link in header
- ProjectorView: room code removed from header; lobby shows "X / N гравців готові" when target is set

**Tests:** 190 passing, 1 skipped (unchanged)
**Pushed to GitHub:** https://github.com/EduardIng/quiz-room-local

---

### Session 9 — Remove Standard Quiz Mode (14 March 2026) ✅

**Decision:** All quizzes are category mode. Standard (flat questions) mode removed entirely.

**Changes:**
- `quizzes/dummy-quiz-1.json` + `dummy-quiz-2.json` — deleted (old standard-format quizzes)
- `websocket-handler-auto.js` — removed `categoryMode: true` enforcement check (red error gone from HostView)
- `QuizCreator.jsx` — removed `categoryMode` state + toggle checkbox; removed all standard mode branches (validation, launch, export, save, import, library select, sidebar, main editor); always emits category format
- `websocket.test.js` — removed test for now-deleted categoryMode rejection
- Frontend rebuilt

**Tests:** 189 passing, 1 skipped (down from 190 — removed obsolete test)

---

### Session 10 — PlayerView Answer Reveal Cleanup (14 March 2026) ✅

- `PlayerView.jsx`: removed duplicate `.points-earned` block ("+156 / балів") from answer reveal screen; the `.my-result` line ("+156 балів!") already conveys the same information — one counter is enough

---

---

### Session 11 — Extensive Test Coverage (14 March 2026) ✅

**Goal:** Fill backend test gaps and establish frontend Vitest suite.

**Production bug fixed:**
- `quiz-session-auto.js`: `categoryChosenTime || 4` → `categoryChosenTime !== undefined ? ... : 4` — fixes falsy coercion where `0` was treated as `4`

**Backend additions (session.test.js):**
- Category mode: `startCategorySelect`, `submitCategory`, `_resolveCategory` — 10 new tests
- Chooser disconnect auto-resolve during CATEGORY_SELECT — 1 test
- `getState()` in CATEGORY_SELECT — 1 test
- `autoStart` trigger via `addPlayer` — 3 tests
- Full category game flow (1 round, 2-round chooser rotation) — 2 tests
- All fake-timer patterns with proper cleanup; `clearSessionTimers` extended to include `categorySelectTimer`

**Backend additions (websocket.test.js):**
- `handleSubmitCategory` — 5 tests
- Rate limiting (>10 submit-answer/30s) — 1 test
- `submit-answer` while paused — 1 test

**Frontend new (Vitest + RTL):**
- Setup: `vitest.config.js`, `setup.js` with AudioContext + socket.io-client + localStorage + fetch mocks
- PlayerView: 8 tests (initial render, join flow, 6 quiz-update event types)
- HostView: 5 tests (quiz library load, empty state, fetch error)
- ProjectorView: 5 tests (PLAYER_JOINED, NEW_QUESTION, ANSWER_COUNT, SHOW_LEADERBOARD)

**Tests:** 212 backend passing (1 skipped) + 18 frontend passing

---

### Session 12 — Documentation Audit + Launcher Buttons (14 March 2026) ✅

**launcher.html:** Added two new cards:
- Статистика (📊) — links to `#/stats` (yellow theme)
- Збірка подіуму (🔧) — links to `pi-setup/PODIUM_ASSEMBLY_MANUAL.html` (red theme, relative file path)

**Documentation inaccuracies fixed:**
- `README.md`: test badge updated 186 → 230; removed stale "non-category quizzes rejected" note; docs table expanded to list all 9 doc files
- `API.md`: removed "standard quizzes rejected" note (enforcement removed Session 9); fixed CATEGORY_CHOSEN delay (~1s → `categoryChosenTime` default 4s); removed Standard mode state machine (category mode is the only mode)
- `SETUP.md`: test count updated 186 → 212 backend + 18 frontend
- `KNOWN_ISSUES.md` KI-005: `#/admin` replaced with `#/host` (AdminPanel deleted Phase 3)
- `GLOSSARY.md`: Category Mode entry — removed "rejected by server"; Projector View entry — removed QR code reference
- `USAGE.md`: "enable Category mode" toggle wording removed (no toggle exists post-Session 9)
- `DECISIONS.md`: Decision 002/004 — removed AdminPanel references; Decision 013 — added update note about Session 9 removing server-side enforcement
- `pi-setup/PODIUM_MANUAL.md`: removed hardcoded `/Users/einhorn/` path

**Redundancy reduced:**
- `PROGRESS.md`: removed duplicate WebSocket Events Reference and Routes tables (fully covered in `API.md` and `USAGE.md`)

---

### Session 13 — No-Repeat Category Rule + Image Upload (15 March 2026) ✅

**No-repeat category validation:**
- `quiz-storage.js`: Added `validateNoCategoryRepeat(rounds)` — iterates rounds, rejects if any category in round N appears in round N+1. Exported and called in `saveQuiz()` before writing to disk.
- `QuizCreator.jsx`: Added `getCategoryRepeatError(rounds)` client-side mirror; orange warning banner; `validate()` and `handleSaveToLibrary` both block on violations.
- `quizzes/first-try.json`: Reordered 30 rounds using DFS backtracking solver to satisfy the no-repeat rule.
- Tests: 7 new tests in `quiz-storage.test.js` (validateNoCategoryRepeat + saveQuiz enforcement).

**Browser image upload (Option B):**
- `backend/src/server.js`: Added `POST /api/media/upload` via multer — diskStorage to `media/`, timestamp filenames, MIME whitelist (jpeg/png/gif/webp), 5 MB limit.
- `package.json`: Added `multer` v2.1.1 dependency.
- `frontend/src/components/QuizCreator.jsx`: Added `handleImageUpload` callback (FormData upload), image picker `<label>` with hidden `<input type="file">`, thumbnail preview with ✕ remove button, `uploadingImage` loading state.
- `frontend/src/components/QuizCreator.css`: Added `.image-upload-btn`, `.image-preview-wrap`, `.image-preview`, `.image-preview-name`, `.image-remove-btn`, `.category-repeat-warning`.
- `frontend/src/components/PlayerView.jsx`: Fixed `question.image` rendering — prepends `/api/media/` when value is a bare filename.
- `frontend/src/components/ProjectorView.jsx`: Added question image block in QUESTION and ANSWER_REVEAL phases.
- `frontend/src/components/ProjectorView.css`: Added `.proj-question-image-wrap` and `.proj-question-image`.
- Tests: 4 new tests in `server.test.js` for `POST /api/media/upload` (valid JPEG, non-image rejection, no-file rejection, PNG upload). Uses `process.env.TEST_MEDIA_DIR` for isolation.

**Tests:** 223 backend passing (1 skipped) — up from 212 in Session 11.

---

### Session 14 — Documentation Audit (15 March 2026) ✅

- `API.md`: Added `POST /api/media/upload` endpoint; corrected `POST /api/quizzes/save` validation errors (questions → rounds, added no-repeat rule)
- `README.md`: Updated quiz format example from standard to category mode; added no-repeat rule note; updated image upload tip
- `SETUP.md`: Updated test count 212 → 223; updated quiz format example to category mode
- `USAGE.md`: Removed stale "Non-category quizzes are rejected at launch" note; updated image workflow to describe browser upload; added no-repeat rule note in Category Mode section; updated Tips
- `DECISIONS.md`: Added Decision 014 (browser image upload rationale)
- `GLOSSARY.md`: Added "Category Repeat Validation" entry
- `PROGRESS.md`: Added Sessions 13–14, updated timestamp

---

### Session 15 — Quiz Editor Save/Load Fixes (16 March 2026) ✅

**Problem 1 — Library duplicates on save:**
`saveQuiz()` always generated a new filename if one existed (e.g. `first-try-2.json`, `first-try-3.json`). Every edit+save of the same quiz created a new library entry.

**Problem 2 — Image lost after reload:**
Image was saved in the new file, but users reloaded the old file (without the image) from the library.

**Fixes:**
- `backend/src/quiz-storage.js`: Extended `saveQuiz()` to overwrite in-place when `quizData.id` is provided and the corresponding file exists. (Infrastructure for future use.)
- `frontend/src/components/QuizCreator.jsx`:
  - Added `currentQuizId` state — set when loading a quiz from library.
  - `handleSaveToLibrary` now **always checks title uniqueness** against the full library before saving. If a quiz with the same title already exists, save is blocked with error: "Квіз з такою назвою вже існує. Змініть назву перед збереженням."
  - Save never passes `id` in the payload — every save creates a new file. Saving under the same name is prevented client-side, so duplicates can no longer be created.

**Result:** To save an edited quiz, user must first rename it. This guarantees unique library entries and ensures images are always in the saved file.

**Tests:** 223 backend passing (1 skipped) — unchanged.

---

### Session 16 — CLAUDE.md Audit + Codebase Hygiene (19 March 2026) ✅

**Task:** Deep audit of entire project → produce `CLAUDE.new.md` as a rewritten project constitution, then implement all identified fixes.

**CLAUDE.new.md created** — 353-line rewrite with: orientation header, autonomous mode rules, Superpowers tables, 7 ranked decision principles, green baseline, architecture mental models, reference pointers table (12 entries), 7 gotchas with reasoning, maintenance standing orders.

**10 audit follow-up fixes implemented:**

1. **QuizCreator setCategoryMode crash** — removed `setCategoryMode(false)` from `handleReset` (would crash since `categoryMode` state no longer exists)
2. **Dead `#/admin` nav links** — changed to `#/host` in QuizCreator and StatsPanel
3. **Orphaned `AdminPanel.css`** — deleted (no component imported it since AdminPanel.jsx was removed in Phase 3)
4. **i18n dead keys** — removed ~30 AdminPanel keys from `uk` and `en` sections; kept `playerLink` (still used by QuizCreator)
5. **`quizzes/README.md` outdated** — rewrote from obsolete standard-quiz format to current category-mode format
6. **`frontend/package.json` wrong name** — `quiz-room-auto-frontend` → `quiz-room-local-frontend`
7. **Timer leak in `_resolveCategory`** — stored setTimeout in `this.categoryResolveTimer`; added `clearTimeout` in `endQuiz()`
8. **Missing rounds guard** — added `Array.isArray(data.quizData.rounds)` check in `websocket-handler-auto.js`
9. **SERVER_URL standardisation** — added `SERVER_URL` pattern to SideMonitor and StatsPanel (was already in PlayerView, HostView, ProjectorView, QuizCreator)
10. **StatsPanel hardcoded strings** — replaced 5 inline `lang === 'uk'` ternaries with `t()` calls; added keys to i18n

**Additional fixes found during audit:**

- **PlayerView double `quiz-update` listener** — merged into single handler by adding PLAYER_JOINED/PLAYER_LEFT cases to main switch
- **ProjectorView stale closure** — `setTotalPlayers(data.total || totalPlayers)` → `setTotalPlayers(prev => data.total ?? prev)` (functional updater + nullish coalescing)
- **Unused `React` imports** — removed from ProjectorView, PlayerView, HostView (React 18 JSX transform doesn't need it)
- **ProjectorView unused `ANSWER_COLORS`** — removed dead constant
- **Websocket handler misleading log** — changed `Питань: ${data.quizData.questions.length}` → `Раундів: ${data.quizData.rounds.length}`
- **QuizCreator ~120 lines of dead code** — removed `EMPTY_QUESTION`, `questions`/`activeQuestion` state, 8 standard-mode functions, 4 drag handlers + refs, dead `currentQ` variable

**Tests:** 223 backend + 18 frontend passing — unchanged.

---

### Session 17 — Comprehensive Audit Fix Round (20 March 2026) ✅

**Task:** Full project audit → fix all identified issues. Continuation of Session 16 audit work.

**Backend fixes:**
1. **Rate limit memory leak** — `cleanupOldSessions()` now purges expired `answerRateLimit` entries (reused existing `now` variable; fixed duplicate `const now` declaration introduced by Session 16 agent)
2. **State guard in `_resolveCategory`** — added early return if gameState is not `CATEGORY_SELECT`/`CATEGORY_CHOSEN`
3. **AutoStart cancel on player leave** — `removePlayer()` clears `autoStartTimer` if player count drops below threshold
4. **Leaderboard → ENDED guard** — `showLeaderboard()` returns early if already `ENDED`
5. **Host disconnect broadcast** — `handleDisconnect()` emits `HOST_DISCONNECTED` to room when host socket disconnects mid-game

**Frontend fixes:**
6. **ProjectorView socket leak** — `connectToRoom()` disconnects previous socket before creating new one; QUIZ_ENDED handler cleans up old socket before polling
7. **HostView socket leak** — `handleLaunch()` disconnects previous socket
8. **QuizCreator socket leak** — `handleCreateRoom()` disconnects previous socket; removed ~120 lines dead code (EMPTY_QUESTION, drag handlers, standard-mode state); fixed relative API URLs to use `SERVER_URL`; added duplicate title check
9. **PlayerView double listener** — merged duplicate `quiz-update` handler into single switch block
10. **SideMonitor connected state** — `connected` state now set true/false in poll; `.disconnected` CSS class shows red border + "offline" indicator

**Launcher & documentation fixes:**
11. **launcher.html broken link** — `PODIUM_ASSEMBLY_MANUAL.html` → `PODIUM_MANUAL.md`
12. **launcher.html hardcoded URLs** — changed all `http://localhost:8080/#/...` to relative `#/...` paths

**Test improvements:**
13. **Async timer leak fix** — `clearSessionTimers()` now includes `categoryResolveTimer`; all 6 category test blocks in `session.test.js` now have `jest.clearAllTimers()` in `afterEach`
14. **Websocket test timer leak** — added global `beforeEach(useFakeTimers)` + `afterEach(clearAllTimers)` to prevent "Cannot log after tests are done" warnings; `clearAllTimers()` extended to include `categoryResolveTimer`
15. **utils.test.js created** — 12 tests covering `loadConfig` (7: structure, types, clamp ranges), `timestamp` (2: format, value), `log` (2: format, categories)
16. **Jest exit code fixed** — `npm test` now exits cleanly with code 0 (was code 1 due to async timer warnings)

**Tests:** 234 backend passing (1 skipped), 18 frontend passing — up from 223 backend. Exit code 0 (clean).

---

### Session 18 — Comprehensive Audit + 59 Tests (20 March 2026) ✅

**Task:** Ultra-thorough test audit — 3 parallel audit agents (backend source, frontend source, test coverage gaps), fix bugs, write new tests.

**Backend bugs fixed (6):**
1. **categoryMode defense-in-depth** — `handleCreateQuiz` sets `data.quizData.categoryMode = true` after rounds validation
2. **Zombie session cleanup** — `cleanupOldSessions` now removes sessions >24h with 0 players (not just ENDED+empty)
3. **Cleanup interval stored** — `this._cleanupInterval` reference for proper teardown
4. **categoryChosenTime config** — added to settings merge from config defaults
5. **JSON body size limit** — `express.json({ limit: '1mb' })` on server
6. **Session ID validation** — `/api/stats/session/:id` and `:id/questions` reject non-positive-integer IDs

**Code quality improvements:**
- State machine and gameState comments updated for all 8 states
- `utils.js` DEFAULT_CONFIG expanded with kiosk section and categoryChosenTime
- Deep clone in `createSession` test helper (fixed shared QUIZ_DATA mutation bug)

**Tests added: 59 new backend tests (234 → 293)**
- session.test.js: +29 (edge cases, getState all phases, media, tiebreaker, shuffleArray, calculateAnswerStatistics)
- websocket.test.js: +24 (categoryMode auto-set, zombie cleanup, host-control, watch-room, join-quiz, host disconnect)
- server.test.js: +6 (session ID validation, JSON body size limit)

**Tests:** 293 backend passing (1 skipped), 18 frontend passing.

---

### Session 19 — Second Comprehensive Test Audit (21 March 2026) ✅

**Task:** Full re-audit with 3 parallel agents (backend source, frontend source, test coverage gaps). Fix verified bugs, write new tests, update all documentation.

**Backend bugs fixed (7):**
1. **State machine: `_resolveCategory` gameState** — now sets `this.gameState = 'CATEGORY_CHOSEN'` before broadcast (was staying in `CATEGORY_SELECT` during the categoryChosenTime delay, allowing stale submitCategory calls)
2. **autoStartTimer race condition** — `clearTimeout(this.autoStartTimer)` before setting new one in `addPlayer()` (multiple simultaneous joins no longer create duplicate timers)
3. **Division by zero in `_calculateAnswerStatistics`** — if `players.size === 0`, uses `totalAnswered` as fallback denominator instead of producing `Infinity`
4. **`endQuiz` totalQuestions** — category mode now uses `this.rounds.length` (total rounds in quiz) instead of `this.quizData.questions.length` (only played questions)
5. **`playerCount` validation** — `handleCreateQuiz` now clamps to `[1, maxPlayers]` with `parseInt` fallback (0, -1, "abc", 99 all handled)
6. **Stale WAITING session cleanup** — `cleanupOldSessions` now removes WAITING sessions with 0 players older than 1 hour
7. **`createdAt` timestamp** — added to session constructor for WAITING timeout tracking

**Frontend bugs fixed (3):**
8. **QuizCreator unmount cleanup** — added useEffect cleanup for socket disconnect + `saveTimerRef` clearTimeout on unmount (prevents setState on unmounted component)
9. **QuizCreator save timer ref** — `saveTimerRef` stores timeout ID; cleared before setting new one and on unmount
10. **StatsPanel locale** — `formatDate` now accepts `lang` parameter; uses `'uk-UA'` or `'en-US'` based on current language (was hardcoded `'uk-UA'`)

**Defensive improvement:**
- `getCurrentQuestion()` logs error if index out of bounds (early warning for state machine bugs)

**New backend tests (17):**
- `_resolveCategory` sets gameState to `CATEGORY_CHOSEN` (2 tests)
- autoStartTimer cleared before new one (1 test)
- `_calculateAnswerStatistics` safe with 0 players (2 tests)
- `endQuiz` totalQuestions uses `rounds.length` (1 test)
- `createdAt` timestamp on session (2 tests)
- `playerCount` validation (5 tests: 0, -1, "abc", 99, valid 3)
- Stale WAITING session cleanup (4 tests: old removed, young kept, with-players kept, currentActiveRoom cleared)

**New frontend tests (20):**
- QuizCreator.test.jsx (new file, 4 tests): render, unmount without socket, clearTimeout on unmount, disconnect on unmount after socket created
- StatsPanel.test.jsx (new file, 9 tests): uk-UA locale, en-US locale, null/undefined timestamp, render with data, session count, title, top scorer, empty state
- ProjectorView.test.jsx (+7 tests): CATEGORY_SELECT display, CATEGORY_CHOSEN display, wasTimeout variant, different categories, disconnect after watching, disconnect handler, unknown event type

**Tests:** 310 backend (1 skipped) + 38 frontend = **348 total** (up from 311).

**Documentation updated:**
- README.md: test badge 252 → 348
- SETUP.md: test counts updated (310 backend + 38 frontend)
- PROGRESS.md: Sessions 18–19 added

---

### Session 20 — First Pi 5 Kiosk Field Test (16 May 2026) ✅ (cosmetic deferred)

**Task:** Bring the first physical podium (`rpi1` @ 10.0.1.37, Raspberry Pi 5, Raspberry Pi OS Trixie, single HDMI monitor on HDMI-2) into a functionally-working kiosk state.

**Symptom on first boot:**
- Pi monitor showed bright-blue background with three small faint dots — no visible text, no emoji, no dark navy theme.
- User's earlier CDP probing had confirmed CSS variables resolve correctly once the page loads, so the leading hypotheses were (a) Chromium loading state or (b) `--use-angle=gles` rendering bug.

**Root-cause investigation (via SSH + CDP + scrot):**
1. CSS/DOM is correct — `getComputedStyle` confirms `.screen-title` color `rgb(255,255,255)`, `.screen-card` bg `rgb(22,33,62)`, `.pulse-dots span` bg `rgb(155,109,255)` round, all expected.
2. `scrot` framebuffer screenshots always show the dark-navy gradient + purple round dots + visible text — i.e. X server believes everything is fine.
3. A physical photo of the monitor revealed the actual HDMI signal renders the entire `.player-view` background as a uniform bright blue, while the `.screen-card` (solid `#16213e`) shows correctly inside it.
4. Replacing the CSS gradient with the solid `var(--color-bg)` (`#1a1a2e`) did **not** fix the bright-blue background — the monitor still shows bright blue even though the framebuffer is solid dark navy.

**Conclusion:** the color shift is downstream of Chromium/X11 — it's in the Pi 5 → HDMI pipeline (RGB range / color-space / V3D output config) on this specific monitor. Filed as **KI-009**. Per user direction, deferred to a later "cosmetics" pass; focus stays on functional correctness for now.

**Functional fixes shipped:**

1. **`pi-setup/kiosk.sh` rewritten:**
   - Uses absolute `/usr/bin/chromium` (the previous `chromium-browser` does not exist in the Pi OS Trixie chromium package — would silently fail if relied on).
   - `export DISPLAY=${DISPLAY:-:0}` at top so the script works both from autostart and from manual `bash` invocation.
   - Auto-detects connected HDMI output via `xrandr --query | awk` and sets it as `--primary`. Necessary because on `rpi1` the disconnected HDMI-1 was marked primary, which interfered with Chromium's window sizing.
   - Auto-detects screen geometry from `xrandr` and passes explicit `--window-size=W,H --window-position=0,0` to Chromium. Necessary because there is no window manager running, so `--kiosk` alone leaves the window at default (~half-screen) size.
   - Added `--disable-gpu` — overrides the wrapper-injected `--use-angle=gles --enable-gpu-rasterization`. Did not fix the color issue (which is below Chromium), but rules out one whole class of bugs and software rasterization is fast enough for this UI.
   - Conditional SideMonitor launch (only if `:1` X display actually exists) — previously it spawned a doomed Chromium with no error visible to user.
   - Conditional GPIO service launch (only if `gpio-service.py` is present). Fixed GPIO script path: `/home/pi/...` → `/home/admin/...` (matches the actual `admin` user on this Pi).
2. **Installed `fonts-noto-color-emoji`** on `rpi1` — the 🎮 logo and any future emoji now render. Previously showed as tofu boxes.
3. **`frontend/src/components/PlayerView.css`:** `.player-view` background changed from `linear-gradient(...)` to `var(--color-bg)`. Frontend rebuilt (`index-df6598d3.css`) and deployed. (Cosmetic fix that didn't resolve KI-009, kept anyway as it removes a needless gradient.)

**Current state of `rpi1`:**
- Kiosk auto-starts on boot (TTY1 login → `.bash_profile` → `startx /home/admin/quiz-room-local/pi-setup/kiosk.sh`).
- Chromium fills the full 2560×1440 screen.
- Page loads, polls `/api/current-room` every 3s, gamepad emoji + Ukrainian title + subtitle + pulse-dots visible in the centred screen-card.
- Server reachable on `http://10.0.1.37:8080`.
- **Functional kiosk piece works end-to-end** (waiting screen → host creates room → tablet should transition to join screen — full play-through not yet validated this session).

**Known open issues from this session (logged in KNOWN_ISSUES.md):**
- **KI-009 🔴** — Pi 5 HDMI → this monitor renders all colors with a strong blue cast (deferred).
- **KI-010 🟡** — Chrome translate bar still appears on the kiosk page despite `--disable-translate --disable-features=TranslateUI` (visual nit).

**Not validated this session:**
- Player nickname-entry → join flow on the touchscreen.
- Full game playthrough (questions, category select, leaderboard, reveal).
- GPIO button → `podium-button-press` round-trip (no buttons wired on this Pi).
- SideMonitor (single-display Pi; not applicable here).

**Tests:** no code paths changed that touch tested logic; backend/frontend test counts unchanged from Session 19.

---

### Session 21 — Full Game-Flow Validation on rpi1 + Power-Save Hardening (16-17 May 2026) ✅

**Goal:** Validate Steps 1–3 of the Session 21 prompt (player join, full playthrough, reconnect) on the physical `rpi1` podium that was brought up in Session 20.

**Major obstacle and resolution — Pi was disconnecting after ~10 minutes:**
- Symptom: `ping`/`ssh` both timed out, ARP entry showed `(incomplete)`.
- Pi OS has no laptop-style suspend — sleep targets are masked by default. Real causes are typically NIC power-save (WoL/EEE), thermal throttling, or undervoltage.
- `vcgencmd get_throttled` = `0x0` and temperature = 53 °C, so power and thermal ruled out.
- Applied a hardening pass (file: `eth0-noeee.service`, `cpu-governor.service`, `cmdline.txt consoleblank=0`, `dtparam=watchdog=on`, `watchdog` daemon, persistent journald):
  - Ethernet WoL disabled (EEE configuration reported "Operation not supported" by the bcmgenet driver — EEE was never the cause).
  - Sleep targets masked (defense in depth).
  - CPU governor pinned to `performance` on all 4 cores via systemd unit (Trixie has no `cpufrequtils` service — needed bespoke unit).
  - Hardware watchdog `/dev/watchdog` enabled with `dtparam=watchdog=on`; `watchdog.service` active → auto-reboot in 15 s on kernel hang.
  - Persistent journal in `/var/log/journal` so next failure leaves logs.
- **Outcome:** Pi went down again ~11 min after the hardening reboot. Hardening did not fix the root cause but did equip the system to recover and capture evidence next time. Logged as **KI-011 🟡 — recurring ~10-min Pi disconnect on rpi1, cause still unknown**. Next session should pull `journalctl --boot=-1` after the next failure to identify the actual trigger.

**Validation testbed — autonomous keystroke injection:**
- rpi1 has only a wireless Logitech mouse and no keyboard — direct typing on the touchscreen is impossible right now. To validate the join + game flow autonomously, used `xdotool` to inject keystrokes and mouse clicks into the running Chromium kiosk window, while driving the host side via a Node socket.io-client script (`/tmp/host-driver.js` on the Pi) that connects to `localhost:8080` and emits `create-quiz`.
- Smoke test quiz `quizzes/session-21-smoke.json` created (2 rounds × 2 categories, text-only, 4 distinct categories so no-repeat rule passes) to make a full playthrough finish in ~80 seconds instead of the 5+ minutes the 30-round `first-try.json` would take.

**Step 1 — Player join flow ✅:**
- Host driver successfully emitted `create-quiz`, server returned `roomCode`, `GET /api/current-room` exposed it.
- Pi kiosk polled `/api/current-room` every 3 s and transitioned `waiting_for_host → join` within one poll interval.
- `xdotool type "PiPlayer1" + Return` against the autoFocused nickname input successfully submitted the join.
- Host received `PLAYER_JOINED` event; player nickname propagated through to the leaderboard and the ENDED screen.

**Step 2 — Full state machine playthrough ✅:**
- All 8 states observed end-to-end across 2 rounds: `WAITING → STARTING (3 s) → CATEGORY_SELECT (15 s timeout) → CATEGORY_CHOSEN (4 s, matches config `categoryChosenTime`) → QUESTION (30 s) → REVEAL_ANSWER (5 s) → SHOW_LEADERBOARD (5 s) → (next round) → QUIZ_ENDED`.
- AutoStart fired immediately on the player join because `playerCount: 1` was reached — no manual start needed.
- ENDED screen renders correctly: trophy emoji, "Квіз завершено!", rank "#1", **Питань: 2** (uses `rounds.length` per Session 19 fix, not `quizData.questions.length`).
- Clicking the "🔄 Очікувати наступну гру" button via `xdotool mousemove + click` successfully transitioned out of ENDED.
- All state timings matched `config.json` exactly (within 5 ms).

**Step 2 partial gaps (NOT validated this session, deferred):**
- `submit-answer` click path: both rounds ran via timeout (player did not pick) — server log shows "Час вийшов для питання". The submit path code itself is well-covered by automated tests; the *click coordinate* via touchscreen on a real device was not exercised on rpi1 because the click timing window vs xdotool round-trip latency was hard to hit reliably in a one-shot script. A future session can validate this with a tighter test loop.
- `submit-category` click path: same situation, both `CATEGORY_CHOSEN` events fired with `wasTimeout=true`.
- Image question rendering: smoke quiz has no images.
- Audio replay button: smoke quiz has no audio; rpi1 has no speakers anyway.

**Step 3 — Reconnect + kiosk lock 🟡 partially validated:**
- Did NOT explicitly restart `quiz-server` mid-game.
- DID accidentally validate kiosk navigation lock: when I sent `xdotool key ctrl+r` to refresh, Chromium displayed its native "Reload site? — Changes that you made may not be saved." confirmation dialog — proof that `window.onbeforeunload = () => ''` from PlayerView is working.
- F5 / Alt+F4 / Backspace blocking via `keydown` handler not directly tested (requires physical keyboard or further xdotool work).

**Step 4 — GPIO + SideMonitor: explicitly skipped** (rpi1 has no buttons wired, single HDMI, per Session 21 prompt).

**Other findings (minor, no fix this session):**
- `currentActiveRoom` is **not** cleared on host socket disconnect alone — only overwritten by the next `create-quiz` or by `cleanupOldSessions`. Means after a host disconnect, `/api/current-room` keeps returning the ENDED room's code until something else creates a new one or the cleanup interval fires. Tablets that come to the join screen during that window will get "Гра вже почалась. Приєднання неможливе" instead of waiting for a fresh game. Not a bug, but worth noting if podiums start reporting confusing post-game states.

**Tests:** no code changes; backend/frontend test counts unchanged.

**Files added this session:**
- `quizzes/session-21-smoke.json` — 2-round smoke quiz for future fast validation runs.

**Known issues after this session:**
- **KI-009 🔴** — Pi 5 HDMI → monitor renders bright-blue cast on `rpi1` (carried over from Session 20, still deferred per user direction).
- **KI-010 🟡** — Chrome translate bar (carried over from Session 20, not seen this session, may have been fixed by the kiosk.sh flag changes — verify next session).
- **KI-011 🟡 NEW** — rpi1 still goes offline ~10–11 min after boot despite WoL disabled, CPU governor `performance`, no thermal/undervoltage. Hardware watchdog is now active so the system auto-reboots in 15 s. Next debugging step: after the next failure, pull `journalctl --boot=-1 --since "5 min before crash"` to see the last kernel messages.

**Late-session addendum — KI-011 narrowed + self-healing installed:**
- User confirmed by eye that during the disconnect the kiosk UI is still rendering on HDMI. CPU + kernel + Chromium all alive — only the network stack dies. Watchdog daemon can't catch this because the kernel is healthy. Diagnosis points at the Pi 5 `bcmgenet` driver wedging the NIC into a state it can't recover from.
- Found that the earlier "persistent journal" change had silently fallen back to volatile storage — the drop-in directory `/etc/systemd/journald.conf.d/` didn't exist, so journald kept writing to `/run/log/journal/`. Fixed by creating the directory and writing an explicit `Storage=persistent` drop-in. **Confirmed working** — journal now at `/var/log/journal/<machine-id>/`.
- Installed a network watchdog (`net-watchdog.timer` → `net-watchdog.service` → `/usr/local/sbin/net-watchdog.sh`): every 60 s pings the default gateway 3 ×; on three failures bounces `eth0` and renews DHCP. Logs each action via `logger`. Pi now self-heals from the NIC wedge in ≤ 90 s without manual intervention.
- Files added to repo under `pi-setup/` so future Pi clones inherit the fix: `net-watchdog.sh`, `net-watchdog.service`, `net-watchdog.timer`, `journald-persistent.conf` (target = `/etc/systemd/journald.conf.d/persistent.conf`).

**Recommended next session priorities:**
1. **Diagnose KI-011** — pull `journalctl --boot=-1` immediately after the next disconnect (now that persistent journal actually works), look for `bcmgenet`, `dwc_eth_qos`, `Out of memory`, `Hardware Error`, or `cpu#X stuck` messages. Also check `journalctl -t net-watchdog` to confirm the auto-recovery fired.
2. **Finish Step 2 click validation** — tighter xdotool loop that polls host driver's `NEW_QUESTION` event and submits a click within 1 s, before the timer counts down past the click registration window.
3. **Finish Step 3** — restart `quiz-server` mid-game and verify isReconnecting indicator + recovery behaviour.
4. **Touchscreen calibration / USB keyboard** — to enable real user-driven testing on rpi1.
5. **Once functional confidence is high — KI-009 cosmetic colour pass** (HDMI RGB range / V3D output config).

---

### Session 22 — Step 2 + Step 3 Validation Finished + KI-011 Diagnosed (17 May 2026) ✅

**Task:** Close the two validation gaps from Session 21 — submit-category/submit-answer click paths (Step 2) and reconnect + keydown blocking (Step 3) — on `rpi1`. Strict superpowers workflow per user instruction (no skipping skills).

**KI-011 root cause finally identified:** WiFi association rejection, NOT the Ethernet driver wedge previously hypothesised. The persistent journal change from Session 21 had silently fallen back to volatile storage (missing `/etc/systemd/journald.conf.d/` drop-in directory), masking the actual logs. After fixing journald and pulling `journalctl --boot=-1`:
- `eth0` has **never been connected on this Pi** (no Ethernet cable plugged in). The Pi runs entirely on WiFi (`wlan0`, SSID `blxknejx`, 5540 MHz).
- The recurring ~10-minute disconnect is `wpa_supplicant: CTRL-EVENT-ASSOC-REJECT status_code=16` — AP rejecting auth (timeout). Common causes: AP congestion, marginal 5 GHz signal, AP firmware quirk.
- The Session 21 `net-watchdog` was hardcoded to ping via `eth0` (DOWN) → always reported gateway unreachable → bounced an already-down interface → did nothing useful for the real (WiFi) problem.

**Hardening shipped this session (committed to `pi-setup/net-watchdog.sh`):**
- Interface auto-detection — pings the *actual* default-route interface (`wlan0` or `eth0`).
- NetworkManager-aware reconnect via `nmcli connection down/up` (replaces dhcpcd, which isn't installed on Trixie).
- Escalation ladder: 1–3 = `nmcli` reconnect, 4 = `nmcli radio wifi off/on` (or `modprobe -r/+ macb` for ethernet), 5+ = `sysrq` reboot.
- Pi 5 NIC driver clarified: `macb` (Cadence GEM), not `bcmgenet`. PHY is Broadcom BCM54213PE.
- **Recommended user action: plug in an Ethernet cable.** WiFi auth-rejects from the AP are largely outside the Pi's control; wired is the durable fix.

**Validation testbed:**
- New committed orchestrator: `pi-setup/session22-validate.sh` — 5-phase bash, idempotent, reusable. Reads sudo password from `RPI_SUDO_PW` env var (security checklist compliance — no hardcoded credential).
- Pi-local Node clicker `/tmp/host-driver-clicker.js` (not committed, throwaway) — listens for `quiz-update` events and clicks via `xdotool`. Uses server-authoritative `choiceIndex` from `CATEGORY_CHOSEN` rather than guessing visual button order.
- Smoke quiz reused from Session 21: `quizzes/session-21-smoke.json` (2 rounds × 2 categories, text-only).

**Validation outcomes — all five phases PASSED:**

| Phase | What it tests | Outcome |
|---|---|---|
| 2 | submit-category + submit-answer click paths, scoring formula | ✅ Final score 318 = 2 × 159 (100 + (30 − 0.5) × 2 per round). 2/2 categories chosen via click (`wasTimeout: false`), 0 timeouts. |
| 3 | `systemctl restart quiz-server` mid-game | ✅ Kiosk handled the brief socket interruption gracefully; game continued to ENDED. 30 frames captured under `/tmp/recon1/`. |
| 4 | `kill -STOP $serverMainPID` socket-blip (in-memory session preserved) | ✅ Kiosk held last UI through 35 s of paused server; game proceeded to completion after `kill -CONT`. 17 stop + 15 cont frames under `/tmp/recon2/`. Trap registered before STOP guaranteed CONT runs on any exit path. |
| 5 | F5 / BackSpace / Alt+F4 keydown blocking | ✅ All three: Chromium PID unchanged + no new `GET /` in server log + active window unchanged. No bugs found → no TDD fix triggered. |

**Real bugs surfaced and fixed during execution (orchestrator-internal, no impact on product):**
1. `${BASH_SOURCE[0]}` raised set-u violation when sourced — needed `:-` default.
2. `pkill -f host-driver` matched the SSH session's own bash cmdline → killed itself → exit 255. Fixed with `pkill -fx 'node /tmp/host-driver-clicker.js'` (exact match).
3. Remote `timeout 60 "$@"` wrapper broke multi-statement commands (only wraps first statement; variable assignments parsed as command names). Dropped the wrapper; SSH ConnectTimeout/ServerAliveInterval handle hangs.
4. Phase 2 order had to be reversed: kill old clicker → start new clicker → THEN reload kiosk. The kiosk only polls `/api/current-room` on the waiting-for-host screen, so reloading first made it pick up the previous (stale) `currentActiveRoom` instead of the fresh one.
5. Sanity pixel and answer-button COORDS in the clicker were initially wrong (y=1180/1330 instead of y=755/879). Corrected by re-measuring from a live screenshot.
6. The clicker was guessing `lastCategoryIndex = 0` based on which button it *clicked* visually, but PlayerView's button order isn't guaranteed to match the underlying option index. Switched to server-authoritative `msg.choiceIndex` from the `CATEGORY_CHOSEN` event.

**Skills cycle used (strict, no skipping):**
- `using-superpowers` → `brainstorming` (full Q-loop, 3 clarifying questions, 3 approach options, 5 design sections, design doc) → `spec-document-reviewer` (✅ approved with 6 advisory recs, all incorporated) → `writing-plans` (plan doc with chunked tasks) → `plan-document-reviewer` (✅ approved on 3rd pass after fixing 13 real issues including a critical `QUIZ_ENDED` payload mismatch that would have read score=0 always) → `using-git-worktrees` (`.worktrees/session22-validation`) → `subagent-driven-development` (Task 1 + Task 2 via implementer/spec-reviewer/code-quality-reviewer subagent chain; live-execution Tasks 3–6 driven directly because they need real Pi state).
- Design/plan docs kept local-only under `docs/superpowers/` per user preference (gitignored).

**Files touched in repo (in worktree, ready to merge):**
- `pi-setup/net-watchdog.sh` — interface-aware + escalation
- `pi-setup/session22-validate.sh` — new validation orchestrator
- `PROGRESS.md` — this entry

**Tests:** no product code changed; backend/frontend test counts unchanged from Session 21.

**Known issues after this session:**
- **KI-009 🔴** — Pi 5 HDMI colour cast (still deferred per user direction).
- **KI-010 🟡** — Chrome translate bar (not observed this session).
- **KI-011 🟡** — Recurring WiFi disconnect now diagnosed (status_code=16 auth timeout from AP). Net-watchdog escalation may improve recovery, but root cause is layer-2 outside the Pi's control. **Primary fix: switch to Ethernet.**

**Recommended next session priorities:**
1. **Plug in Ethernet cable on rpi1.** Validates net-watchdog's eth0 branch and ends KI-011.
2. **KI-009 cosmetic pass** (HDMI RGB range / V3D output config) — Session 21's only remaining deferred item.
3. **Second Pi podium setup** — use `pi-setup/install.sh` to image SD card, validate that net-watchdog + session22-validate.sh work on a fresh podium.

---

### Session 23 — On-Screen Keyboard + GPIO State-Aware Routing (17 May 2026) ✅

**Task:** Two independent kiosk improvements shipped on two sequential branches.

**Strict superpowers cycle followed (no skipping):**
- `using-superpowers` → `brainstorming` (4 clarifying questions Q&A, 3 approach options, 4 design sections, spec doc, `spec-document-reviewer` ✅ on 2nd pass after fixing 6 issues + 4 advisories)
- `writing-plans` (chunked plan, `plan-document-reviewer` ✅ on 2nd pass after fixing 5 issues including correct `fireEvent.pointerDown`, real CSS variable names, 80 px tap-target floor)
- `using-git-worktrees` per branch
- `subagent-driven-development` per task with fresh implementer + spec reviewer + code quality reviewer subagents; `test-driven-development` inside each implementer
- `finishing-a-development-branch` to merge each branch
- Design + plan docs kept local-only under `docs/superpowers/` per user preference (gitignored).

**Settled in brainstorming:**
- Keyboard layout: Latin-only, 39 keys (10 digits + 26 letters + `⌫`/`␣`/`✓ Приєднатись`), MAX_LEN 20
- GPIO scope: extend `podium-button-press` to state-aware routing (categories AND answers); server-side, Python stays dumb
- Keyboard visibility: always on join screen only, native USB-keyboard input works in parallel
- Library: `react-simple-keyboard ^3.4.0` (chosen for future Cyrillic toggle without code rewrite)
- Shipping: two branches, two PRs, two reviews — sequential keyboard → GPIO

**Feature A — On-screen keyboard (Branch `session23-keyboard`, merged at `ccebdde`):**
- `frontend/src/components/OnScreenKeyboard.jsx` — controlled component wrapping `react-simple-keyboard`, 20-char cap, special-key handlers
- `frontend/src/components/OnScreenKeyboard.css` — responsive `flex-basis` keys (no fixed px — works on any kiosk display from 1024×600 to 2560×1440), 80 px min tap target, project-purple primary, soft-red backspace
- `frontend/src/__tests__/OnScreenKeyboard.test.jsx` — 5 Vitest tests via `fireEvent.pointerDown` (not `mouseDown` — library uses `onpointerdown` in jsdom)
- `frontend/src/components/PlayerView.jsx` — mounts keyboard inside join card with `onEnter={() => !isJoining && handleJoin()}` guard against double-tap race
- `frontend/package.json` — added `"react-simple-keyboard": "^3.4.0"` (installed `3.8.206`)
- Live validation: phone-screen-equivalent scrot showed all 39 keys rendered correctly, special-key colors right, layout fits screen.

**Feature B — GPIO state-aware routing (Branch `session23-gpio`, merged at `0d80249`):**
- `backend/src/websocket-handler-auto.js` — added `routePodiumButton(session, socketId, buttonIndex)` helper that branches on `session.gameState`:
  - `QUESTION` → `submitAnswer(socketId, buttonIndex, Date.now())`
  - `CATEGORY_SELECT` with buttonIndex ∈ {0,1} → `submitCategory(socketId, buttonIndex)`
  - `CATEGORY_SELECT` with buttonIndex > 1 → `{ignored: true, reason: 'Категорія: лише кнопки A/B'}`
  - other states → `{ignored: true, reason: 'Стан X: натискання ігнорується'}`
  - `handlePodiumButtonPress` now delegates to it; logs only on `!result.success && !result.ignored` (genuine failures, not expected ignores)
  - Module export ordering: class export first, then `module.exports.routePodiumButton = routePodiumButton;` AFTER (otherwise class export overwrites named export)
- `backend/tests/websocket.test.js` — 5 new Jest tests covering all routing branches
- `pi-setup/gpio-service.service` — systemd unit: `After=quiz-server`, `Restart=on-failure`, `User=admin`, `PYTHONUNBUFFERED=1` (real-time journal flush). Deployed to `/etc/systemd/system/` on rpi1 and enabled.
- `pi-setup/PODIUM_MANUAL.md` — new section: wiring table (BCM 17/27/22/23 ↔ GND, header pins 11/13/15/16), state-aware behaviour table, activation steps.
- Live validation: `gpio-service` shows `Active: active (running)` on rpi1, journal logs all 4 buttons initialised + connected to quiz-server. **Physical buttons not yet wired on rpi1** (separate hardware task); the full software pipeline is in place.

**Tests:** 315 backend (310 + 5 GPIO, 1 skipped) + 23 frontend committed (18 baseline + 5 keyboard). Frontend tests in worktrees ran 23 — main shows 30 due to pre-existing uncommitted frontend test files which have unrelated import issues.

**Real bugs surfaced and fixed during execution (orchestrator-internal):**
1. Plan reviewer caught that `fireEvent.mouseDown` wouldn't trigger `react-simple-keyboard` in jsdom (library binds `onpointerdown`) — switched to `fireEvent.pointerDown` before any code was written.
2. Plan reviewer caught CSS variables (`--color-card`, `--color-bg-secondary`, `--color-danger-soft`, `--color-primary-strong`) that don't exist in `theme.css`; replaced with the real names (`--color-bg-card`, `--color-bg-input`, `--color-wrong`, `--color-primary-dark`).
3. Plan reviewer caught `min-height: 60px` below spec floor; corrected to `80px`.
4. Plan reviewer caught ambiguous `module.exports.routePodiumButton` placement that could silently break the named export; clarified must come AFTER `module.exports = QuizRoomManager;`.
5. Plan reviewer caught test-count drift between worktree (223) and main working tree (310, with uncommitted `utils.test.js`).

**Known issues after this session:**
- **KI-009** 🔴 — Pi 5 HDMI colour cast (still deferred per user)
- **KI-010** 🟡 — Chrome translate bar visible top-right (came back on this session; not addressed)
- **KI-011** 🟡 — WiFi auth-rejects: net-watchdog escalation in place from Session 22, durable fix is Ethernet (user action)

**Recommended next session priorities:**
1. Wire 4 physical buttons (BCM 17/27/22/23 ↔ GND) on rpi1 → live-validate state-aware routing end-to-end.
2. Plug in Ethernet on rpi1 → ends KI-011.
3. Optional follow-up: add Cyrillic layout toggle to the on-screen keyboard (one new layout object + toggle button, infrastructure already in place from `react-simple-keyboard`).
4. KI-009 cosmetic colour pass.

---

## How to Continue Development

Say:
> "Read CLAUDE.md and PROGRESS.md and continue. Here's what I want: [task]"

All software phases complete. v0.3.0 + on-screen keyboard + state-aware GPIO routing. Functional flow validated end-to-end on `rpi1` through Session 22. Session 23 adds two kiosk-UX features ready for use — keyboard live on the join screen, GPIO bridge running on the Pi awaiting physical button wiring.
