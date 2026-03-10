# Usage Guide — Quiz Room Auto

How to run quiz sessions from start to finish.

---

## Quick Flow

```
1. Host starts server   →  npm start
2. Host opens browser   →  http://localhost:8080#/create
3. Host creates room    →  Quiz Creator UI → Launch Quiz → room code + QR appear
4. (Optional) Open projector view on TV  →  #/screen?room=CODE
5. Players join         →  scan QR code OR open app and type room code + nickname
6. Game runs itself     →  automatic questions, timers, reveals, leaderboard
7. Quiz ends            →  final standings shown to everyone, results saved to DB
8. View history         →  http://localhost:8080#/stats
```

---

## Pages

| URL | Who uses it | Purpose |
|-----|-------------|---------|
| `http://localhost:8080` | Players | Join screen (room code + nickname) |
| `http://localhost:8080/?room=AB3C7D` | Players | Join with room code pre-filled |
| `http://localhost:8080#/create` | Host | Create and launch a quiz |
| `http://localhost:8080#/admin` | Host | Monitor all active rooms live |
| `http://localhost:8080#/stats` | Host | View completed session history |
| `http://localhost:8080#/screen?room=AB3C7D` | Projector/TV | Read-only big-screen view |

---

## Creating a Quiz (Browser UI)

### Step 1 — Open the Quiz Creator

```
http://localhost:8080#/create
```

### Step 2 — Build your quiz

- Enter a **quiz title**
- Add questions with the **+ Add question** button
- For each question: enter text, fill in 4 answers, click the letter button to mark the correct one
- Optionally set a per-question timer (overrides the global setting)
- Optionally add an **image URL** — shown above the question text on players' screens (🖼 badge appears on the list item)
- Optionally add an **audio URL** — auto-plays when the question starts, stops at answer reveal; replay button shown to players (🎵 badge appears on the list item)
- **Drag questions** by the ⠿ handle to reorder them

### Step 3 — Or load an existing quiz

- **⬆ Import JSON** — load a `.json` file from your computer
- **📂 From library** — pick any quiz from the `quizzes/` folder on the server

### Step 4 — Configure settings

| Setting | Default | Notes |
|---------|---------|-------|
| Time per question | 30s | Overridable per-question |
| Min. players | 1 | Game auto-starts when this many join |
| Autostart | on | Disable to start manually |

### Step 5 — Launch

Click **🚀 Launch Quiz**. On success you'll see:
- The 6-character **room code** (large, shareable)
- A **QR code** — players scan it to open the join URL directly

### Step 6 — Save for later (optional)

- **⬇ Save JSON** — download the quiz as a `.json` file to your computer
- **💾 Save to library** — upload the quiz directly to the server's `quizzes/` folder; it will appear in "Load from library" on any future session

---

## Category Mode

Category mode replaces the standard linear question list with **rounds**. Each round offers two category choices, and a designated player picks one — the corresponding question is then asked.

### Building a category mode quiz

In the Quiz Creator, enable **Category mode** (toggle above the question list). The editor switches to a round-based view:

- Each round has **two options**, each with a category name and a full question
- Add rounds with **+ Add round**
- Each option has the same fields as a standard question (text, 4 answers, correct answer, optional image/audio/time limit)

### During the game

- Before each round, one player is shown two category buttons and asked to pick
- The chooser rotates every round so every player gets a turn
- If the chooser doesn't pick within the time limit, a category is selected randomly
- All other players see the category options but cannot choose
- After a choice is made, the selected question is shown normally

### Player screens (category mode additions)

| Screen | What the player sees |
|--------|---------------------|
| CATEGORY_SELECT (chooser) | Two category buttons to pick from + countdown |
| CATEGORY_SELECT (others) | Waiting screen showing the chooser's name and options |
| CATEGORY_CHOSEN | Brief flash showing the chosen category before the question |

---

## Projector View

The projector view is a **read-only display** designed for a TV or large screen visible to all players. It does not count as a player and does not affect game logic.

### Opening the projector view

After launching a quiz, the creator success screen shows a **Projector View** link. Click it to open in a new tab, or open manually:

```
http://localhost:8080#/screen?room=AB3C7D
```

Display on a second screen (TV, projector) via screen mirroring or a second browser window.

### What it shows

- **WAITING** — room code in large text + QR code for players to scan
- **QUESTION** — full question text + 4 answer options + animated timer bar (turns red in the last 5 seconds)
- **ANSWER_REVEAL** — correct answer highlighted + answer distribution statistics
- **LEADERBOARD** — ranked list with position, nickname, and score (top 3 medals)
- **CATEGORY_SELECT** — both category options + chooser name + countdown
- **PAUSED** — translucent overlay with "⏸ Paused" message
- **ENDED** — final podium

The projector view stays in sync automatically. If the page is loaded mid-game, it requests the current game state and renders it immediately.

---

## Host Controls

After launching a quiz, the creator success screen shows a **Host Controls** panel. These controls send commands to the live session.

| Button | When available | Effect |
|--------|---------------|--------|
| ▶ Start | WAITING state | Force-starts the quiz (skips autostart wait) |
| ⏸ Pause | QUESTION state | Freezes the question timer |
| ▶ Resume | QUESTION state (paused) | Resumes the question timer from where it stopped |
| ⏭ Skip | QUESTION / ANSWER_REVEAL / LEADERBOARD | Advances to the next phase immediately |

**Skip behaviour:**
- From `QUESTION` → shows the answer reveal immediately
- From `ANSWER_REVEAL` → jumps to the leaderboard
- From `LEADERBOARD` → goes to the next question (or ends the game if it was the last)

