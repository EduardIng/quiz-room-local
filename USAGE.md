# Usage Guide — Quiz Room Local

How to run quiz sessions from start to finish with kiosk tablet podiums.

---

## Quick Flow

```
1. Host starts server      →  npm start
2. Host opens browser      →  http://server:8080/#/host
3. Host selects a quiz     →  picks from library + sets expected player count
4. Host clicks Launch      →  game session created, tablets auto-discover it
5. Players join            →  type only their nickname (no room code needed)
6. Quiz auto-starts        →  when expected player count is reached (no manual Start)
7. Game runs automatically →  category select → questions → timers → reveals → leaderboard
8. Quiz ends               →  final standings shown, tablets return to waiting
9. View history            →  http://server:8080/#/stats
```

---

## Pages

| URL | Who uses it | Purpose |
|-----|-------------|---------|
| `http://server:8080/#/` | Player tablets | Kiosk join screen (nickname only) |
| `http://server:8080/#/host` | Host device | Select quiz, set player count, launch, control game |
| `http://server:8080/#/create` | Quiz author | Create and save quizzes (must enable category mode) |
| `http://server:8080/#/screen` | Projector/TV | Read-only big-screen display (auto-discovers room) |
| `http://server:8080/#/side` | Podium side monitor | Shows player nickname on HDMI-2 (Raspberry Pi podiums) |
| `http://server:8080/#/stats` | Admin | View completed session history |

---

## Host Flow

### Step 1 — Open Host Panel

```
http://server:8080/#/host
```

### Step 2 — Select a quiz

The library lists all quizzes in the `quizzes/` folder. Click a quiz to select it.

### Step 3 — Configure settings

| Setting | Default | Notes |
|---------|---------|-------|
| Session name | *(empty)* | Optional label shown on the projector screen top-right corner |
| Player count | 4 | Quiz auto-starts when this many players have joined |

> Question time is set globally in `config.json` (`quiz.questionTime`, default 30s). Per-question timer overrides can be set in the Quiz Creator.

### Step 4 — Launch

Click **🚀 Launch Quiz**. Tablets on the LAN detect the new game within 3 seconds and show the nickname input screen.

### Step 5 — Wait for players

The host panel shows connected players in real time. When the expected player count is reached, the quiz **starts automatically** — no manual action needed.

> All quizzes must use category mode. Non-category quizzes are rejected at launch.

---

## Creating Quizzes

### Open the Quiz Creator

```
http://server:8080/#/create
```

### Build your quiz

- Enter a **quiz title**
- Add questions with the **+ Add question** button
- For each question: enter text, fill in 4 answers, click the letter button to mark the correct one
- Optionally set a per-question timer (overrides the global setting)
- Optionally add an **image URL** — shown above the question text
- Optionally add an **audio URL** — auto-plays when the question starts

### Save to library

Click **💾 Save to library** to save to the server's `quizzes/` folder. It will appear in the Host Panel immediately. After saving, a **→ Go to Host Panel** link appears for quick navigation.

### Or load an existing quiz

- **⬆ Import JSON** — load a `.json` file from your computer
- **📂 From library** — pick any quiz already saved on the server

---

## Category Mode

Category mode replaces the standard linear question list with **rounds**. Each round offers two category choices, and a designated player picks one — the corresponding question is then asked.

### Building a category mode quiz

In the Quiz Creator, enable **Category mode**. The editor switches to a round-based view:

- Each round has **two options**, each with a category name and a full question
- Add rounds with **+ Add round**

### During the game

- Before each round, one player is shown two category buttons and asked to pick
- The chooser rotates every round so every player gets a turn
- If the chooser doesn't pick within the time limit, a category is selected randomly
- All other players see the category options but cannot choose

---

## Projector View (Big Screen)

The projector view is a **read-only display** for a TV or large screen. It auto-discovers the active room — no room code needed.

### Opening

```
http://server:8080/#/screen
```

Point a browser on the TV/projector machine at this URL. It will show "Waiting for active game..." until a room is launched, then connect automatically.

Manual override (if needed): `http://server:8080/#/screen?room=AB3C7D`

### What it shows

- **WAITING** — room code + player list
- **QUESTION** — question text + 4 answers + animated timer bar (turns red last 5s)
- **ANSWER_REVEAL** — correct answer highlighted + answer distribution statistics
- **LEADERBOARD** — ranked list with position, nickname, and score (top 3 medals)
- **CATEGORY_SELECT** — both options + chooser name + countdown
- **PAUSED** — overlay with "⏸ Paused"
- **ENDED** — final podium; auto-resets to "Waiting..." after 12 seconds

---

## Host Controls

After launching a quiz, the host panel shows live controls:

| Button | When available | Effect |
|--------|---------------|--------|
| ▶ Start | WAITING state | Force-starts the quiz |
| ⏸ Pause | QUESTION state | Freezes the question timer |
| ▶ Resume | QUESTION state (paused) | Resumes the timer |
| ⏭ Skip | QUESTION / ANSWER_REVEAL / LEADERBOARD | Advances to the next phase |

**Skip behaviour:**
- From `QUESTION` → shows the answer reveal immediately
- From `ANSWER_REVEAL` → jumps to the leaderboard
- From `LEADERBOARD` → goes to the next question (or ends the game)

---

## Player Flow (Kiosk Tablets)

Tablets are permanently pointed at `http://server:8080/#/`. The player flow:

| Screen | What the player sees |
|--------|---------------------|
| WAITING FOR HOST | "Waiting for host..." — polls for active room every 3s |
| JOIN | Nickname input only (no room code) |
| WAITING | Connected players list, pulsing animation |
| STARTING | 3-second countdown |
| QUESTION | Question text + 4 colour-coded buttons + timer bar |
| ANSWER_SENT | "Answer submitted" + waiting for others |
| REVEAL | ✅/❌ result + points earned + correct answer |
| LEADERBOARD | Ranked list with medals 🥇🥈🥉 |
| ENDED | Final position + "Wait for next game" button |

Tablets auto-reconnect if the network drops (exponential backoff, 2s → 30s max).

---

## Statistics Dashboard

```
http://server:8080/#/stats
```

Displays all completed sessions:
- **Summary cards** — total sessions, total players, average players per session
- **Session history table** — date, quiz title, player count, top scorer
- **Expandable rows** — click "Leaderboard" on any row to see the full ranked results

Results are saved automatically at the end of every quiz.

---

## Scoring System

Points awarded only for **correct** answers:

```
basePoints = 100
timeBonus  = max(0, questionTime - answerTimeSeconds) × 2
totalPoints = basePoints + timeBonus
```

**Tiebreaker:** Equal scores → lower average answer time wins.

---

## Language Toggle

Every page has a **UK / EN** button to switch between Ukrainian and English. Preference saved in `localStorage`.

---

## Tips for Live Events

- **Open `#/screen` on the TV before players arrive** — it shows "Waiting for active game..." and connects automatically when the host launches
- **Set `questionTime: 20`** for fast-paced games; `30` for harder questions
- **Use Pause** if something interrupts mid-question — the timer freezes exactly where it left off
- **Use Skip** to jump over a broken question or speed up the show
- **Check `#/stats` after each night** — full session history saved automatically
- **For image questions**, use direct image URLs or place files in `media/` and reference as `/api/media/filename.jpg`
- **Run on wired ethernet** for the server — Wi-Fi is fine for tablets
