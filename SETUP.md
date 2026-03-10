# Setup Guide — Quiz Room Auto

Complete installation and configuration instructions.

---

## Requirements

| Software | Minimum | Recommended |
|----------|---------|-------------|
| Node.js  | 18.0.0  | 25.x (LTS)  |
| npm      | 9.0.0   | 11.x        |
| RAM      | 256 MB  | 512 MB+     |
| Disk     | 200 MB  | 1 GB        |

**Network:** All players must be on the same Wi-Fi network as the host machine.

---

## Installation

### Step 1: Clone or download the project

```bash
git clone https://github.com/EduardIng/quiz-room-auto.git
cd quiz-room-auto
```

### Step 2: Install backend dependencies

```bash
npm install
```

This installs all backend packages including `better-sqlite3` (persistent storage) and `qrcode` (QR generation).

Expected output: `added N packages`

### Step 3: Install and build frontend

```bash
cd frontend
npm install
npm run build
cd ..
```

Expected output: `✓ built in Xms`

### Step 4: Verify installation

```bash
npm test
```

Expected output: `165 passed, 0 failed`

### Step 5: Start the server

```bash
npm start
```

Expected output:
```
╔════════════════════════════════════════╗
║       Quiz Room Auto - Запущено!       ║
╠════════════════════════════════════════╣
║  Локально:  http://localhost:8080      ║
║  Мережа:    http://10.0.1.36:8080      ║
╚════════════════════════════════════════╝
```

Open `http://localhost:8080` in a browser to verify.

The `data/` directory and `data/sessions.db` SQLite database are created automatically on first run.

---

## Configuration

All settings live in `config.json` at the project root.

### Server settings

```json
"server": {
  "port": 8080,     // HTTP port (change if 8080 is taken)
  "host": "0.0.0.0" // Listen on all interfaces (required for LAN access)
}
```

### Quiz timing

```json
"quiz": {
  "questionTime": 30,        // Range: 10–120 seconds
  "answerRevealTime": 5,     // Range: 2–15 seconds
  "leaderboardTime": 5,      // Range: 2–15 seconds
  "autoStart": true,         // Auto-start when minPlayers join
  "waitForAllPlayers": true, // End question early if everyone answered
  "minPlayers": 1,           // Minimum to auto-start
  "maxPlayers": 8,           // Hard cap per room
  "shuffle": false           // Randomise question order before each game
}
```

**Recommended settings for a pub quiz night:**
```json
"questionTime": 20,
"answerRevealTime": 6,
"leaderboardTime": 8,
"minPlayers": 2
```

### Display & sounds

```json
"display": {
  "fullscreen": true,
  "fontSize": "large"
},
"sounds": {
  "enabled": true,
  "volume": 0.7    // 0.0 – 1.0
}
```

---

## Adding Your Own Quizzes

### Option A — Drop a JSON file into `quizzes/`

Create a `.json` file in the `quizzes/` directory:

```json
{
  "title": "My Quiz",
  "description": "Optional description",
  "questions": [
    {
      "question": "What is the capital of France?",
      "answers": ["London", "Berlin", "Paris", "Rome"],
      "correctAnswer": 2,
      "timeLimit": 20
    }
  ]
}
```

The file appears automatically in the "Load from library" dropdown in the Quiz Creator UI.

**Field reference:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | ✅ | Quiz name shown to players |
| `description` | string | — | Optional description |
| `questions` | array | ✅ | Array of question objects |
| `question` | string | ✅ | The question text |
| `answers` | string[4] | ✅ | Exactly 4 answer options |
| `correctAnswer` | number | ✅ | Index of correct answer (0–3) |
| `timeLimit` | number | — | Per-question override (10–120s) |
| `image` | string | — | URL of image displayed above the question text |
| `audio` | string | — | URL of audio that auto-plays when the question starts |

### Option B — Use the Quiz Creator UI

Open `http://localhost:8080#/create` to build a quiz in the browser.

