# API Reference — Quiz Room Local

WebSocket events specification for the Quiz Room Local system.

**Transport:** Socket.IO 4.x (WebSocket with HTTP long-polling fallback)
**Default endpoint:** `http://localhost:8080`

---

## Connection

```javascript
import { io } from 'socket.io-client';
const socket = io('http://localhost:8080');
```

---

## Client → Server Events

All events use an acknowledgement callback: `socket.emit(event, data, callback)`.

Callback format:
```javascript
// Success
{ success: true, ...data }

// Failure
{ success: false, error: "Human-readable error message" }
```

---

### `create-quiz`

Creates a new quiz room. Called by the quiz host.

> **Note:** All quizzes use category mode. The standard mode example below is kept for historical reference only — the server no longer enforces `categoryMode: true` (enforcement was removed in v0.3.1 when standard quizzes were deleted from the quiz library entirely).

**Standard mode (historical reference — no longer used):**
```javascript
socket.emit('create-quiz', {
  quizData: {
    title: string,           // Required. Shown to players
    questions: [
      {
        question: string,    // Required. The question text
        answers: [           // Required. Exactly 4 strings
          string, string, string, string
        ],
        correctAnswer: number,  // Required. Index 0–3
        timeLimit: number,      // Optional. Overrides config.questionTime
        image: string,          // Optional. URL of image to show above question
        audio: string           // Optional. URL of audio to auto-play
      }
    ]
  },
  settings: { /* see below */ },
  playerCount: number           // How many players must join before auto-start
}, callback);
```

**Category mode request (required in v0.3.0):**
```javascript
socket.emit('create-quiz', {
  quizData: {
    title: string,
    categoryMode: true,       // Required in v0.3.0
    rounds: [
      {
        options: [
          {
            category: string,     // e.g. "Geography"
            question: string,
            answers: [string, string, string, string],
            correctAnswer: number,  // 0–3
            timeLimit?: number,
            image?: string,
            audio?: string
          },
          {
            category: string,     // second option
            // ... same fields
          }
        ]
      }
      // ... more rounds
    ]
  },
  settings: {                   // Optional. All fields override config.json defaults
    questionTime: number,        // 10–120 seconds
    answerRevealTime: number,    // 2–15 seconds
    leaderboardTime: number,     // 2–15 seconds
    categoryChosenTime: number,  // seconds to display chosen category (default 4)
    waitForAllPlayers: boolean,
    minPlayers: number,
    maxPlayers: number
  },
  playerCount: number            // Required. Quiz auto-starts when this many players join
}, (response) => {
  // response.success: boolean
  // response.roomCode: string (6 chars, e.g. "AB3C7D")
  // response.error?: string
});
```

**Validation errors:**
- Missing `quizData` or `questions` (standard) / `rounds` (category mode)
- Empty questions/rounds array
- Any question does not have exactly 4 answers
- `correctAnswer` is not 0–3
- Category mode: missing `category` name or `question` text in any option

---

### `join-quiz`

Joins an existing quiz room. Called by each player.

**Request:**
```javascript
socket.emit('join-quiz', {
  roomCode?: string,  // Optional in kiosk mode — auto-uses the active room if omitted
  nickname: string    // 2–20 characters
}, (response) => {
  // response.success: boolean
  // response.message: string
  // response.nickname: string
  // response.roomCode: string
  // response.gameState: GameState  (see GameState type below)
  // response.error?: string
});
```

**Validation errors:**
- Nickname shorter than 2 or longer than 20 characters
- Nickname already taken (case-insensitive)
- Game already started
- Room is full (maxPlayers reached)
- If `roomCode` is provided: room code not 6 characters, or room code not found
- `noActiveRoom: true` in response — returned when no `roomCode` is given and there is no active session

---

### `submit-answer`

Submits the player's answer to the current question.

**Request:**
```javascript
socket.emit('submit-answer', {
  answerId: number    // 0, 1, 2, or 3
}, (response) => {
  // response.success: boolean
  // response.error?: string
});
```

**Validation errors:**
- Not currently in state `QUESTION`
- Socket not in any room
- Player already answered this question
- `answerId` is not 0–3

**Rate limiting:** Maximum 10 `submit-answer` events per socket per 30 seconds. Exceeding this returns `{ success: false, error: "..." }`.

