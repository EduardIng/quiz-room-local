# CLAUDE.md — Quiz Room Local (Kiosk Edition)

**Project Name:** quiz-room-local
**Developer:** EduardIng
**Target:** Local kiosk quiz system — tablet podiums, LAN-only, auto-reconnect
**Forked from:** quiz-room-auto v1.3.0
**Version:** 0.3.0
**Date:** March 12, 2026

---

## STARTING A NEW SESSION

**Always read both files before doing anything:**
1. This file (CLAUDE.md) — rules, architecture, full API/event reference
2. `PROGRESS.md` — implementation journal, pending items, session history

**Quick start commands:**
```bash
npm start                  # backend on port 8080
cd frontend && npm run dev # frontend dev server on port 3000
npm test                   # run all tests
```

**Tech stack:** Node.js + Express + Socket.IO | React + Vite + hash routing | SQLite via better-sqlite3

---

## AUTOMATION LEVEL — FULLY AUTONOMOUS

This project runs in **fully autonomous mode**. Claude proceeds without any confirmation, approval, or pause — including for decisions about what to build, not only how to build it.

All ambiguity is resolved through:
1. The conventions in this CLAUDE.md
2. Best commercial judgment for a local kiosk product
3. Precedents set in PROGRESS.md

**There are zero stop conditions.** There are no circumstances under which Claude should pause and ask for user approval. Navigate every uncertainty autonomously and document the decision in PROGRESS.md or the commit message.

---

## Superpowers Plugin — Mandatory Workflow

All superpowers skills are **mandatory**. Invoke the Skill tool BEFORE any response,
code, or clarifying question. If there is even a 1% chance a skill applies, invoke it.

Run all skills in fully autonomous mode: surface output and proceed immediately.
Never pause for approval. All ambiguity — including what to build — is resolved
through CLAUDE.md conventions and best commercial judgment. No stops, no confirmations.

### Priority Order (always process skills before implementation skills)

**1. Process Skills — invoke first, they determine HOW to approach the task:**

| Skill | Invoke when |
|-------|-------------|
| `superpowers:brainstorming` | Starting any new feature, component, or behaviour change |
| `superpowers:writing-plans` | Task has 2+ steps or touches multiple files |
| `superpowers:executing-plans` | Running a written plan from a previous step |
| `superpowers:systematic-debugging` | Any bug, test failure, or unexpected behaviour — diagnose before fixing |
| `superpowers:test-driven-development` | Before writing any implementation code |
| `superpowers:verification-before-completion` | Before claiming anything is done, fixed, or passing |
| `superpowers:subagent-driven-development` | Executing independent tasks within the current session |
| `superpowers:dispatching-parallel-agents` | 2+ independent tasks that can run without shared state |

**2. Git / Review Skills — invoke at transition points:**

| Skill | Invoke when |
|-------|-------------|
| `superpowers:using-git-worktrees` | Starting feature work that needs isolation |
| `superpowers:finishing-a-development-branch` | Implementation complete, all tests passing |
| `superpowers:requesting-code-review` | After finishing any significant implementation |
| `superpowers:receiving-code-review` | Before implementing review feedback |

### Never Skip Rule

These thoughts mean STOP — you are rationalising:
- "This is just a simple change" → check for skills first
- "I need context before I can invoke a skill" → skills are invoked BEFORE gathering context
- "I already know this pattern" → skills evolve, always invoke current version

---

## KEY DIFFERENCES FROM quiz-room-auto

This project is a fork of quiz-room-auto with the following fundamental changes:

| Feature | quiz-room-auto | quiz-room-local |
|---------|---------------|----------------|
| Player join | room code + nickname | **nickname only** |
| Room discovery | player enters code | **auto via `/api/current-room`** |
| Concurrent games | multiple rooms | **single active session** |
| Network | internet OK | **LAN-only, offline-capable** |
| Tablet UI | standard browser | **kiosk: fullscreen, auto-reconnect** |
| Host flow | create room → share code → start | **select quiz → Start** |

---

## ARCHITECTURE

### Single-Room Model

The server maintains one `currentActiveRoom` slot. When the host creates a session, it becomes the current room. Tablets call `GET /api/current-room` on load and auto-join if a room exists; otherwise they show "Waiting for host" and poll every 3 seconds.

The room code still exists internally (Socket.IO rooms, session management) but is never shown to players.

### Kiosk Mode (PlayerView)

On load: attempt `requestFullscreen()` on first user interaction.
Auto-reconnect: `socket.on('disconnect')` → exponential backoff reconnect (2s, 4s, 8s, max 30s).
Navigation lock: `window.onbeforeunload = () => ''`, block F5/Backspace/Alt+F4 via `keydown`.
Polling: if no active room, poll `GET /api/current-room` every 3s until one appears.