- Type questions and answers directly
- Click a letter button (A/B/C/D) to mark the correct answer
- Set a per-question timer override (optional)
- Click **⬇ Save JSON** to export the quiz as a file
- Click **⬆ Import JSON** to load a previously saved JSON file
- Click **📂 From library** to load any quiz from the `quizzes/` folder

### Option C — Import JSON in the UI

Click **⬆ Import JSON** in the Quiz Creator to load any `.json` file from your computer. The editor is populated with its content, which you can review or edit before launching.

### Option D — Category Mode quiz (JSON format)

Category mode quizzes use a different JSON structure with `rounds` instead of `questions`:

```json
{
  "title": "Geo vs History",
  "categoryMode": true,
  "rounds": [
    {
      "options": [
        {
          "category": "Geography",
          "question": "What is the capital of France?",
          "answers": ["London", "Berlin", "Paris", "Rome"],
          "correctAnswer": 2,
          "timeLimit": 20,
          "image": "https://example.com/paris.jpg"
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

Each round has exactly 2 options. Before each round a designated player (chooser) picks one — the corresponding question is then asked to everyone. The chooser rotates every round. If the chooser doesn't pick within the time limit, the server picks randomly.

You can also build category mode quizzes visually in the Quiz Creator by enabling the **Category mode** toggle.

---

## Projector View

The projector view (`#/screen`) is a read-only big-screen display for a TV or projector visible to all players in the venue. It connects as an observer — it does not count as a player and has no effect on game logic.

**How to open:**

After launching a quiz in the Quiz Creator, click the **📺 Projector View** link, or open manually:
```
http://localhost:8080#/screen?room=AB3C7D
```

Display it on a second screen via screen mirroring or a second browser window on a different device.

**What it shows:** room code + QR code (waiting), question + timer bar (question), correct answer highlight (reveal), ranked leaderboard (between questions), pause overlay when host pauses, final podium (ended).

---

## Host Controls

After launching a quiz, the Quiz Creator shows a **Host Controls** panel. These buttons send live commands to the running session:

| Button | Available when | Effect |
|--------|---------------|--------|
| ▶ Start | WAITING | Force-starts the quiz (skips autostart wait) |
| ⏸ Pause | QUESTION | Freezes the question timer |
| ▶ Resume | QUESTION (paused) | Resumes the timer from where it stopped |
| ⏭ Skip | QUESTION / ANSWER_REVEAL / LEADERBOARD | Advances to the next phase immediately |

Only the host socket (the browser that created the room) can send host controls — other clients' commands are rejected.

---

## Persistent Storage

Session results are automatically saved to `data/sessions.db` (SQLite) at the end of every completed quiz. No configuration is needed — the file is created on first run.

To view history, open `http://localhost:8080#/stats` or query the API:

```bash
curl http://localhost:8080/api/stats
```

The database file can be backed up by simply copying `data/sessions.db`.

---

## Running in Development Mode

Use `nodemon` for auto-restart on file changes:

```bash
npm run dev
```

For frontend development with hot reload:

```bash
# Terminal 1: backend
npm run dev

# Terminal 2: frontend dev server (proxies to backend)
cd frontend
npm run dev
# Opens http://localhost:5173
```

---

## Port Conflicts

If port 8080 is already in use:

1. Edit `config.json`: change `"port": 8080` to another value (e.g. `3001`)
2. Restart the server

Note: QR codes encode the server's LAN IP and port at the time of room creation. If you change the port, existing QR codes become invalid.

---

## Firewall (macOS)

If players cannot connect from other devices, allow Node.js through the firewall:

**System Settings → Network → Firewall → Options**
Allow incoming connections for `node`

Or temporarily disable the firewall for the session.

---

## Verifying Network Access

After starting, run this from another device on the same Wi-Fi:

```
http://[IP shown in terminal]:8080/health
```

Should return: `{"status":"ok","uptime":...}`