---

### `submit-category`

Submits the category choice during Category Mode. Only the designated chooser can submit; other players' submissions are rejected.

**Request:**
```javascript
socket.emit('submit-category', {
  choiceIndex: number   // 0 or 1 (index into the options array)
}, (response) => {
  // response.success: boolean
  // response.error?: string
});
```

**Validation errors:**
- State is not `CATEGORY_SELECT`
- Socket is not the current chooser
- `choiceIndex` is not 0 or 1

---

### `watch-room`

Connects as a **read-only observer** (e.g. Projector View). The socket joins the room's broadcast channel but is not registered as a player — it does not affect autostart, player count, or answer evaluation.

**Request:**
```javascript
socket.emit('watch-room', {
  roomCode: string   // 6-char room code
}, (response) => {
  // response.success: boolean
  // response.gameState: GameState  (full extended state for initial sync)
  // response.error?: string
});
```

After connecting, the observer receives all `quiz-update` broadcasts in real time.

**Validation errors:**
- Room code not found

---

### `host-control`

Sends a control command to the active session. Only the socket that created the room (the host) can send this event.

**Request:**
```javascript
socket.emit('host-control', {
  roomCode: string,
  action: 'pause' | 'resume' | 'skip' | 'start'
}, (response) => {
  // response.success: boolean
  // response.error?: string
});
```

| Action | Effect |
|--------|--------|
| `start` | Force-starts the quiz from `WAITING` state |
| `pause` | Pauses the question timer; broadcasts `GAME_PAUSED` |
| `resume` | Resumes the question timer; broadcasts `GAME_RESUMED` |
| `skip` | Advances the game: QUESTION→reveal, ANSWER_REVEAL→leaderboard, LEADERBOARD→next question or end |

**Validation errors:**
- Room code not found
- Socket is not the host of that room
- Unknown action

---

### `podium-button-press`

Sent by the Raspberry Pi GPIO service (`gpio-service.py`) when a physical button is pressed. The server resolves the sender's IP address via `podiumRegistry` (built when the player joins) and calls `submitAnswer` on their behalf. **Not for use by browser clients.**

**Request:**
```javascript
socket.emit('podium-button-press', {
  buttonIndex: number   // 0=A (red), 1=B (blue), 2=C (green), 3=D (orange)
});
```

**Validation errors:**
- `buttonIndex` not in 0–3
- Sender IP not found in `podiumRegistry` (player has not joined from this podium)

---

### `get-game-state`

Returns the current game state. Useful after a reconnect.

**Request:**
```javascript
socket.emit('get-game-state', {
  roomCode: string    // Optional if socket is already in a room
}, (response) => {
  // response.success: boolean
  // response.gameState: GameState
  // response.error?: string
});
```

---

## Server → Client Events

The server emits one event type: **`quiz-update`**, with a `type` field that identifies the specific update.

```javascript
socket.on('quiz-update', (data) => {
  // data.type is always present
});
```

---

### `quiz-update` — Type: `PLAYER_JOINED`

Broadcast when a player joins the room (during WAITING state).

```javascript
{
  type: 'PLAYER_JOINED',
  players: [
    { nickname: string, score: number }
  ],
  totalPlayers: number
}
```

---

### `quiz-update` — Type: `PLAYER_LEFT`

Broadcast when a player disconnects.

```javascript
{
  type: 'PLAYER_LEFT',
  nickname: string,
  players: [{ nickname: string, score: number }],
  totalPlayers: number
}
```

---

### `quiz-update` — Type: `NO_ACTIVE_ROOM`

Sent to a player who called `join-quiz` without a `roomCode` when there is no active session on the server.

```javascript
{
  type: 'NO_ACTIVE_ROOM'
}
```

The player tablet should return to "Waiting for host..." state and resume polling `GET /api/current-room`.

---

### `quiz-update` — Type: `QUIZ_STARTING`

Broadcast when the quiz is about to start (3-second countdown).

```javascript
{
  type: 'QUIZ_STARTING',
  countdown: 3,           // Always 3
  quizTitle: string,
  totalQuestions: number
}
```

---

### `quiz-update` — Type: `NEW_QUESTION`

