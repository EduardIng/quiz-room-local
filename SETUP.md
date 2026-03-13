# Setup Guide — Quiz Room Local

Installation, configuration, and deployment instructions for the kiosk edition.

---

## Requirements

- Node.js v18+ (tested on v25.6.0)
- npm v8+
- macOS, Linux, or Windows
- Local network (Wi-Fi or Ethernet) for tablets

---

## Installation

```bash
# Clone the repository
git clone https://github.com/EduardIng/quiz-room-local.git
cd quiz-room-local

# Install all dependencies (backend + frontend)
npm install
cd frontend && npm install && cd ..
```

---

## Starting the Server

```bash
# Production mode (serves built frontend)
npm start

# Development mode (backend on :8080, frontend dev server on :3000 with HMR)
npm run dev        # backend
cd frontend && npm run dev   # frontend (separate terminal)
```

The server starts on `http://0.0.0.0:8080` by default and prints the local IP:

```
╔════════════════════════════════════════╗
║     Quiz Room Local - Запущено!        ║
╠════════════════════════════════════════╣
║  Локально:  http://localhost:8080      ║
║  Мережа:    http://192.168.1.10:8080   ║
║                                        ║
║  Планшети: підключаються автоматично   ║
╚════════════════════════════════════════╝
```

---

## Building the Frontend

```bash
cd frontend && npm run build
```

The built files go to `frontend/build/` — the backend serves them automatically.

---

## Configuration

Edit `config.json` in the project root:

```json
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0"
  },
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

Key kiosk settings:
- `autoStart: true` — quiz starts automatically when the expected `playerCount` players have joined
- `categoryChosenTime: 4` — seconds between CATEGORY_CHOSEN broadcast and the next question
- `roomPollInterval: 3000` — tablets check for new game every 3 seconds
- `reconnectBaseDelay/reconnectMaxDelay` — socket reconnect timing on network drop
- `gpioButtonPins: [17, 27, 22, 23]` — BCM GPIO pin numbers for A/B/C/D answer buttons (Raspberry Pi podiums)
- `gpioServerUrl` — URL that `gpio-service.py` connects to (must match the server address)

---

## Adding Quizzes

Place `.json` quiz files in the `quizzes/` folder. They appear in the host's library immediately (no restart needed).

Example quiz file (`quizzes/geography.json`):
```json
{
  "title": "World Geography",
  "questions": [
    {
      "question": "What is the capital of Japan?",
      "answers": ["Beijing", "Seoul", "Tokyo", "Bangkok"],
      "correctAnswer": 2,
      "timeLimit": 20
    }
  ]
}
```

---

## Local Media Files

For fully offline operation, place image/audio files in the `media/` folder:

```
media/
├── intro-map.jpg
├── round2-theme.mp3
└── ...
```

Reference them in quiz JSON:
```json
{
  "question": "Which city is shown?",
  "image": "/api/media/intro-map.jpg",
  "answers": ["Paris", "Rome", "London", "Berlin"],
  "correctAnswer": 0
}
```

---

## Running Tests

```bash
npm test
# 186 passing, 1 skipped
```

---

## Network Setup

1. Connect server machine to the venue network (Wi-Fi or wired)
2. Note the server's local IP (shown on startup banner)
3. On each tablet, open Chrome and navigate to `http://<server-ip>:8080/`
4. On the host device, open `http://<server-ip>:8080/#/host`

For the tablets to auto-connect on boot, see `KIOSK_SETUP.md`.

---

## Autostart on macOS (optional)

Create a launch agent to start the server on login:

```bash
# Create plist
cat > ~/Library/LaunchAgents/com.quizroom.server.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.quizroom.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/path/to/quiz-room-local/backend/src/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/path/to/quiz-room-local</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/quizroom.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/quizroom-error.log</string>
</dict>
</plist>
EOF

# Load it
launchctl load ~/Library/LaunchAgents/com.quizroom.server.plist
```

---

## Troubleshooting

**Tablets can't connect:**
- Check that server IP is correct: run `npm start` and read the banner
- Check firewall: port 8080 must be open
- All devices must be on the same network

**"No active quiz rooms":**
- Host hasn't launched a quiz yet — open `#/host` and launch one

**Socket reconnects in a loop:**
- Check server is running: `curl http://localhost:8080/health`
- Restart with `npm start`

**Tests fail:**
- Run `npm install` to ensure all dependencies installed
- Check Node.js version: `node --version` (need v18+)