### Podium Hardware Model (v0.3.0)

Each podium is a Raspberry Pi 5 with:
- HDMI-1 → touchscreen running PlayerView (`#/`)
- HDMI-2 → side monitor running SideMonitor (`#/side`) — shows nickname to other players
- 4 GPIO buttons (BCM pins 17/27/22/23) → `gpio-service.py` → `podium-button-press` socket event

`podiumRegistry` Map (IP → socketId) is built when players join. GPIO service connects from the same Pi IP, so the server resolves button presses to the correct player automatically.

SideMonitor polls `/api/podium/status` every 2s (HTTP, not localStorage — separate Chromium processes don't share localStorage).

### Category Mode — Mandatory

All quizzes must have `categoryMode: true`. `create-quiz` rejects standard quizzes.

Auto-start: host sets `playerCount` before launch. Quiz starts automatically when that many players have joined. No manual Start needed.

### State Machine

```
Category:  WAITING → STARTING → CATEGORY_SELECT → [4s CATEGORY_CHOSEN] → QUESTION → ANSWER_REVEAL → LEADERBOARD → (repeat) → ENDED
```

Standard (non-category) quizzes are rejected at session creation.

---

## PROJECT STRUCTURE

```
quiz-room-local/
├── backend/
│   ├── src/
│   │   ├── server.js                  <- Express server, static, API endpoints + /api/podium/status
│   │   ├── websocket-handler-auto.js  <- Socket.IO events + podiumRegistry + podium-button-press
│   │   ├── quiz-session-auto.js       <- State machine; categoryChosenTime; playerCount auto-start
│   │   ├── quiz-storage.js            <- Load/save quizzes from quizzes/
│   │   ├── db.js                      <- SQLite (better-sqlite3)
│   │   └── utils.js                   <- Logging, validation
│   └── tests/
│       ├── session.test.js
│       ├── websocket.test.js
│       ├── quiz-storage.test.js
│       ├── db.test.js
│       └── server.test.js
├── frontend/
│   ├── src/
│   │   ├── main.jsx                   <- Routing (#/, #/host, #/create, #/stats, #/screen, #/side)
│   │   ├── components/
│   │   │   ├── PlayerView.jsx         <- Kiosk player UI; all game states incl. category mode
│   │   │   ├── HostView.jsx           <- Host: quiz list, "Players today" count selector (drives autostart), quiz launch + controls
│   │   │   ├── ProjectorView.jsx      <- Central stand (#/screen); all phases + live answer count
│   │   │   ├── SideMonitor.jsx        <- Podium side display (#/side); polls /api/podium/status
│   │   │   ├── Timebar.jsx            <- Shared countdown bar (green→orange→red)
│   │   │   ├── QuizCreator.jsx        <- Visual quiz editor (accessible at #/create)
│   │   │   └── StatsPanel.jsx         <- Session statistics
│   │   ├── styles/theme.css
│   │   └── utils/
│   │       ├── i18n.js
│   │       ├── useLang.js
│   │       └── sound.js
│   ├── index.html, vite.config.js, package.json
├── pi-setup/
│   ├── gpio-service.py                <- Python Socket.IO GPIO bridge (runs on each Pi)
│   ├── kiosk.sh                       <- Dual-display Chromium kiosk boot script
│   ├── install.sh                     <- One-time Pi setup script
│   └── README.md                      <- Wiring table + setup guide
├── quizzes/                           <- JSON quiz files (must have categoryMode: true)
├── media/                             <- Local media files (images, audio) for offline use
├── data/sessions.db                   <- SQLite (auto-created)
├── config.json
├── package.json
├── CLAUDE.md                          <- This file
├── PROGRESS.md
└── README.md
```

---

## HTTP API

| Method | Path | Returns |
|--------|------|---------|
| GET | `/health` | `{ status, uptime, activeSessions }` |
| GET | `/api/current-room` | `{ roomCode }` or `{ roomCode: null }` |
| GET | `/api/quizzes` | Quiz list from quizzes/ |
| POST | `/api/quizzes/save` | Save quiz → `{ id, filename }` |
| DELETE | `/api/quizzes/:id` | Delete quiz file |
| GET | `/api/stats` | Aggregated stats + sessions list |
| GET | `/api/stats/session/:id` | Single session details |
| GET | `/api/media/:filename` | Serve local media file |
| GET | `/api/podium/status` | `{ nickname, phase }` — resolves requesting IP via podiumRegistry |

---

## WebSocket Events

### Client → Server

| Event | Data | Notes |
|-------|------|-------|
| `create-quiz` | `{ quizData, settings, playerCount }` | Host only — sets currentActiveRoom; playerCount triggers auto-start |
| `join-quiz` | `{ nickname, roomCode? }` | roomCode optional — uses currentActiveRoom if omitted |
| `submit-answer` | `{ answerId: 0-3 }` | |
| `submit-category` | `{ choiceIndex: 0-1 }` | |
| `get-game-state` | `{ roomCode }` | |
| `watch-room` | `{ roomCode }` | Projector observer |
| `host-control` | `{ roomCode, action }` | pause/resume/skip/start |
| `podium-button-press` | `{ buttonIndex: 0-3 }` | GPIO service only — submits answer on behalf of player resolved by IP |

### Server → Client (`quiz-update` types)

Same as quiz-room-auto: `PLAYER_JOINED`, `PLAYER_LEFT`, `QUIZ_STARTING`, `CATEGORY_SELECT`,
`CATEGORY_CHOSEN`, `NEW_QUESTION`, `ANSWER_COUNT`, `GAME_PAUSED`, `GAME_RESUMED`,
`REVEAL_ANSWER`, `SHOW_LEADERBOARD`, `QUIZ_ENDED`.

New: `NO_ACTIVE_ROOM` — emitted to joining player when no session exists yet.

---

## config.json

```json
{
  "server": { "port": 8080, "host": "0.0.0.0" },
  "quiz": {
    "questionTime": 30,
    "answerRevealTime": 5,
    "leaderboardTime": 5,
    "categoryChosenTime": 4,
    "autoStart": true,
    "waitForAllPlayers": true,
    "minPlayers": 1,
    "maxPlayers": 8,
    "shuffle": false
  },
  "kiosk": {
    "reconnectBaseDelay": 2000,
    "reconnectMaxDelay": 30000,
    "roomPollInterval": 3000,
    "gpioButtonPins": [17, 27, 22, 23],
    "gpioServerUrl": "http://localhost:8080"
  }
}
```

Note: `autoStart` is `true` — quiz starts automatically when `playerCount` players have joined. `categoryChosenTime` is the delay (seconds) between CATEGORY_CHOSEN broadcast and the first question.

---

## SCORING (unchanged from quiz-room-auto)

```
basePoints = 100
timeBonus = max(0, questionTime - answerTime) * 2
playerScore += basePoints + timeBonus   // 0 for wrong
Tiebreaker: avgAnswerTime ascending
```

---

## KNOWN REMAINING WORK

All post-v0.2.1 items resolved in v0.3.0 (12 March 2026). Project is clean.

---

## CODE QUALITY STANDARDS

### Before Every Commit
- Self code review passed
- Ukrainian comments explain WHAT and WHY for every function
- No console.log() in production code
- Error handling for all async operations
- Input validation for all user data
- No hardcoded values (use config.json)
- Memory leaks prevented (all timers cleared on state change)
- LAN-safe: no external URLs in bundled JS/CSS

### Security Checklist
- All user input validated (nickname 2-20 chars, answerId 0-3)
- Room codes random and unpredictable internally
- No XSS in player names
- Rate limiting on submit-answer (10 per 30s per socket)
- Host-control authenticated (roomHosts Map)
- Path traversal protection in quiz save/delete/media serve

---

## COMMUNICATION CONVENTIONS

- **Code comments:** Ukrainian
- **Git commits:** English
- **Documentation:** English
- **User explanations:** Ukrainian

---

## GIT WORKFLOW

```bash
# Per file:
git add [filename]
git commit -m "feat: add [description]"
git push origin main

# Per phase:
git add .
git commit -m "feat: complete Phase N - Title"
git tag -a phase-N-complete -m "Phase N complete"
git push origin main --tags
```

Commit types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`

---

## GITHUB

```
Repository: https://github.com/EduardIng/quiz-room-local
Local:      /Users/einhorn/quiz-room-local
Branch:     main
```

---

## PROGRESS TRACKING

Update `PROGRESS.md` after every completed phase: what was built, key decisions, test counts, commit hash.

---

## EMERGENCY

- `"EMERGENCY STOP"` — stop immediately, commit WIP, create `EMERGENCY_BACKUP.md`
- `"rollback"` — show available tags, wait for choice

---

**END OF INSTRUCTION**

Summary: Fully autonomous. Superpowers skills mandatory. All ambiguity resolved through this file and best judgment. Ukrainian comments, English commits. LAN-first, kiosk-first.