Broadcast when a new question is displayed. **Does NOT include the correct answer.**

```javascript
{
  type: 'NEW_QUESTION',
  questionIndex: number,   // 1-based (e.g. 1, 2, 3...)
  totalQuestions: number,
  question: {
    text: string,
    answers: [
      { id: 0, text: string },
      { id: 1, text: string },
      { id: 2, text: string },
      { id: 3, text: string }
    ],
    image?: string,          // Optional. URL of image to display above question text
    audio?: string           // Optional. URL of audio to auto-play during question
  },
  timeLimit: number        // Seconds for this question
}
```

---

### `quiz-update` — Type: `ANSWER_COUNT`

Broadcast each time a player submits an answer.

```javascript
{
  type: 'ANSWER_COUNT',
  answered: number,   // How many players have answered
  total: number       // Total players in room
}
```

---

### `quiz-update` — Type: `REVEAL_ANSWER`

Broadcast when the question timer ends or all players answered.

```javascript
{
  type: 'REVEAL_ANSWER',
  correctAnswer: number,   // 0–3
  statistics: {
    total: number,          // Players who answered
    notAnswered: number,    // Players who did not answer
    answers: {
      0: { count: number, percentage: number },
      1: { count: number, percentage: number },
      2: { count: number, percentage: number },
      3: { count: number, percentage: number }
    }
  },
  playerResults: [
    {
      playerId: string,      // socket.id
      nickname: string,
      answerId: number | null,  // null = did not answer
      isCorrect: boolean,
      didNotAnswer: boolean,
      pointsEarned: number
    }
  ]
}
```

---

### `quiz-update` — Type: `SHOW_LEADERBOARD`

Broadcast after `answerRevealTime` seconds, between questions.

```javascript
{
  type: 'SHOW_LEADERBOARD',
  leaderboard: [
    {
      playerId: string,
      nickname: string,
      score: number,
      correctAnswers: number,
      totalQuestions: number,   // Questions shown so far
      avgAnswerTime: number,    // Seconds, rounded to 0.1
      position: number          // 1, 2, 3, ...
    }
  ],
  questionIndex: number,     // Current question number (1-based)
  totalQuestions: number,
  isLastQuestion: boolean
}
```

---

### `quiz-update` — Type: `QUIZ_ENDED`

Broadcast after the final leaderboard display.

```javascript
{
  type: 'QUIZ_ENDED',
  finalLeaderboard: [
    // Same structure as SHOW_LEADERBOARD.leaderboard
  ],
  totalQuestions: number
}
```

---

### `quiz-update` — Type: `CATEGORY_SELECT`

**Category mode only.** Broadcast when a new round begins and a player must choose the question category.

```javascript
{
  type: 'CATEGORY_SELECT',
  chooserNickname: string,   // Nickname of the player who picks
  options: [
    { index: 0, category: string },
    { index: 1, category: string }
  ],
  roundIndex: number,        // 1-based round number
  totalRounds: number,
  timeLimit: number          // Seconds available to choose (from config)
}
```

If the chooser does not submit within `timeLimit` seconds, the server auto-selects randomly and sets `wasTimeout: true` in the follow-up event.

---

### `quiz-update` — Type: `CATEGORY_CHOSEN`

**Category mode only.** Broadcast immediately after a category is selected (by player or timeout), before the question appears.

```javascript
{
  type: 'CATEGORY_CHOSEN',
  category: string,    // The chosen category name
  choiceIndex: number, // 0 or 1
  wasTimeout: boolean  // true = auto-selected because timer expired
}
```

The question follows after `categoryChosenTime` seconds (default: 4, configurable in `config.json`) as a `NEW_QUESTION` event.

---

### `quiz-update` — Type: `GAME_PAUSED`

Broadcast when the host pauses the question timer.

```javascript
{
  type: 'GAME_PAUSED',
  timeRemaining: number   // Whole seconds left on the question timer
}
```

Only emitted when `gameState` is `QUESTION`. Has no effect if already paused.

---

### `quiz-update` — Type: `GAME_RESUMED`

Broadcast when the host resumes the question timer after a pause.

```javascript
{
  type: 'GAME_RESUMED',
  timeRemaining: number   // Whole seconds remaining when resumed
}
```

