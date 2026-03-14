# PROGRESS.md — Quiz Room Local (Kiosk Edition)

> Read this file fully before continuing development.
> Last updated: 14 March 2026 (Session 7 — Podium Assembly Manual)

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
- Category mode enforced server-side — `create-quiz` rejects non-category quizzes
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
| `frontend/src/components/QuizCreator.jsx` | Modified ✅ | v0.2.1 |
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

## WebSocket Events Reference

### Client → Server
| Event | Data | Notes |
|-------|------|-------|
| `create-quiz` | `{ quizData, settings, playerCount }` | Sets currentActiveRoom; playerCount for auto-start |
| `join-quiz` | `{ nickname, roomCode? }` | roomCode optional in kiosk |
| `submit-answer` | `{ answerId: 0-3 }` | |
| `submit-category` | `{ choiceIndex: 0-1 }` | |
| `get-game-state` | `{ roomCode }` | |
| `watch-room` | `{ roomCode }` | |
| `host-control` | `{ roomCode, action }` | |
| `podium-button-press` | `{ buttonIndex: 0-3 }` | From GPIO service only — submits answer on behalf of player |

### Server → Client
Same as quiz-room-auto + `NO_ACTIVE_ROOM` (new in kiosk fork). `ANSWER_COUNT` event now used by ProjectorView live counter.

---

## Routes

| URL | Component | Who uses it |
|-----|-----------|-------------|
| `#/` | PlayerView | Tablets (kiosk podiums) |
| `#/host` | HostView | Host device |
| `#/create` | QuizCreator | Quiz editor |
| `#/stats` | StatsPanel | Admin |
| `#/screen` | ProjectorView | Central stand big screens |
| `#/side` | SideMonitor | Podium side monitor (HDMI-2) |

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

## How to Continue Development

Say:
> "Read CLAUDE.md and PROGRESS.md and continue. Here's what I want: [task]"

All phases complete. Project is v0.3.0 — production-ready for physical podium deployment.
