# PROGRESS.md — Quiz Room Local (Kiosk Edition)

> Read this file fully before continuing development.
> Last updated: 10 March 2026 (Session 1 — fork setup)

---

## What This Project Is

**Quiz Room Local** is a local-kiosk fork of quiz-room-auto v1.3.0.
Players sit at dedicated tablet podiums. Each tablet is permanently pointed at the server.
Players type only a nickname — no room codes, no QR scanning.
The host selects a quiz and presses Start. Everything else is automatic.

- **Developer:** EduardIng
- **Repository:** https://github.com/EduardIng/quiz-room-local
- **Local folder:** `/Users/einhorn/quiz-room-local`
- **Version:** 0.1.0
- **Forked from:** quiz-room-auto v1.3.0 (165/165 tests)

---

## Visual Progress Tracker

```
Phase 0: Fork Setup              [##########] 100%
Phase 1: Single-Room Backend     [----------]   0%
Phase 2: Kiosk PlayerView        [----------]   0%
Phase 3: Host UI                 [----------]   0%
Phase 4: LAN Hardening           [----------]   0%
Phase 5: Tests                   [----------]   0%
Phase 6: Documentation           [----------]   0%
Overall:                         [#---------]  10%
```

---

## Completed Phases

### Phase 0 — Fork Setup (10 March 2026) ✅

**What was done:**
- Copied quiz-room-auto → /Users/einhorn/quiz-room-local
- Removed old .git history and sessions.db
- Created fresh git repo, added remote
- Created GitHub repo EduardIng/quiz-room-local via API
- Rewrote CLAUDE.md — kiosk-specific architecture, fully autonomous mode, superpowers mandatory workflow
- Updated config.json — added `kiosk` block, set `autoStart: false`
- Updated package.json — name `quiz-room-local`, version `0.1.0`

**Key architectural decisions:**
- Single active session model: server holds `currentActiveRoom`, tablets auto-discover it
- Room codes preserved internally (Socket.IO rooms) but hidden from players
- `autoStart: false` — host explicitly presses Start (kiosk venue needs control)

---

## Pending Phases

### Phase 1 — Single-Room Backend
**Goal:** Server exposes `GET /api/current-room`, `join-quiz` accepts nickname-only,
`create-quiz` sets `currentActiveRoom`.

Files to modify:
- `backend/src/server.js` — add `/api/current-room` endpoint, add `media/` serving
- `backend/src/websocket-handler-auto.js` — modify join-quiz (roomCode optional),
  track `currentActiveRoom`, emit `NO_ACTIVE_ROOM` event

### Phase 2 — Kiosk PlayerView
**Goal:** Tablets auto-discover room, ask only for nickname, never navigate away.

Files to modify:
- `frontend/src/components/PlayerView.jsx` — remove roomCode input, add auto-fetch,
  add kiosk mode (fullscreen, auto-reconnect, nav-lock, polling)
- `frontend/src/utils/i18n.js` — new keys for "waiting for host" screen

### Phase 3 — Host UI
**Goal:** Simple host interface: select quiz → Start.

Files to create/modify:
- `frontend/src/components/HostView.jsx` — new component:
  quiz library list, Start button, host controls (pause/resume/skip), game status display
- `frontend/src/main.jsx` — route `#/host` → HostView, update `#/` → PlayerView default

### Phase 4 — LAN Hardening
**Goal:** System works 100% offline on local network.

- Add `media/` folder + `GET /api/media/:filename` endpoint in server.js
- Audit frontend bundle — confirm no external CDN dependencies
- Update quiz media fields to accept local filenames

### Phase 5 — Tests
**Goal:** All existing tests pass + new tests for kiosk-specific behaviour.

- Update `websocket.test.js` — join-quiz without roomCode, current-room endpoint
- Update `server.test.js` — `/api/current-room`, `/api/media/:filename`
- Target: ≥165 tests passing

### Phase 6 — Documentation
- `README.md` — project overview, kiosk concept
- `SETUP.md` — installation + tablet kiosk config (Chrome flags, autostart)
- `KIOSK_SETUP.md` — non-technical guide for setting up tablets

---

## File Inventory (inherited from fork, modification status)

| File | Status | Phase |
|------|--------|-------|
| `backend/src/quiz-session-auto.js` | Keep as-is | — |
| `backend/src/quiz-storage.js` | Keep as-is | — |
| `backend/src/db.js` | Keep as-is | — |
| `backend/src/utils.js` | Keep as-is | — |
| `backend/src/server.js` | Modify | Phase 1 |
| `backend/src/websocket-handler-auto.js` | Modify | Phase 1 |
| `frontend/src/components/PlayerView.jsx` | Significant rewrite | Phase 2 |
| `frontend/src/components/ProjectorView.jsx` | Keep as-is | — |
| `frontend/src/components/StatsPanel.jsx` | Keep as-is | — |
| `frontend/src/components/QuizCreator.jsx` | Remove host-start flow | Phase 3 |
| `frontend/src/components/HostView.jsx` | Create new | Phase 3 |
| `frontend/src/components/AdminPanel.jsx` | Remove | Phase 3 |
| `frontend/src/main.jsx` | Modify routes | Phase 3 |
| `frontend/src/utils/i18n.js` | Add kiosk keys | Phase 2 |
| `config.json` | Done ✅ | Phase 0 |
| `package.json` | Done ✅ | Phase 0 |
| `CLAUDE.md` | Done ✅ | Phase 0 |

---

## WebSocket Events Reference

### Client → Server
| Event | Data | Notes |
|-------|------|-------|
| `create-quiz` | `{ quizData, settings }` | Sets currentActiveRoom |
| `join-quiz` | `{ nickname, roomCode? }` | roomCode optional |
| `submit-answer` | `{ answerId: 0-3 }` | |
| `submit-category` | `{ choiceIndex: 0-1 }` | |
| `get-game-state` | `{ roomCode }` | |
| `watch-room` | `{ roomCode }` | |
| `host-control` | `{ roomCode, action }` | |

### Server → Client
Same as quiz-room-auto + `NO_ACTIVE_ROOM` (new).

---

## How to Continue Development

Say:
> "Read CLAUDE.md and PROGRESS.md and continue. Here's what I want: [task]"

Next step: **Phase 1 — Single-Room Backend**