The question timer restarts from `timeRemaining`. Answer time for scoring is adjusted to exclude the paused duration.

---

## HTTP Endpoints

### `GET /health`

Server health check.

**Response:**
```json
{
  "status": "ok",
  "uptime": 142,
  "activeSessions": 1,
  "timestamp": "2026-03-05T17:00:00.000Z"
}
```

---

### `GET /api/current-room`

Returns the currently active game room (kiosk model — single room only).

**Response when active:**
```json
{ "roomCode": "AB3C7D" }
```

**Response when no active room:**
```json
{ "roomCode": null }
```

Player tablets poll this endpoint every 3 seconds. When `roomCode` is non-null, they auto-join without user input.

---

### `GET /api/media/:filename`

Serves a media file from the `media/` directory. Used for offline-capable image and audio in quizzes.

**Parameters:**
- `:filename` — filename in the `media/` folder (e.g. `logo.png`, `intro.mp3`)

**Response:** File content with appropriate MIME type, or `404` if not found.

---

### `POST /api/media/upload`

Uploads an image file to the `media/` directory. Used by the Quiz Creator to attach images to questions offline.

**Request:** `multipart/form-data` with field `image` containing the file.

**Accepted MIME types:** `image/jpeg`, `image/png`, `image/gif`, `image/webp`

**Size limit:** 5 MB

**Response (success):**
```json
{
  "success": true,
  "filename": "1741200000000.jpg",
  "url": "/api/media/1741200000000.jpg"
}
```

**Response (error):**
```json
{ "success": false, "error": "File too large" }
```

The `filename` returned is a timestamp-based name (e.g. `1741200000000.jpg`). Store it in the quiz option's `image` field; the frontend prepends `/api/media/` when rendering if the value does not already start with `http` or `/`.

---

### `GET /api/quizzes`

List all quiz files found in the `quizzes/` directory. Used by the QuizCreator "Load from library" feature.

**Response:**
```json
{
  "success": true,
  "quizzes": [
    {
      "id": "dummy-quiz-1",
      "title": "General Knowledge",
      "description": "",
      "questions": [ /* full question objects */ ]
    }
  ]
}
```

---

### `POST /api/quizzes/save`

Saves a quiz to the `quizzes/` directory. Used by the QuizCreator "Save to library" button.

**Request body:**
```json
{
  "title": "Friday Night Quiz",
  "questions": [ /* full question objects */ ]
}
```

**Response:**
```json
{
  "success": true,
  "id": "friday-night-quiz",
  "filename": "friday-night-quiz.json"
}
```

The `id` is derived from the title (lowercased, spaces replaced with hyphens). If a file with the same name already exists, a numeric suffix is appended (`-2`, `-3`, etc.) until a free name is found — existing files are never overwritten.

**Validation errors:**
- Missing or empty `title`
- Missing or empty `rounds` array
- Consecutive rounds share a category name (no-repeat rule)

---

### `DELETE /api/quizzes/:id`

Deletes a quiz file from the `quizzes/` directory.

**Parameters:**
- `:id` — quiz ID as returned by `GET /api/quizzes` or `POST /api/quizzes/save`

**Response:**
```json
{ "success": true }
```

Returns `{ "success": false, "error": "..." }` if the file does not exist.

---

### `GET /api/stats`

Returns aggregate statistics and a history of completed sessions (up to 50, newest first). Data is persisted in `data/sessions.db` (SQLite).

**Response:**
```json
{
  "success": true,
  "totals": {
    "total_sessions": 12,
    "total_players": 47,
    "avg_players": 3.9
  },
  "sessions": [
    {
      "id": 12,
      "room_code": "AB3C7D",
      "title": "Friday Night Quiz",
      "started_at": 1741200000000,
      "ended_at": 1741200900000,
      "total_questions": 10,
      "player_count": 4,
      "topScorer": {
        "nickname": "Alice",
        "score": 1240
      }
    }
  ]
}
```

---

### `GET /api/stats/session/:id`

Returns the full leaderboard for a single completed session.

