# Podium Hardware Integration — Design Spec

**Date:** 2026-03-11
**Status:** Approved

---

## What We're Building

Physical quiz podiums for 6–8 players. Each podium has:
- Raspberry Pi 5 as the single compute unit
- Touchscreen (HDMI out 1) — full quiz UI, player-facing
- Side monitor (HDMI out 2) — player's nickname only, facing other players
- 4 color-coded physical buttons (GPIO) — answer A/B/C/D
- Full OS-level kiosk lockdown — players cannot exit the quiz

Central stand in the middle of the room:
- Multiple screens arranged so every seated player sees at least one
- Runs existing ProjectorView route (`#/screen`) — heavily redesigned
- Non-interactive, informative only

---

## Architecture

### Hardware per Podium
- Raspberry Pi 5 (4GB)
- Two HDMI displays: touchscreen (player UI) + small side monitor (nickname)
- 4 GPIO buttons wired to pins, color-coded to match answer options
- LAN ethernet (no WiFi dependency)

### Software Layers per Podium
1. **Raspberry Pi OS** — kiosk-locked, auto-login, no desktop, no keyboard
2. **Chromium (kiosk mode)** — runs PlayerView (`#/`) on display 1, SideMonitor (`#/side`) on display 2
3. **GPIO Python service** — reads button presses → sends `podium-button-press` to quiz server via Socket.IO
4. **Quiz server** — registers podium IPs, maps GPIO events to player answers

### Podium IP → Player Mapping
When a player joins from a kiosk, the server records their source IP in a `podiumRegistry` Map (`IP → socketId`). When the GPIO service on the same Pi sends a `podium-button-press` event, the server resolves the IP to the player's socket and calls `submitAnswer` on their behalf. The GPIO service connects from the same IP, so resolution is automatic.

---

## Game Flow (Every Quiz)

All quizzes use category mode. Non-category quizzes are rejected at session creation with a clear error.

```
WAITING
  → players enter nicknames → auto-start when host-defined player count reached

STARTING
  → 3-second countdown on all screens

CATEGORY_SELECT (rotating picker)
  → all screens: both category options + "[Nickname] is selecting" + timebar
  → picker: buttons active
  → non-pickers: buttons visible, not interactive
  → timeout: auto-pick random

CATEGORY_CHOSEN (4 seconds)
  → all screens: selected category name, large, centered

QUESTION
  → player screens: question + 4 answers (color-coded) + timebar
  → central stand: question + 4 answers + timebar + "X/N answered" live count
  → after answering: "Waiting for other players..." on player screen
  → ends when: all answered OR timer hits zero

ANSWER_REVEAL (5 seconds)
  → all screens: correct answer highlighted
  → player screens: own answer highlighted green/red + points earned
  → players who didn't answer: "Time's up" indicator, 0 points

LEADERBOARD (5 seconds)
  → player screens: full ranked list, own row highlighted
  → central stand: full ranked list + top-3 podium style (gold/silver/bronze)

→ back to CATEGORY_SELECT with next player as picker

ENDED
  → final leaderboard, winner celebration
  → podiums auto-reset to WAITING after 30 seconds
```

---

## Config Changes

```json
{
  "quiz": {
    "questionTime": 30,
    "answerRevealTime": 5,
    "leaderboardTime": 5,
    "categoryChosenTime": 4,
    "autoStart": true,
    "waitForAllPlayers": true,
    "minPlayers": 1,
    "maxPlayers": 8
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

---

## New Routes

| Route | Component | Display |
|-------|-----------|---------|
| `#/` | PlayerView | Podium touchscreen |
| `#/side` | SideMonitor | Podium side monitor |
| `#/screen` | ProjectorView | Central stand |
| `#/host` | HostView | Host device |

---

## New WebSocket Events

### Client → Server
| Event | Data | Notes |
|-------|------|-------|
| `podium-button-press` | `{ buttonIndex: 0-3 }` | From GPIO service only |

### Server → Client (new/changed)
| Type | Change |
|------|--------|
| `CATEGORY_CHOSEN` | Delay extended to 4s before QUESTION |
| `ANSWER_COUNT` | Already exists — used by ProjectorView now |

---

## Files Affected

### Backend
- `backend/src/quiz-session-auto.js` — categoryChosenTime config (1s→4s)
- `backend/src/websocket-handler-auto.js` — playerCount on create-quiz, podiumRegistry, podium-button-press handler
- `backend/src/server.js` — no change needed
- `config.json` — add categoryChosenTime, autoStart: true

### Frontend
- `frontend/src/components/PlayerView.jsx` — major overhaul
- `frontend/src/components/PlayerView.css` — new states
- `frontend/src/components/ProjectorView.jsx` — major redesign
- `frontend/src/components/ProjectorView.css` — redesign
- `frontend/src/components/HostView.jsx` — add player count selector
- `frontend/src/components/SideMonitor.jsx` — new
- `frontend/src/components/SideMonitor.css` — new
- `frontend/src/components/Timebar.jsx` — new shared component
- `frontend/src/main.jsx` — add #/side route

### Pi Setup (scripts, no tests)
- `pi-setup/gpio-service.py` — Python Socket.IO GPIO bridge
- `pi-setup/kiosk.sh` — Chromium kiosk boot script
- `pi-setup/install.sh` — one-time Pi setup script
- `pi-setup/README.md` — setup instructions

### Tests
- `backend/tests/session.test.js` — categoryChosenTime, categoryMode required
- `backend/tests/websocket.test.js` — playerCount autoStart, podium-button-press
