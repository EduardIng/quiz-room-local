# Quiz Room Auto 🎮

> Automated quiz room system for commercial venues — no host required after setup

[![Tests](https://img.shields.io/badge/tests-100%20passed-brightgreen)](backend/tests/)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green)](package.json)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## Current Status
```
Phase 0: System Setup        [██████████] 100% ✅
Phase 1: Core Automation     [██████████] 100% ✅
Phase 2: Player Interface    [██████████] 100% ✅
Phase 3: Testing & Polish    [██████████] 100% ✅
Phase 4: Documentation       [██████████] 100% ✅
Phase 5: Optional Features   [██████████] 100% ✅
Phase 6: Extended Features   [██████████] 100% ✅
Phase 7: Rich Media          [██████████] 100% ✅
Phase 8: Category Mode       [██████████] 100% ✅
Phase 9: Quiz Library        [██████████] 100% ✅
Phase 10: Projector & Host   [██████████] 100% ✅
```
Last Updated: 2026-03-07

---

## What is this?

**Quiz Room Auto** is a self-running quiz system designed for bars, restaurants, and event venues. Once a quiz is started, the system automatically advances through questions, reveals answers, shows leaderboards, and ends the game — no host clicking required.

**How it works:**
1. Host opens the web UI and creates a quiz → a 6-character room code + QR code are generated
2. Players join on their phones/tablets by scanning the QR code or entering the room code manually
3. The quiz runs automatically: questions → timer → answer reveal → leaderboard → repeat
4. Final results are shown at the end and saved to a local SQLite database

---

## Features

- **Fully automated** — state machine advances the game without any host interaction
- **Browser-based** — players join on any phone or tablet, no app install required
- **QR codes** — scan to join; shown on the admin panel and creator success screen
- **Quiz creator UI** — build quizzes in the browser, import/export JSON, load from library
- **Quiz library** — save quizzes to the server `quizzes/` folder and reload them any time
- **Category mode** — each round a designated player picks a category (two options), then answers; chooser rotates each round
- **Projector view** — read-only big-screen display for TV/projector (`#/screen`), syncs live state without counting as a player
- **Host controls** — pause/resume question timer, skip current phase, or force-start from the creator UI
- **Statistics dashboard** — persistent history of all sessions with per-session leaderboards
- **Multi-language** — Ukrainian and English UI (toggle in every view)
- **Sound effects** — correct, wrong, timeout, countdown, finish
- **Admin panel** — live monitoring of all active rooms with QR codes and projector links
- **Configurable timers** — per-quiz and per-question time limits
- **Image questions** — optional image displayed above question text (URL-based)
- **Music questions** — optional audio auto-plays on question start, with replay button
- **Drag-to-reorder** — drag questions into position in the Quiz Creator
- **Rate limiting** — max 10 answer submissions per socket per 30 seconds
- **Auto DB cleanup** — sessions older than 90 days are removed from SQLite on startup

---

## Quick Start

### 1. Install dependencies
```bash
cd quiz-room-auto
npm install
cd frontend && npm install && cd ..
```

### 2. Build frontend
```bash
npm run build:frontend
```

### 3. Start the server
```bash
npm start
```

### 4. Open in browser
```
http://localhost:8080
```

Players on the same network connect via:
```
http://10.0.1.36:8080   ← your local IP shown in terminal on startup
```

Or scan the QR code shown after creating a room — it encodes the join URL automatically.

---

## Pages

| URL | Description |
|-----|-------------|
| `/` or `/?room=CODE` | Player join screen (room code pre-filled if provided) |
| `#/create` | Quiz creator — build, import, or load from library |
| `#/admin` | Admin panel — live session monitor with QR codes |
| `#/stats` | Statistics dashboard — completed session history |
| `#/screen?room=CODE` | Projector view — read-only big-screen display for TV/projector |

---

## Documentation

| File | Description |
|------|-------------|
| [SETUP.md](SETUP.md) | Full installation & configuration guide |
| [USAGE.md](USAGE.md) | How to create and run quiz sessions |
| [API.md](API.md) | HTTP endpoints & WebSocket events reference |
| [PROGRESS_LOG.md](PROGRESS_LOG.md) | Development history |
| [GLOSSARY.md](GLOSSARY.md) | Technical terms in Ukrainian |
| [DECISIONS.md](DECISIONS.md) | Architecture decisions |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Known issues & workarounds |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 25, Express 4, Socket.IO 4 |
| Database | SQLite via better-sqlite3 |
| Frontend | React 18, Vite 4 |
| Real-time | WebSocket (Socket.IO) |
| QR codes | qrcode (server-side PNG generation) |
| Testing | Jest 29 (165 tests) |

---

## Project Structure

```
quiz-room-auto/
├── backend/
│   ├── src/
│   │   ├── server.js                  # Express + Socket.IO server
│   │   ├── quiz-session-auto.js       # State machine (core logic)
│   │   ├── websocket-handler-auto.js  # WebSocket event handlers
│   │   ├── quiz-storage.js            # Load quizzes from disk
│   │   ├── db.js                      # SQLite persistence (sessions, results)
│   │   └── utils.js                   # Config loader, logging
│   └── tests/
│       ├── session.test.js            # 70 unit tests (state machine)
│       ├── websocket.test.js          # 30 unit tests (WebSocket handlers)
│       ├── quiz-storage.test.js       # 28 unit tests (file storage)
│       ├── db.test.js                 # 22 unit tests (SQLite persistence)
│       └── server.test.js             # 15 integration tests (HTTP endpoints)
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── PlayerView.jsx         # 10-screen player UI (incl. category mode)
│   │   │   ├── AdminPanel.jsx         # Live session monitor
│   │   │   ├── QuizCreator.jsx        # Quiz builder + import + host controls
│   │   │   ├── ProjectorView.jsx      # Read-only big-screen display
│   │   │   └── StatsPanel.jsx         # Session history dashboard
│   │   ├── utils/
│   │   │   ├── i18n.js                # UK/EN translations
│   │   │   ├── useLang.js             # Language hook
│   │   │   └── sound.js               # Sound effects
│   │   └── styles/theme.css           # Dark theme variables
│   └── public/                        # Static assets
├── quizzes/
│   ├── dummy-quiz-1.json              # Sample: general knowledge
│   └── dummy-quiz-2.json              # Sample: technology
├── data/
│   └── sessions.db                    # SQLite database (auto-created)
├── config.json                        # All timers & settings
└── package.json
```

---

## Configuration

Edit `config.json` to change game behaviour:

```json
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0"
  },
  "quiz": {
    "questionTime": 30,        // seconds per question
    "answerRevealTime": 5,     // seconds to show correct answer
    "leaderboardTime": 5,      // seconds to show rankings
    "autoStart": true,         // start when minPlayers join
    "waitForAllPlayers": true, // end question early if all answered
    "minPlayers": 1,
    "maxPlayers": 8
  }
}
```

---

## Running Tests

```bash
npm test
```

Output: `165 passed, 0 failed`

---

## License

Based on [Quiz Mate](https://github.com/david-04/quiz-mate) (ISC License).
Additions by EduardIng — MIT License.