**Parameters:**
- `:id` — integer session ID (from `/api/stats`)

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "position": 1,
      "nickname": "Alice",
      "score": 1240,
      "correct_answers": 9,
      "avg_answer_time": 4.2
    }
  ]
}
```

---

### `GET /api/stats/session/:id/questions`

Returns per-question statistics for a single completed session. Used by `StatsPanel` to render accuracy bars and answer distribution charts.

**Parameters:**
- `:id` — integer session ID (from `/api/stats`)

**Response:**
```json
{
  "success": true,
  "questionStats": [
    {
      "question_index": 0,
      "correct_answer": 2,
      "total_answered": 4,
      "not_answered": 0,
      "answer_0": 1,
      "answer_1": 0,
      "answer_2": 3,
      "answer_3": 0
    }
  ]
}
```

`correct_answer` is the 0-based index of the correct option (`-1` if unknown for sessions recorded before v0.3.1).

---

### `GET /api/podium/status`

Returns the nickname and current game phase for the device making the request. Used by `SideMonitor` (`#/side`) which runs in a separate Chromium process on the podium's HDMI-2 display and cannot share state via localStorage.

The server resolves the requesting IP address against `podiumRegistry` to find the player.

**Response (player found):**
```json
{ "nickname": "Alice", "phase": "QUESTION" }
```

**Response (no match or no active room):**
```json
{ "nickname": null, "phase": "WAITING" }
```

**Possible `phase` values:** `WAITING`, `STARTING`, `CATEGORY_SELECT`, `CATEGORY_CHOSEN`, `QUESTION`, `ANSWER_REVEAL`, `LEADERBOARD`, `ENDED`

---

### `GET /api/qr/:roomCode`

Generates a QR code PNG image that encodes the player join URL for the given room. Scan to open `http://<server-ip>:8080/?room=ROOMCODE` directly.

**Parameters:**
- `:roomCode` — 6-character room code (case-insensitive, auto-uppercased)

**Response:** `image/png` — 256×256 px PNG buffer

**Example usage in HTML:**
```html
<img src="/api/qr/AB3C7D" width="160" height="160" alt="QR code" />
```

---

## State Machine

### Category mode (only mode)

```
WAITING
  └─→ STARTING
        └─→ CATEGORY_SELECT   (chooser picks category; auto-resolves on timeout)
              └─→ QUESTION         (1 second after CATEGORY_CHOSEN)
                    └─→ ANSWER_REVEAL
                          └─→ LEADERBOARD
                                ├─→ CATEGORY_SELECT   (if more rounds remain)
                                └─→ ENDED             (if last round)
```

**Valid game states:** `WAITING` · `STARTING` · `QUESTION` · `ANSWER_REVEAL` · `LEADERBOARD` · `ENDED` · `CATEGORY_SELECT`

**Pause:** The `isPaused` flag can be set during `QUESTION` state. The game state string remains `QUESTION` while paused; the timer is simply suspended.

---

## Scoring Formula

```
Correct answer:
  points = 100 + max(0, questionTime - answerTimeSeconds) × 2

Wrong answer or no answer:
  points = 0
```

**Leaderboard tiebreaker:** players with equal scores are ranked by average answer time (ascending — faster is better).

---

## TypeScript Types (reference)

```typescript
// Returned by join-quiz, get-game-state, and watch-room
interface GameState {
  gameState: 'WAITING' | 'STARTING' | 'QUESTION' | 'ANSWER_REVEAL' | 'LEADERBOARD' | 'ENDED' | 'CATEGORY_SELECT';
  players: { nickname: string; score: number }[];
  totalQuestions: number;
  currentQuestionIndex: number;  // -1 before start, 0-based during game
  quizTitle: string;

  // Extended fields — returned by watch-room and get-game-state for observer sync
  isPaused?: boolean;
  timeRemaining?: number;        // Seconds left on question timer (QUESTION state)
  currentQuestion?: {            // Active question without correct answer
    text: string;
    answers: { id: number; text: string }[];
    image?: string;
    audio?: string;
  };
  correctAnswer?: number;        // 0–3, only present in ANSWER_REVEAL state
  leaderboard?: LeaderboardEntry[];  // Present in LEADERBOARD and ENDED states
}

interface LeaderboardEntry {
  playerId: string;
  nickname: string;
  score: number;
  correctAnswers: number;
  totalQuestions: number;
  avgAnswerTime: number;   // Seconds, rounded to 0.1
  position: number;        // 1, 2, 3, ...
}
```
