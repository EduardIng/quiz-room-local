# Quiz Room Local 🎮

> Local-kiosk quiz system for venues — tablets connect automatically, no room codes needed

[![Tests](https://img.shields.io/badge/tests-230%20passed-brightgreen)](backend/tests/)
[![Version](https://img.shields.io/badge/version-0.3.0-blue)](package.json)
[![Fork of](https://img.shields.io/badge/fork%20of-quiz--room--auto%20v1.3.0-purple)](https://github.com/EduardIng/quiz-room-auto)

---

## What Is This?

**Quiz Room Local** is a kiosk-optimized fork of [quiz-room-auto](https://github.com/EduardIng/quiz-room-auto) designed for venues with dedicated tablet podiums.

**Key difference from the original:** players never enter room codes. Each tablet permanently points at the server and auto-discovers the active game. Players type only their nickname and play.

### How It Works

1. **Host** opens `http://server:8080/#/host` on a laptop/tablet
2. **Host** selects a quiz from the library, sets the expected **player count**, and clicks **Launch**
3. **Player tablets** (pointed at `http://server:8080/`) automatically detect the new game
4. Players enter their nickname — the quiz **auto-starts** when the expected player count is reached (no manual Start needed)
5. After the game ends, tablets return to "Waiting for host..." ready for the next round

> **Note:** All quizzes use category mode. The quiz editor always produces category-format quizzes.

---

## Kiosk Architecture

```
Server (one machine)
├── GET /api/current-room  ← tablets poll this every 3s
├── Socket.IO              ← real-time game events
└── Frontend (React SPA)

Tablets (N devices, Chrome kiosk mode)
└── #/  → PlayerView
    ├── waiting_for_host  (polls /api/current-room)
    ├── join              (nickname only, no room code)
    └── ... game screens ...

Host device (1 device)
└── #/host  → HostView
    ├── Quiz library list
    ├── Launch quiz
    └── Host controls (Start / Pause / Resume / Skip)
```

**Single-room model:** the server holds one `currentActiveRoom` slot. Only one game runs at a time. All tablets auto-join it.

---

## Routes

| URL | Purpose | Who uses it |
|-----|---------|-------------|
| `#/` | Player kiosk screen | All tablets |
| `#/host` | Host controls | Host device only |
| `#/create` | Quiz editor | Quiz author |
| `#/screen` | Projector / big screen | TV or projector |
| `#/stats` | Session statistics | Admin |
| `#/side` | SideMonitor | Podium side monitors (HDMI-2) |

---

## Quick Start

```bash
# Install dependencies
npm install

# Start server (port 8080)
npm start

# Dev mode (frontend hot-reload on port 3000)
cd frontend && npm run dev

# Run tests
npm test
```

Point player tablets at: `http://<server-ip>:8080/`
Open host panel at: `http://<server-ip>:8080/#/host`

---

## Tech Stack

- **Backend:** Node.js + Express + Socket.IO
- **Frontend:** React 18 + Vite (fully bundled — no external CDN required)
- **Database:** SQLite via better-sqlite3 (session stats)
- **Offline-ready:** all assets served from local server, no internet required

---

## Quiz Format

Standard JSON — place files in `quizzes/`, they appear in the host library automatically:

```json
{
  "title": "Friday Quiz Night",
  "categoryMode": true,
  "rounds": [
    {
      "options": [
        {
          "category": "Geography",
          "question": "What is the capital of France?",
          "answers": ["London", "Paris", "Berlin", "Rome"],
          "correctAnswer": 1,
          "timeLimit": 20
        },
        {
          "category": "History",
          "question": "In what year did WW2 end?",
          "answers": ["1943", "1944", "1945", "1946"],
          "correctAnswer": 2
        }
      ]
    }
  ]
}
```

**No-repeat rule:** consecutive rounds cannot share any category name. Round 2 must offer two categories that neither appeared in round 1.

For local media files (offline venues), place images/audio in `media/` and reference them as `/api/media/filename.jpg`. To upload an image from the Quiz Creator, use the **📎 Add Image** button on any round option — it uploads the file and stores the filename automatically.

---

## Documentation

| File | Contents |
|------|---------|
| `SETUP.md` | Installation + server configuration |
| `KIOSK_SETUP.md` | Tablet kiosk setup guide (Chrome flags, autostart) |
| `USAGE.md` | Full host + player usage guide |
| `API.md` | Full WebSocket + HTTP API reference |
| `DECISIONS.md` | Architecture decision log |
| `KNOWN_ISSUES.md` | Known issues and workarounds |
| `GLOSSARY.md` | Technical glossary (Ukrainian) |
| `PROGRESS.md` | Development journal, phase tracker |
| `CLAUDE.md` | Instructions for AI-assisted development |