---

## Players Joining

Players have three ways to join:

1. **Scan the QR code** displayed after room creation or on the admin panel — opens the join page with the room code already filled in
2. **Direct URL** — share `http://[server-ip]:8080/?room=AB3C7D`; the room code field is pre-filled
3. **Manual entry** — open `http://[server-ip]:8080` and type the code + nickname

**Player flow (8 screens):**

| Screen | What the player sees |
|--------|---------------------|
| JOIN | Room code input + nickname input |
| WAITING | List of connected players, pulsing dots |
| STARTING | 3-second countdown animation |
| QUESTION | Question text + 4 colour-coded buttons + timer bar |
| ANSWER_SENT | "Answer submitted" + waiting for others |
| REVEAL | ✅/❌ result + points earned + correct answer |
| LEADERBOARD | Ranked list with medals 🥇🥈🥉 |
| ENDED | Final position + stats + "Play Again" |

---

## Admin Panel

```
http://localhost:8080#/admin
```

Shows all active rooms in real time (polls every 2 seconds):
- Room code, quiz title, current game state, player count
- QR code for each room (80px) — point a camera at it to join instantly
- Copy-to-clipboard button for the room code
- **Projector View** link — opens the big-screen display for that room in a new tab
- Link to the statistics dashboard

---

## Statistics Dashboard

```
http://localhost:8080#/stats
```

Displays all completed sessions saved to `data/sessions.db`:
- **Summary cards** — total sessions, total players, average players per session
- **Session history table** — date, quiz title, player count, top scorer
- **Expandable rows** — click "Leaderboard" on any row to see the full ranked results

Results are saved automatically at the end of every quiz. No setup required.

---

## Starting a Session via WebSocket (advanced)

The UI handles this for you, but you can also create rooms programmatically:

```javascript
const socket = io('http://localhost:8080');

socket.emit('create-quiz', {
  quizData: {
    title: 'Friday Night Quiz',
    questions: [
      {
        question: 'What year did Ukraine gain independence?',
        answers: ['1989', '1991', '1993', '1995'],
        correctAnswer: 1
      }
    ]
  },
  settings: {
    questionTime: 25,
    answerRevealTime: 6,
    leaderboardTime: 8,
    autoStart: true,
    waitForAllPlayers: true,
    minPlayers: 2
  }
}, (response) => {
  if (response.success) {
    console.log('Room code:', response.roomCode);
    // Generate QR: GET /api/qr/AB3C7D
  }
});
```

Players receive `quiz-update` events throughout:

```javascript
socket.on('quiz-update', (data) => {
  switch (data.type) {
    case 'QUIZ_STARTING':    // 3-second countdown
    case 'NEW_QUESTION':     // Show question + answers
    case 'ANSWER_COUNT':     // X/Y players answered
    case 'REVEAL_ANSWER':    // Show correct answer + scores
    case 'SHOW_LEADERBOARD': // Rankings between questions
    case 'QUIZ_ENDED':       // Final results
    case 'CATEGORY_SELECT':  // (category mode) player must pick a category
    case 'CATEGORY_CHOSEN':  // (category mode) category was selected
    case 'GAME_PAUSED':      // Host paused the timer
    case 'GAME_RESUMED':     // Host resumed the timer
  }
});
```

See [API.md](API.md) for full event payloads.

---

## Scoring System

Points are awarded only for **correct** answers:

```
basePoints = 100
timeBonus  = max(0, questionTime - answerTimeSeconds) × 2
totalPoints = basePoints + timeBonus
```

**Example:** Question time = 30s, player answers in 5s:
```
100 + (30 - 5) × 2 = 150 points
```

**Tiebreaker:** Equal scores → lower average answer time wins.

---

## Language Toggle

Every page has a **UK / EN** button to switch between Ukrainian and English. The preference is saved in `localStorage` and persists across sessions.

---

## Useful API Calls

```bash
# Server health
curl http://localhost:8080/health

# Active rooms
curl http://localhost:8080/api/active-quizzes

# Quiz library (files in quizzes/)
curl http://localhost:8080/api/quizzes

# Session history (SQLite)
curl http://localhost:8080/api/stats

# Leaderboard for session id=3
curl http://localhost:8080/api/stats/session/3

# QR code for a room (returns image/png)
curl http://localhost:8080/api/qr/AB3C7D --output qr.png
```

---

## Tips for Live Events

- **Open the projector view on the big screen** before players arrive — the room code and QR code are shown on the waiting screen so players can join by scanning
- **Use `/?room=CODE` links** — pre-fill the room code in shared links or on printed cards
- **Set `questionTime: 20`** for fast-paced games; `30` for harder questions
- **Set `minPlayers: 2`** so the game doesn't auto-start before enough people join
- **Use `waitForAllPlayers: true`** so fast players don't wait once everyone has answered
- **Use Pause** if something interrupts the venue mid-question — the timer freezes and resumes exactly where it left off
- **Use Skip** to jump over a question that has a problem, or to speed up the show
- **Check `#/stats` after each night** — full session history is saved automatically
- **Run on a wired ethernet connection** for the host machine — Wi-Fi is fine for players
- **For image questions**, use direct image URLs (Imgur, Wikimedia Commons, or your own server) — the image appears above the question text on every player's screen and on the projector
- **For music questions**, ask players to tap the screen once before the quiz starts to avoid browser autoplay blocks; the 🎵 Replay button lets anyone manually start the audio if it was blocked
- **For category mode**, brief the chooser before the event — they may not have used it before; the UI shows a countdown so they know how much time they have
