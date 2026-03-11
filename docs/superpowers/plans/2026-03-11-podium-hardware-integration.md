# Podium Hardware Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Raspberry Pi podiums with physical GPIO buttons, side monitors, and a redesigned central stand display into the quiz-room-local kiosk system.

**Architecture:** Backend gains podium IP registry and GPIO button event handling. Frontend gains a Timebar component, overhauled PlayerView with all new game states, redesigned ProjectorView for the central stand, and a new SideMonitor route. Pi kiosk layer handles OS lockdown, dual display, and a Python GPIO-to-Socket.IO bridge.

**Tech Stack:** Node.js + Socket.IO (backend), React + Vite (frontend), Python 3 + python-socketio + RPi.GPIO (Pi GPIO service), Raspberry Pi OS (kiosk layer)

**Spec:** `docs/superpowers/specs/2026-03-11-podium-hardware-integration-design.md`

---

## Chunk 1: Backend Changes

### Task 1: Add `categoryChosenTime` to config and extend CATEGORY_CHOSEN delay

**Files:**
- Modify: `config.json`
- Modify: `backend/src/quiz-session-auto.js`
- Modify: `backend/tests/session.test.js`

- [ ] **Step 1.1: Write failing test for 4-second CATEGORY_CHOSEN delay**

Open `backend/tests/session.test.js`. Find the existing `CATEGORY_CHOSEN` timing test (search for `_resolveCategory` or `CATEGORY_CHOSEN`). Add:

```js
it('delays nextQuestion by categoryChosenTime (4s) after CATEGORY_CHOSEN', async () => {
  const settings = { ...defaultSettings, categoryChosenTime: 4, questionTime: 30,
    answerRevealTime: 5, leaderboardTime: 5, waitForAllPlayers: true, autoStart: false };
  const session = new AutoQuizSession(categoryQuizData, settings);
  session.init(io, 'ROOM1');

  const broadcasts = [];
  io.to.mockReturnValue({ emit: (_, msg) => broadcasts.push(msg) });

  session._resolveCategory(0, 0, false);

  // CATEGORY_CHOSEN should be broadcast immediately
  const chosen = broadcasts.find(m => m.type === 'CATEGORY_CHOSEN');
  expect(chosen).toBeDefined();

  // NEW_QUESTION should NOT be broadcast yet
  expect(broadcasts.find(m => m.type === 'NEW_QUESTION')).toBeUndefined();

  // After 4s, NEW_QUESTION should appear
  await new Promise(r => setTimeout(r, 4100));
  expect(broadcasts.find(m => m.type === 'NEW_QUESTION')).toBeDefined();
}, 6000);
```

- [ ] **Step 1.2: Run test to confirm it fails**

```bash
cd /Users/einhorn/quiz-room-local
npm test -- --testPathPattern=session --verbose 2>&1 | grep -A3 "categoryChosenTime"
```

Expected: FAIL (currently delay is hardcoded to 1000ms)

- [ ] **Step 1.3: Update config.json — add `categoryChosenTime` and set `autoStart: true`**

In `config.json`, inside the `"quiz"` block:
- Change `"autoStart": false` → `"autoStart": true`
- Add after `"leaderboardTime": 5`:

```json
"categoryChosenTime": 4,
"autoStart": true,
```

- [ ] **Step 1.4: Read `categoryChosenTime` in session constructor and use it**

In `backend/src/quiz-session-auto.js`, in the constructor (around line 32), add:
```js
this.categoryChosenTime = settings.categoryChosenTime || 4;
```

In `_resolveCategory` (around line 599), change:
```js
// BEFORE:
setTimeout(() => this.nextQuestion(), 1000);

// AFTER:
setTimeout(() => this.nextQuestion(), this.categoryChosenTime * 1000);
```

- [ ] **Step 1.5: Run test to confirm it passes**

```bash
npm test -- --testPathPattern=session --verbose 2>&1 | grep -E "(PASS|FAIL|categoryChosenTime)"
```

Expected: PASS

- [ ] **Step 1.6: Commit**

```bash
git add config.json backend/src/quiz-session-auto.js backend/tests/session.test.js
git commit -m "feat: extend CATEGORY_CHOSEN delay to configurable categoryChosenTime (default 4s)"
```

---

### Task 2: Require categoryMode on all quizzes — reject standard quizzes at session creation

**Files:**
- Modify: `backend/src/websocket-handler-auto.js`
- Modify: `backend/tests/websocket.test.js`

- [ ] **Step 2.1: Write failing test for categoryMode validation**

The existing handler uses a callback pattern (`respond({ success, error })`), not `socket.emit`. Write the test using the acknowledgement callback form:

```js
it('rejects create-quiz when quizData does not have categoryMode: true', (done) => {
  const standardQuiz = { title: 'Test', questions: [
    { question: 'Q1', answers: ['A','B','C','D'], correctAnswer: 0 }
  ]};
  clientSocket.emit('create-quiz', { quizData: standardQuiz, settings: {} }, (response) => {
    expect(response.success).toBe(false);
    expect(response.error).toMatch(/category mode/i);
    done();
  });
});
```

- [ ] **Step 2.2: Run test to confirm it fails**

```bash
npm test -- --testPathPattern=websocket --verbose 2>&1 | grep -A3 "categoryMode"
```

Expected: FAIL

- [ ] **Step 2.3: Add categoryMode validation to websocket-handler-auto.js**

In `backend/src/websocket-handler-auto.js`, find `handleCreateQuiz` (or the `create-quiz` event handler). The handler uses a `respond` callback pattern. Before creating the session, add a guard that returns via the callback — do NOT use `socket.emit`:

```js
// Перевіряємо що квіз є в режимі категорій (обов'язково для всіх квізів)
if (!quizData.categoryMode || !quizData.rounds || !Array.isArray(quizData.rounds)) {
  return respond({ success: false, error: 'Квіз повинен бути в режимі категорій (categoryMode: true)' });
}
```

**Also remove the existing `else` branch** that accepts standard (non-category) quizzes. Locate the block that handles `quizData` without `categoryMode` and delete it — standard quizzes are no longer supported.

- [ ] **Step 2.4: Run test to confirm it passes**

```bash
npm test -- --testPathPattern=websocket --verbose 2>&1 | grep -E "(PASS|FAIL|categoryMode)"
```

Expected: PASS

- [ ] **Step 2.5: Commit**

```bash
git add backend/src/websocket-handler-auto.js backend/tests/websocket.test.js
git commit -m "feat: require categoryMode on all quizzes — reject standard quizzes at session creation"
```

---

### Task 3: Host sets player count — quiz auto-starts when count reached

**Files:**
- Modify: `backend/src/websocket-handler-auto.js`
- Modify: `backend/src/quiz-session-auto.js`
- Modify: `backend/tests/websocket.test.js`
- Modify: `backend/tests/session.test.js`

- [ ] **Step 3.1: Write failing test — playerCount passed in create-quiz triggers autoStart**

In `backend/tests/session.test.js`, add:

```js
it('auto-starts when playerCount players have joined', async () => {
  const settings = { ...defaultSettings, playerCount: 2, autoStart: true,
    categoryChosenTime: 4, questionTime: 30, answerRevealTime: 5, leaderboardTime: 5 };
  const session = new AutoQuizSession(categoryQuizData, settings);
  session.init(io, 'ROOM1');

  const broadcasts = [];
  io.to.mockReturnValue({ emit: (_, msg) => broadcasts.push(msg) });

  session.addPlayer('socket1', 'Alice');
  expect(broadcasts.find(m => m.type === 'QUIZ_STARTING')).toBeUndefined();

  session.addPlayer('socket2', 'Bob');
  await new Promise(r => setTimeout(r, 100));

  expect(broadcasts.find(m => m.type === 'QUIZ_STARTING')).toBeDefined();
});
```

- [ ] **Step 3.2: Run test to confirm it fails**

```bash
npm test -- --testPathPattern=session --verbose 2>&1 | grep -A3 "playerCount"
```

Expected: FAIL

- [ ] **Step 3.3: Add playerCount to session constructor and addPlayer logic**

In `backend/src/quiz-session-auto.js`, in the constructor, add:
```js
// Кількість гравців визначена ведучим (0 = не встановлено, використовує minPlayers)
this.playerCount = settings.playerCount || settings.minPlayers || 1;
```

In `addPlayer`, find the autoStart check (around line 176) and change:
```js
// BEFORE:
if (this.settings.autoStart && this.players.size >= this.settings.minPlayers) {

// AFTER:
if (this.settings.autoStart && this.players.size >= this.playerCount) {
```

- [ ] **Step 3.4: Pass playerCount from create-quiz event through to session settings**

In `backend/src/websocket-handler-auto.js`, find where `settings` is built for the session. Add `playerCount` from the incoming data:

```js
// Додаємо playerCount від ведучого до налаштувань сеансу
const sessionSettings = {
  ...config.quiz,
  ...settings,
  playerCount: data.playerCount || config.quiz.minPlayers,
  autoStart: true,  // завжди true в кіоск-режимі
};
```

- [ ] **Step 3.5: Run tests to confirm they pass**

```bash
npm test -- --testPathPattern="session|websocket" --verbose 2>&1 | grep -E "(PASS|FAIL)"
```

Expected: all PASS

- [ ] **Step 3.6: Run full test suite to check for regressions**

```bash
npm test 2>&1 | tail -10
```

Expected: all tests pass (currently 176)

- [ ] **Step 3.7: Commit**

```bash
git add backend/src/quiz-session-auto.js backend/src/websocket-handler-auto.js backend/tests/session.test.js backend/tests/websocket.test.js
git commit -m "feat: host sets playerCount — quiz auto-starts when all players have joined"
```

---

### Task 4: Podium IP registry and GPIO button-press event

**Files:**
- Modify: `backend/src/websocket-handler-auto.js`
- Modify: `backend/tests/websocket.test.js`

- [ ] **Step 4.1: Write a real failing integration test for podium-button-press**

This test requires two connected sockets: a player socket and a GPIO socket from the same IP. Use the existing test infrastructure (look at how `websocket.test.js` sets up `clientSocket`). Add a second socket that simulates the GPIO service:

```js
it('podium-button-press submits answer on behalf of player with matching IP', (done) => {
  let gpioSocket;
  // Join a game as a player first (using existing category quiz fixture)
  clientSocket.emit('create-quiz', { quizData: categoryQuizData, settings: {}, playerCount: 1 }, () => {
    clientSocket.emit('join-quiz', { nickname: 'GpioPlayer' }, () => {
      // Force-start so we enter QUESTION state
      clientSocket.emit('host-control', { roomCode: currentRoom, action: 'start' });

      clientSocket.once('quiz-update', (msg) => {
        if (msg.type !== 'NEW_QUESTION') return;

        // GPIO socket connects — same IP as clientSocket (both loopback in tests)
        gpioSocket = require('socket.io-client')(`http://localhost:${TEST_PORT}`);
        gpioSocket.on('connect', () => {
          gpioSocket.emit('podium-button-press', { buttonIndex: 0 });
        });

        // Player socket should receive ANSWER_COUNT (answer was recorded)
        clientSocket.once('quiz-update', (update) => {
          expect(update.type).toBe('ANSWER_COUNT');
          expect(update.answered).toBe(1);
          gpioSocket.disconnect();
          done();
        });
      });
    });
  });
});
```

Note: This test depends on the test runner using loopback (`127.0.0.1`) for all sockets, which makes IP matching deterministic. If the test infrastructure uses different IPs per socket, annotate this as a manual integration test and skip in CI with `it.skip(...)`, documenting the manual verification steps.

- [ ] **Step 4.2: Add podiumRegistry Map to QuizRoomManager**

In `backend/src/websocket-handler-auto.js`, find where `QuizRoomManager` class or module-level state is defined. Add:

```js
// Реєстр кіоск-подіумів: IP → socketId гравця
// Використовується для маппінгу GPIO натискань кнопок до гравців
const podiumRegistry = new Map();
```

- [ ] **Step 4.3: Register player IP on join-quiz**

In the `join-quiz` / `handleJoinQuiz` handler, after a player successfully joins, add:

```js
// Реєструємо IP подіуму для GPIO-сервісу
const playerIP = socket.handshake.address.replace('::ffff:', '');
podiumRegistry.set(playerIP, socket.id);
log('Podium', `Зареєстровано подіум: IP=${playerIP} → socket=${socket.id}`);
```

- [ ] **Step 4.4: Remove player IP on disconnect**

In the `disconnect` handler, add:

```js
// Видаляємо реєстрацію подіуму при відключенні
for (const [ip, sid] of podiumRegistry.entries()) {
  if (sid === socket.id) {
    podiumRegistry.delete(ip);
    log('Podium', `Видалено реєстрацію подіуму: IP=${ip}`);
    break;
  }
}
```

- [ ] **Step 4.5: Handle podium-button-press event**

In the Socket.IO connection handler, add a new event listener:

```js
// Обробка натискання фізичної кнопки від GPIO-сервісу подіуму
socket.on('podium-button-press', (data) => {
  const { buttonIndex } = data;

  // Валідуємо індекс кнопки
  if (typeof buttonIndex !== 'number' || buttonIndex < 0 || buttonIndex > 3) {
    log('Podium', `Некоректний buttonIndex: ${buttonIndex}`);
    return;
  }

  // Визначаємо IP відправника
  const senderIP = socket.handshake.address.replace('::ffff:', '');

  // Знаходимо socket гравця за IP
  const playerSocketId = podiumRegistry.get(senderIP);
  if (!playerSocketId) {
    log('Podium', `GPIO натискання від незареєстрованого IP: ${senderIP}`);
    return;
  }

  // Знаходимо кімнату гравця та сабмітимо відповідь
  const roomCode = currentActiveRoom;
  if (!roomCode) return;

  const session = manager.getSession(roomCode);
  if (!session) return;

  const result = session.submitAnswer(playerSocketId, buttonIndex, Date.now());
  if (!result.success) {
    log('Podium', `GPIO відповідь відхилена: ${result.error}`);
  } else {
    log('Podium', `GPIO кнопка ${buttonIndex} від IP=${senderIP} → гравець ${playerSocketId}`);
  }
});
```

- [ ] **Step 4.6: Run tests**

```bash
npm test 2>&1 | tail -10
```

Expected: all pass

- [ ] **Step 4.7: Commit**

```bash
git add backend/src/websocket-handler-auto.js backend/tests/websocket.test.js
git commit -m "feat: podium IP registry and GPIO button-press event handler"
```

---

## Chunk 2: Shared Timebar Component

### Task 5: Create Timebar React component

**Files:**
- Create: `frontend/src/components/Timebar.jsx`
- Create: `frontend/src/components/Timebar.css`

No backend tests — this is a pure UI component. Manual verification via browser.

- [ ] **Step 5.1: Create Timebar.css**

```css
/* Timebar.css — смуга зворотного відліку часу */

.timebar-wrapper {
  width: 100%;
}

.timebar-container {
  width: 100%;
  height: 12px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  overflow: hidden;
  margin: 12px 0;
}

.timebar-fill {
  height: 100%;
  border-radius: 6px;
  transition: width 1s linear, background-color 0.5s ease;
  background: #4caf50;
}

.timebar-fill.warning {
  background: #ff9800;
}

.timebar-fill.danger {
  background: #f44336;
}

.timebar-label {
  text-align: center;
  font-size: 1.1rem;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.9);
  margin-top: 4px;
}
```

- [ ] **Step 5.2: Create Timebar.jsx**

```jsx
// Timebar.jsx — компонент смуги зворотного відліку
// Отримує timeLimit (секунди), timeRemaining (секунди), відображає анімовану смугу

import { useEffect, useState, useRef } from 'react';
import './Timebar.css';

export default function Timebar({ timeLimit, timeRemaining, showLabel = true }) {
  const [displayTime, setDisplayTime] = useState(timeRemaining);
  const intervalRef = useRef(null);
  const startRef = useRef(Date.now());
  const startRemaining = useRef(timeRemaining);

  useEffect(() => {
    // Скидаємо при зміні timeRemaining ззовні (нове питання або синхронізація)
    startRef.current = Date.now();
    startRemaining.current = timeRemaining;
    setDisplayTime(timeRemaining);

    clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      const remaining = Math.max(0, startRemaining.current - elapsed);
      setDisplayTime(remaining);
      if (remaining <= 0) clearInterval(intervalRef.current);
    }, 100);

    return () => clearInterval(intervalRef.current);
  }, [timeRemaining]);

  const pct = timeLimit > 0 ? Math.max(0, (displayTime / timeLimit) * 100) : 0;
  const colorClass = pct > 40 ? '' : pct > 20 ? 'warning' : 'danger';
  const secs = Math.ceil(displayTime);

  return (
    <div className="timebar-wrapper">
      <div className="timebar-container">
        <div
          className={`timebar-fill ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && <div className="timebar-label">{secs}s</div>}
    </div>
  );
}
```

- [ ] **Step 5.3: Commit**

```bash
git add frontend/src/components/Timebar.jsx frontend/src/components/Timebar.css
git commit -m "feat: add shared Timebar component with color-coded countdown"
```

---

## Chunk 3: HostView Player Count Selector

### Task 6: Add player count input to HostView pre-game setup

**Files:**
- Modify: `frontend/src/components/HostView.jsx`
- Modify: `frontend/src/components/HostView.css`

- [ ] **Step 6.1: Read HostView to understand current structure**

Read `frontend/src/components/HostView.jsx` fully before editing.

- [ ] **Step 6.2: Add playerCount state and selector UI**

In `HostView.jsx`, find where quiz settings are collected (questionTime, minPlayers inputs). Add a `playerCount` state:

```jsx
const [playerCount, setPlayerCount] = useState(4);
```

Add the selector UI alongside existing settings:

```jsx
<div className="setting-row">
  <label>Кількість гравців сьогодні:</label>
  <div className="player-count-selector">
    {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
      <button
        key={n}
        className={`count-btn ${playerCount === n ? 'active' : ''}`}
        onClick={() => setPlayerCount(n)}
      >
        {n}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 6.3: Pass playerCount in create-quiz emit**

Find the `create-quiz` socket emit in HostView. Add `playerCount` to the payload:

```jsx
socket.emit('create-quiz', {
  quizData: selectedQuiz,
  settings: { questionTime },
  playerCount,   // <-- add this
});
```

- [ ] **Step 6.4: Add CSS for player count selector**

In `HostView.css`, add:

```css
.player-count-selector {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.count-btn {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  border: 2px solid rgba(255,255,255,0.3);
  background: rgba(255,255,255,0.1);
  color: #fff;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.15s;
}

.count-btn:hover {
  background: rgba(255,255,255,0.2);
}

.count-btn.active {
  background: #4caf50;
  border-color: #4caf50;
}
```

- [ ] **Step 6.5: Also show waiting count in HostView post-launch**

In the post-launch panel, show players joined vs target:

```jsx
<div className="join-progress">
  {players.length}/{playerCount} гравців приєдналось
</div>
```

- [ ] **Step 6.6: Manual test**

```bash
cd /Users/einhorn/quiz-room-local && npm start &
cd frontend && npm run dev
```

Open `http://localhost:3000/#/host`. Verify player count selector appears with buttons 1–8. Select 4, launch a quiz, confirm `create-quiz` socket payload includes `playerCount: 4`.

- [ ] **Step 6.7: Commit**

```bash
git add frontend/src/components/HostView.jsx frontend/src/components/HostView.css
git commit -m "feat: host player count selector — quiz auto-starts when N players join"
```

---

## Chunk 4: PlayerView Overhaul

### Task 7: Read current PlayerView before any changes

**Files:**
- Read: `frontend/src/components/PlayerView.jsx`
- Read: `frontend/src/components/PlayerView.css` (if exists)

- [ ] **Step 7.1: Read PlayerView.jsx fully**

Read the entire file. Map existing states: `waiting_for_host`, `entering_nickname`, `waiting_for_start`, `question`, `answer_reveal`, `leaderboard`, `ended`. Note all socket event handlers.

---

### Task 8: Add CATEGORY_SELECT state to PlayerView

**Files:**
- Modify: `frontend/src/components/PlayerView.jsx`
- Modify: `frontend/src/components/PlayerView.css`

- [ ] **Step 8.1: Add category select state handler**

In the socket event listener for `quiz-update`, add a handler for `CATEGORY_SELECT`:

```jsx
case 'CATEGORY_SELECT':
  setGameState('category_select');
  setCategoryData({
    chooserNickname: msg.chooserNickname,
    options: msg.options,           // [{ index, category }]
    timeLimit: msg.timeLimit,
    timeRemaining: msg.timeLimit,
  });
  break;
```

Add state variables at the top of the component:
```jsx
const [categoryData, setCategoryData] = useState(null);
const isChooser = categoryData?.chooserNickname === nickname;
```

- [ ] **Step 8.2: Render category_select state**

Add to the render logic:

```jsx
if (gameState === 'category_select' && categoryData) {
  return (
    <div className="screen category-select">
      <div className="chooser-banner">
        {isChooser
          ? 'Твоя черга обрати категорію!'
          : `${categoryData.chooserNickname} обирає категорію`}
      </div>
      <Timebar
        timeLimit={categoryData.timeLimit}
        timeRemaining={categoryData.timeRemaining}
      />
      <div className="category-options">
        {categoryData.options.map(opt => (
          <button
            key={opt.index}
            className={`category-btn ${!isChooser ? 'disabled' : ''}`}
            disabled={!isChooser}
            onClick={() => isChooser && socket.emit('submit-category', { choiceIndex: opt.index })}
          >
            {opt.category}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8.3: Add CSS for category select screen**

```css
.screen.category-select {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  min-height: 100vh;
}

.chooser-banner {
  font-size: 1.4rem;
  font-weight: bold;
  text-align: center;
  margin-bottom: 16px;
  padding: 12px 24px;
  background: rgba(255,255,255,0.1);
  border-radius: 12px;
}

.category-options {
  display: flex;
  gap: 20px;
  margin-top: 24px;
  flex-wrap: wrap;
  justify-content: center;
}

.category-btn {
  padding: 24px 40px;
  font-size: 1.3rem;
  font-weight: bold;
  border-radius: 16px;
  border: 3px solid rgba(255,255,255,0.4);
  background: rgba(255,255,255,0.15);
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 160px;
  text-align: center;
}

.category-btn:not(.disabled):hover {
  background: rgba(255,255,255,0.3);
  transform: scale(1.03);
}

.category-btn.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

- [ ] **Step 8.4: Handle CATEGORY_CHOSEN state (4-second display)**

```jsx
case 'CATEGORY_CHOSEN':
  setGameState('category_chosen');
  setChosenCategory(msg.category);
  break;
```

Add state: `const [chosenCategory, setChosenCategory] = useState('');`

Render:
```jsx
if (gameState === 'category_chosen') {
  return (
    <div className="screen category-chosen">
      <div className="chosen-label">Категорія</div>
      <div className="chosen-name">{chosenCategory}</div>
    </div>
  );
}
```

CSS:
```css
.screen.category-chosen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  text-align: center;
}

.chosen-label {
  font-size: 1.2rem;
  opacity: 0.7;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 12px;
}

.chosen-name {
  font-size: 3rem;
  font-weight: bold;
  padding: 24px 48px;
  background: rgba(255,255,255,0.15);
  border-radius: 20px;
}
```

- [ ] **Step 8.5: Commit**

```bash
git add frontend/src/components/PlayerView.jsx frontend/src/components/PlayerView.css
git commit -m "feat: PlayerView — category select and category chosen states"
```

---

### Task 9: PlayerView question state with Timebar + "waiting for other players"

**Files:**
- Modify: `frontend/src/components/PlayerView.jsx`
- Modify: `frontend/src/components/PlayerView.css`

- [ ] **Step 9.1: Add hasAnswered state and timebar to question render**

Add state: `const [hasAnswered, setHasAnswered] = useState(false);`

Reset on new question:
```jsx
case 'NEW_QUESTION':
  setHasAnswered(false);
  setGameState('question');
  setCurrentQuestion(msg.question);
  setTimeLimit(msg.timeLimit);
  setTimeRemaining(msg.timeLimit);
  break;
```

- [ ] **Step 9.2: Update question render to include Timebar and waiting state**

```jsx
if (gameState === 'question' && currentQuestion) {
  return (
    <div className="screen question">
      <div className="question-header">
        <span className="q-counter">{questionIndex}/{totalQuestions}</span>
      </div>
      <Timebar timeLimit={timeLimit} timeRemaining={timeRemaining} />
      <div className="question-text">{currentQuestion.text}</div>

      {hasAnswered ? (
        <div className="waiting-others">
          <div className="waiting-spinner" />
          Очікуємо інших гравців...
        </div>
      ) : (
        <div className="answer-grid">
          {currentQuestion.answers.map(ans => (
            <button
              key={ans.id}
              className={`answer-btn answer-${ans.id}`}
              onClick={() => {
                socket.emit('submit-answer', { answerId: ans.id });
                setHasAnswered(true);
                setMyAnswer(ans.id);
              }}
            >
              {ans.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

Add state: `const [myAnswer, setMyAnswer] = useState(null);`

- [ ] **Step 9.3: Add color-coded answer buttons CSS**

```css
.answer-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 20px;
  width: 100%;
  max-width: 600px;
}

.answer-btn {
  padding: 20px 16px;
  font-size: 1.1rem;
  font-weight: bold;
  border-radius: 14px;
  border: none;
  color: #fff;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.15s;
  min-height: 80px;
  text-align: center;
}

.answer-btn:active { transform: scale(0.97); }

/* Color-coded matching physical buttons */
.answer-btn.answer-0 { background: #e53935; } /* Red    — button A */
.answer-btn.answer-1 { background: #1e88e5; } /* Blue   — button B */
.answer-btn.answer-2 { background: #43a047; } /* Green  — button C */
.answer-btn.answer-3 { background: #fb8c00; } /* Orange — button D */

.waiting-others {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  margin-top: 40px;
  font-size: 1.3rem;
  opacity: 0.85;
}

.waiting-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(255,255,255,0.2);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }
```

- [ ] **Step 9.4: Commit**

```bash
git add frontend/src/components/PlayerView.jsx frontend/src/components/PlayerView.css
git commit -m "feat: PlayerView — question timebar and waiting-for-other-players state"
```

---

### Task 10: PlayerView answer reveal with time's up indicator + leaderboard with own row highlighted

**Files:**
- Modify: `frontend/src/components/PlayerView.jsx`
- Modify: `frontend/src/components/PlayerView.css`

- [ ] **Step 10.1: Handle REVEAL_ANSWER — show correct answer, own result, time's up**

```jsx
case 'REVEAL_ANSWER':
  setGameState('answer_reveal');
  setRevealData(msg);   // { correctAnswer, playerResults, statistics }
  break;
```

Add state: `const [revealData, setRevealData] = useState(null);`

Find own result:
```jsx
const myResult = revealData?.playerResults?.find(r => r.nickname === nickname);
```

Render:
```jsx
if (gameState === 'answer_reveal' && revealData) {
  const myResult = revealData.playerResults?.find(r => r.nickname === nickname);
  return (
    <div className="screen answer-reveal">
      <div className="reveal-grid">
        {currentQuestion?.answers.map(ans => (
          <div
            key={ans.id}
            className={`reveal-btn answer-${ans.id}
              ${ans.id === revealData.correctAnswer ? 'correct' : 'wrong'}
              ${ans.id === myAnswer ? 'my-pick' : ''}
            `}
          >
            {ans.text}
            {ans.id === revealData.correctAnswer && <span className="tick">✓</span>}
          </div>
        ))}
      </div>
      <div className="my-result">
        {myResult?.didNotAnswer
          ? <span className="timeout-msg">Час вийшов — 0 балів</span>
          : myResult?.isCorrect
            ? <span className="correct-msg">+{myResult.pointsEarned} балів!</span>
            : <span className="wrong-msg">Неправильно — 0 балів</span>
        }
      </div>
    </div>
  );
}
```

- [ ] **Step 10.2: Handle SHOW_LEADERBOARD — own row highlighted**

```jsx
case 'SHOW_LEADERBOARD':
  setGameState('leaderboard');
  setLeaderboard(msg.leaderboard);
  break;
```

Render:
```jsx
if (gameState === 'leaderboard') {
  return (
    <div className="screen leaderboard">
      <h2>Рейтинг</h2>
      <div className="lb-list">
        {leaderboard.map(p => (
          <div
            key={p.nickname}
            className={`lb-row ${p.nickname === nickname ? 'mine' : ''}`}
          >
            <span className="lb-pos">#{p.position}</span>
            <span className="lb-name">{p.nickname}</span>
            <span className="lb-score">{p.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 10.3: Add reveal + leaderboard CSS**

```css
.reveal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  width: 100%;
  max-width: 600px;
  margin-top: 20px;
}

.reveal-btn {
  padding: 20px;
  border-radius: 14px;
  font-size: 1rem;
  font-weight: bold;
  color: #fff;
  position: relative;
  opacity: 0.5;
  transition: opacity 0.3s;
}

.reveal-btn.correct { opacity: 1; box-shadow: 0 0 0 4px #fff; }
.reveal-btn.my-pick.wrong { opacity: 0.75; outline: 4px solid rgba(255,255,255,0.5); }

.tick {
  position: absolute;
  top: 8px; right: 12px;
  font-size: 1.4rem;
}

.my-result {
  margin-top: 24px;
  font-size: 1.5rem;
  font-weight: bold;
  text-align: center;
}

.correct-msg { color: #69f0ae; }
.wrong-msg { color: #ff5252; }
.timeout-msg { color: #bbb; }

/* Leaderboard */
.lb-list {
  width: 100%;
  max-width: 500px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.lb-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(255,255,255,0.08);
  border-radius: 10px;
  font-size: 1.1rem;
}

.lb-row.mine {
  background: rgba(255,255,255,0.22);
  border: 2px solid rgba(255,255,255,0.5);
  font-weight: bold;
}

.lb-pos { width: 32px; opacity: 0.7; }
.lb-name { flex: 1; }
.lb-score { font-weight: bold; }
```

- [ ] **Step 10.4: Run dev server and manually verify all PlayerView states**

```bash
cd /Users/einhorn/quiz-room-local && npm start &
cd frontend && npm run dev
```

Walk through all states in browser at `http://localhost:3000/#/`.

- [ ] **Step 10.5: Commit**

```bash
git add frontend/src/components/PlayerView.jsx frontend/src/components/PlayerView.css
git commit -m "feat: PlayerView — answer reveal with time-out indicator and leaderboard with own row highlighted"
```

---

## Chunk 5: ProjectorView Redesign (Central Stand)

### Task 11: Read current ProjectorView before changes

- [ ] **Step 11.1: Read ProjectorView.jsx and ProjectorView.css fully**

Read both files. Map existing state handling. Note what events are already handled.

---

### Task 12: Redesign ProjectorView for all game phases

**Files:**
- Modify: `frontend/src/components/ProjectorView.jsx`
- Modify: `frontend/src/components/ProjectorView.css`

- [ ] **Step 12.1: Add WAITING phase — player join progress**

In the WAITING state render, show join progress:

```jsx
if (gameState === 'WAITING' || !gameState) {
  return (
    <div className="proj-screen proj-waiting">
      <div className="proj-quiz-title">{quizTitle || 'Quiz Room'}</div>
      <div className="proj-join-count">
        {playerCount > 0
          ? `${players.length} / ${playerCount} гравців готові`
          : `${players.length} гравців приєдналось`}
      </div>
      <div className="proj-player-chips">
        {players.map(p => (
          <div key={p.nickname} className="proj-chip">{p.nickname}</div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 12.2: Add CATEGORY_SELECT phase**

```jsx
if (gameState === 'CATEGORY_SELECT' && categoryData) {
  return (
    <div className="proj-screen proj-category-select">
      <div className="proj-chooser">{categoryData.chooserNickname} обирає категорію</div>
      <Timebar timeLimit={categoryData.timeLimit} timeRemaining={categoryData.timeRemaining} />
      <div className="proj-category-options">
        {categoryData.options.map(opt => (
          <div key={opt.index} className="proj-category-card">{opt.category}</div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 12.3: Add CATEGORY_CHOSEN phase**

```jsx
if (gameState === 'CATEGORY_CHOSEN') {
  return (
    <div className="proj-screen proj-category-chosen">
      <div className="proj-chosen-label">Категорія</div>
      <div className="proj-chosen-name">{chosenCategory}</div>
    </div>
  );
}
```

- [ ] **Step 12.4: Add QUESTION phase — question + answers + timebar + answer count**

```jsx
if (gameState === 'QUESTION' && currentQuestion) {
  return (
    <div className="proj-screen proj-question">
      <div className="proj-q-header">
        <span>Питання {questionIndex}/{totalQuestions}</span>
        <span className="proj-answer-count">{answeredCount}/{playerCount} відповіли</span>
      </div>
      <Timebar timeLimit={timeLimit} timeRemaining={timeRemaining} />
      <div className="proj-question-text">{currentQuestion.text}</div>
      <div className="proj-answer-grid">
        {currentQuestion.answers.map(ans => (
          <div key={ans.id} className={`proj-answer-card answer-${ans.id}`}>
            <span className="proj-answer-letter">{['A','B','C','D'][ans.id]}</span>
            <span className="proj-answer-text">{ans.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 12.5: Add ANSWER_REVEAL phase**

```jsx
if (gameState === 'ANSWER_REVEAL') {
  return (
    <div className="proj-screen proj-reveal">
      <div className="proj-reveal-label">Правильна відповідь</div>
      <div className="proj-answer-grid reveal">
        {currentQuestion?.answers.map(ans => (
          <div
            key={ans.id}
            className={`proj-answer-card answer-${ans.id}
              ${ans.id === correctAnswer ? 'proj-correct' : 'proj-wrong'}`}
          >
            <span className="proj-answer-letter">{['A','B','C','D'][ans.id]}</span>
            <span className="proj-answer-text">{ans.text}</span>
            {ans.id === correctAnswer && <span className="proj-tick">✓</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 12.6: Add LEADERBOARD phase — full list + podium top 3**

```jsx
if (gameState === 'LEADERBOARD' || gameState === 'ENDED') {
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);
  return (
    <div className="proj-screen proj-leaderboard">
      <div className="proj-podium">
        {/* Silver (2nd) left, Gold (1st) center, Bronze (3rd) right */}
        {[1, 0, 2].map(i => top3[i] && (
          <div key={top3[i].nickname} className={`proj-podium-slot pos-${i + 1}`}>
            <div className="proj-podium-name">{top3[i].nickname}</div>
            <div className="proj-podium-score">{top3[i].score}</div>
            <div className="proj-podium-block">{['🥇','🥈','🥉'][i]}</div>
          </div>
        ))}
      </div>
      <div className="proj-lb-rest">
        {rest.map(p => (
          <div key={p.nickname} className="proj-lb-row">
            <span className="proj-lb-pos">#{p.position}</span>
            <span className="proj-lb-name">{p.nickname}</span>
            <span className="proj-lb-score">{p.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 12.7: Add ProjectorView CSS**

Create a comprehensive `ProjectorView.css` covering all projector states. Key rules:

```css
/* Base projector screen — large display optimized */
.proj-screen {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  font-size: 1.4rem;
  background: #1a1a2e;
  color: #fff;
}

.proj-question-text {
  font-size: 2.4rem;
  font-weight: bold;
  text-align: center;
  margin: 24px 0;
  max-width: 900px;
  line-height: 1.3;
}

.proj-answer-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  width: 100%;
  max-width: 900px;
}

.proj-answer-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px 28px;
  border-radius: 16px;
  font-size: 1.4rem;
  font-weight: bold;
  color: #fff;
  position: relative;
}

.proj-answer-card.answer-0 { background: #e53935; }
.proj-answer-card.answer-1 { background: #1e88e5; }
.proj-answer-card.answer-2 { background: #43a047; }
.proj-answer-card.answer-3 { background: #fb8c00; }

.proj-answer-letter {
  font-size: 1.8rem;
  font-weight: 900;
  opacity: 0.7;
  min-width: 32px;
}

.proj-answer-card.proj-wrong { opacity: 0.3; }
.proj-answer-card.proj-correct {
  opacity: 1;
  box-shadow: 0 0 0 5px #fff, 0 0 30px rgba(255,255,255,0.3);
}

.proj-tick {
  position: absolute;
  right: 20px;
  font-size: 2rem;
}

/* Q header row */
.proj-q-header {
  display: flex;
  justify-content: space-between;
  width: 100%;
  max-width: 900px;
  font-size: 1.2rem;
  opacity: 0.8;
  margin-bottom: 8px;
}

.proj-answer-count { font-weight: bold; }

/* Podium */
.proj-podium {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 20px;
  margin-bottom: 32px;
}

.proj-podium-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.proj-podium-slot.pos-1 .proj-podium-block {
  height: 140px;
  background: linear-gradient(180deg, #ffd700, #b8860b);
}
.proj-podium-slot.pos-2 .proj-podium-block {
  height: 100px;
  background: linear-gradient(180deg, #c0c0c0, #808080);
}
.proj-podium-slot.pos-3 .proj-podium-block {
  height: 70px;
  background: linear-gradient(180deg, #cd7f32, #8b4513);
}

.proj-podium-block {
  width: 120px;
  border-radius: 8px 8px 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
}

.proj-podium-name {
  font-size: 1.3rem;
  font-weight: bold;
  text-align: center;
}

.proj-podium-score {
  font-size: 1.1rem;
  opacity: 0.8;
}

/* Rest of leaderboard */
.proj-lb-rest {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 600px;
}

.proj-lb-row {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  background: rgba(255,255,255,0.08);
  border-radius: 8px;
  font-size: 1.2rem;
}

.proj-lb-pos { width: 40px; opacity: 0.6; }
.proj-lb-name { flex: 1; }
.proj-lb-score { font-weight: bold; }

/* Category select */
.proj-chooser {
  font-size: 1.6rem;
  font-weight: bold;
  margin-bottom: 16px;
  text-align: center;
}

.proj-category-options {
  display: flex;
  gap: 32px;
  margin-top: 24px;
}

.proj-category-card {
  padding: 32px 56px;
  font-size: 1.8rem;
  font-weight: bold;
  background: rgba(255,255,255,0.12);
  border-radius: 20px;
  border: 3px solid rgba(255,255,255,0.3);
}

/* Category chosen */
.proj-chosen-label {
  font-size: 1.2rem;
  opacity: 0.6;
  text-transform: uppercase;
  letter-spacing: 3px;
  margin-bottom: 16px;
}

.proj-chosen-name {
  font-size: 4rem;
  font-weight: bold;
  text-align: center;
  padding: 32px 64px;
  background: rgba(255,255,255,0.12);
  border-radius: 24px;
}

/* Waiting */
.proj-join-count {
  font-size: 2rem;
  margin: 24px 0;
  font-weight: bold;
}

.proj-player-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  max-width: 800px;
}

.proj-chip {
  padding: 10px 20px;
  background: rgba(255,255,255,0.15);
  border-radius: 24px;
  font-size: 1.1rem;
}
```

- [ ] **Step 12.8: Wire up all state variables and event handlers in ProjectorView**

Ensure all new state variables are declared: `categoryData`, `chosenCategory`, `answeredCount`, `playerCount`, `correctAnswer`, `questionIndex`, `totalQuestions`, `timeLimit`, `timeRemaining`, `leaderboard`, `players`.

Add a `quiz-update` socket event handler with explicit mappings for all event types. Use this exact mapping to avoid state name ambiguity:

```jsx
socket.on('quiz-update', (msg) => {
  switch (msg.type) {
    case 'PLAYER_JOINED':
    case 'PLAYER_LEFT':
      setPlayers(msg.players);
      break;
    case 'QUIZ_STARTING':
      setGameState('STARTING');
      setQuizTitle(msg.quizTitle);
      break;
    case 'CATEGORY_SELECT':
      setGameState('CATEGORY_SELECT');
      setCategoryData({ chooserNickname: msg.chooserNickname, options: msg.options, timeLimit: msg.timeLimit, timeRemaining: msg.timeLimit });
      break;
    case 'CATEGORY_CHOSEN':
      setGameState('CATEGORY_CHOSEN');
      setChosenCategory(msg.category);
      break;
    case 'NEW_QUESTION':
      setGameState('QUESTION');
      setCurrentQuestion(msg.question);
      setQuestionIndex(msg.questionIndex);
      setTotalQuestions(msg.totalQuestions);
      setTimeLimit(msg.timeLimit);
      setTimeRemaining(msg.timeLimit);
      setAnsweredCount(0);
      break;
    case 'ANSWER_COUNT':
      setAnsweredCount(msg.answered);
      break;
    case 'REVEAL_ANSWER':
      setGameState('ANSWER_REVEAL');
      setCorrectAnswer(msg.correctAnswer);
      break;
    case 'SHOW_LEADERBOARD':          // ← server sends SHOW_LEADERBOARD, not LEADERBOARD
      setGameState('LEADERBOARD');    // ← local state uses LEADERBOARD for render guard
      setLeaderboard(msg.leaderboard);
      break;
    case 'QUIZ_ENDED':
      setGameState('ENDED');
      setLeaderboard(msg.finalLeaderboard);
      break;
  }
});
```

- [ ] **Step 12.9: Manual test — open ProjectorView and walk through a game**

Open `http://localhost:3000/#/screen`. Run a test game from HostView. Verify all phases display correctly on the projector view.

- [ ] **Step 12.10: Commit**

```bash
git add frontend/src/components/ProjectorView.jsx frontend/src/components/ProjectorView.css
git commit -m "feat: ProjectorView redesign — all game phases for central stand display"
```

---

## Chunk 6: SideMonitor Component

### Task 13: Create SideMonitor component (nickname display)

**Architecture note:** SideMonitor runs in a separate Chromium process on display `:1`. Two separate Chromium processes on different X displays do NOT share `localStorage` or `storage` events. Therefore SideMonitor polls a new backend endpoint `/api/podium/status` every 2 seconds to get the current player's nickname and game phase. The server resolves the requesting IP against the `podiumRegistry` built in Task 4.

**Files:**
- Modify: `backend/src/server.js` — add `GET /api/podium/status` endpoint
- Create: `frontend/src/components/SideMonitor.jsx`
- Create: `frontend/src/components/SideMonitor.css`
- Modify: `frontend/src/main.jsx`

- [ ] **Step 13.1: Add `/api/podium/status` endpoint to server.js**

In `backend/src/server.js`, add a new GET endpoint that returns the nickname and game phase for the requesting IP:

```js
// GET /api/podium/status — повертає нікнейм і фазу гри для IP цього подіуму
// Використовується SideMonitor (окремий процес Chromium на HDMI-2)
app.get('/api/podium/status', (req, res) => {
  const ip = req.ip.replace('::ffff:', '');
  const roomCode = manager.getCurrentRoom();

  if (!roomCode) {
    return res.json({ nickname: null, phase: 'WAITING' });
  }

  const session = manager.getSession(roomCode);
  if (!session) {
    return res.json({ nickname: null, phase: 'WAITING' });
  }

  // Знаходимо socket гравця за IP через podiumRegistry
  const playerSocketId = podiumRegistry.get(ip);
  if (!playerSocketId) {
    return res.json({ nickname: null, phase: session.gameState });
  }

  const player = session.players.get(playerSocketId);
  res.json({
    nickname: player ? player.nickname : null,
    phase: session.gameState,
  });
});
```

Note: `podiumRegistry` must be exported or accessible from `server.js`. If it lives in `websocket-handler-auto.js`, expose it via the handler module's exports or move it to a shared module.

- [ ] **Step 13.2: Write test for `/api/podium/status`**

In `backend/tests/server.test.js`, add:

```js
it('GET /api/podium/status returns null nickname when no active room', async () => {
  const res = await request(app).get('/api/podium/status');
  expect(res.status).toBe(200);
  expect(res.body.nickname).toBeNull();
  expect(res.body.phase).toBe('WAITING');
});
```

- [ ] **Step 13.3: Create SideMonitor.jsx**

SideMonitor polls `/api/podium/status` every 2 seconds. No Socket.IO connection needed.

```jsx
// SideMonitor.jsx — бічний монітор подіуму
// Відображає нікнейм гравця для інших учасників
// Запускається на HDMI-2 того ж Raspberry Pi (окремий процес Chromium)
// Комунікація: HTTP polling /api/podium/status (localStorage між процесами не працює)

import { useEffect, useState } from 'react';
import './SideMonitor.css';

const POLL_INTERVAL = 2000;

export default function SideMonitor() {
  const [nickname, setNickname] = useState('');
  const [phase, setPhase] = useState('');

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/podium/status');
        const data = await res.json();
        if (data.nickname) setNickname(data.nickname);
        setPhase(data.phase || '');
      } catch {
        // Сервер недоступний — продовжуємо показувати останній стан
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const phaseLabel = {
    'QUESTION': '🎯',
    'ANSWER_REVEAL': '✓',
    'LEADERBOARD': '🏆',
    'CATEGORY_SELECT': '📂',
    'ENDED': '🏁',
  }[phase] || '';

  return (
    <div className="side-monitor">
      <div className="side-phase-icon">{phaseLabel}</div>
      <div className="side-nickname">{nickname || '...'}</div>
    </div>
  );
}
```

- [ ] **Step 13.4: Create SideMonitor.css**

```css
/* SideMonitor.css — мінімальний дизайн для бічного екрану */

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: #0d0d1a;
  overflow: hidden;
}

.side-monitor {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0d0d1a 0%, #1a1a3e 100%);
  color: #fff;
}

.side-nickname {
  font-size: clamp(3rem, 12vw, 8rem);
  font-weight: 900;
  text-align: center;
  letter-spacing: -1px;
  padding: 0 20px;
  word-break: break-word;
}

.side-phase-icon {
  font-size: 3rem;
  margin-bottom: 16px;
  min-height: 48px;
}
```

- [ ] **Step 13.5: Add #/side route to main.jsx**

In `frontend/src/main.jsx`, add:

```jsx
import SideMonitor from './components/SideMonitor';
```

In the router switch/hash logic, add:
```jsx
case 'side':
  return <SideMonitor />;
```

- [ ] **Step 13.6: Manual test**

Start backend and frontend:
```bash
cd /Users/einhorn/quiz-room-local && npm start &
cd frontend && npm run dev
```

Open two browser windows:
- `http://localhost:3000/#/` — enter nickname "TestPlayer" and join
- `http://localhost:3000/#/side` — within 2 seconds should show "TestPlayer" large

Verify `GET http://localhost:8080/api/podium/status` from loopback returns `{ nickname: "TestPlayer", phase: "WAITING" }`.

- [ ] **Step 13.7: Commit**

```bash
git add backend/src/server.js backend/tests/server.test.js frontend/src/components/SideMonitor.jsx frontend/src/components/SideMonitor.css frontend/src/main.jsx
git commit -m "feat: SideMonitor — HTTP polling /api/podium/status for cross-process nickname display"
```

---

## Chunk 7: Raspberry Pi Kiosk Setup

### Task 14: Pi kiosk scripts and GPIO service

**Files:**
- Create: `pi-setup/gpio-service.py`
- Create: `pi-setup/kiosk.sh`
- Create: `pi-setup/install.sh`
- Create: `pi-setup/README.md`

No automated tests — these are system scripts. Verified on physical hardware.

- [ ] **Step 14.1: Create pi-setup directory**

```bash
mkdir -p /Users/einhorn/quiz-room-local/pi-setup
```

- [ ] **Step 14.2: Create gpio-service.py**

```python
#!/usr/bin/env python3
"""
gpio-service.py — GPIO кнопки → Socket.IO сервер квізу

Підключається до сервера квізу через Socket.IO.
Читає стан GPIO пінів (4 кнопки відповідей A/B/C/D).
При натисканні — надсилає подію podium-button-press на сервер.
Сервер визначає гравця за IP адресою і зараховує відповідь.

Запуск: python3 gpio-service.py
"""

import time
import logging
import socketio
import RPi.GPIO as GPIO

# ─── Конфігурація ───────────────────────────────────────────
SERVER_URL = 'http://localhost:8080'

# GPIO піни для кнопок A/B/C/D (BCM нумерація)
BUTTON_PINS = {
    0: 17,  # Кнопка A (червона)
    1: 27,  # Кнопка B (синя)
    2: 22,  # Кнопка C (зелена)
    3: 23,  # Кнопка D (помаранчева)
}

DEBOUNCE_MS = 300  # мінімальний інтервал між натисканнями (мс)
# ────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [GPIO] %(message)s'
)
log = logging.getLogger(__name__)

# Час останнього натискання для debounce
last_press = {i: 0 for i in BUTTON_PINS}

# Socket.IO клієнт
sio = socketio.Client(reconnection=True, reconnection_delay=2, reconnection_delay_max=30)


@sio.event
def connect():
    log.info('Підключено до сервера квізу')


@sio.event
def disconnect():
    log.info('Відключено від сервера. Спроба перепідключення...')


def make_button_callback(button_index):
    """Повертає callback для конкретної кнопки з debounce захистом"""
    def callback(channel):
        now = time.time() * 1000  # мс
        if now - last_press[button_index] < DEBOUNCE_MS:
            return  # ігноруємо відскок кнопки
        last_press[button_index] = now

        log.info(f'Кнопка {button_index} натиснута (GPIO {channel})')

        if sio.connected:
            sio.emit('podium-button-press', {'buttonIndex': button_index})
        else:
            log.warning('Сервер недоступний — натискання ігнорується')

    return callback


def setup_gpio():
    """Налаштовує GPIO піни з внутрішніми pull-up резисторами"""
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)

    for button_index, pin in BUTTON_PINS.items():
        GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        GPIO.add_event_detect(
            pin,
            GPIO.FALLING,  # натискання = LOW (кнопка підключена до GND)
            callback=make_button_callback(button_index),
            bouncetime=DEBOUNCE_MS
        )
        log.info(f'Кнопка {button_index} → GPIO{pin} готова')


def main():
    setup_gpio()

    log.info(f'Підключення до {SERVER_URL}...')
    try:
        sio.connect(SERVER_URL, transports=['websocket'])
        sio.wait()  # блокуємо основний потік, GPIO callbacks в окремих потоках
    except KeyboardInterrupt:
        log.info('Зупинка GPIO сервісу')
    finally:
        GPIO.cleanup()
        if sio.connected:
            sio.disconnect()


if __name__ == '__main__':
    main()
```

- [ ] **Step 14.3: Create kiosk.sh**

Note: On the Pi, the frontend is served as a static build by the Express backend on port 8080 (via `npm start` which calls `node backend/src/server.js`). The Vite dev server is NOT used in production. The Pi startup sequence is: `npm start` (backend serves built frontend) → `kiosk.sh` opens Chromium on port 8080.

Run `cd /home/pi/quiz-room-local/frontend && npm run build` once during `install.sh` to create the production build.

```bash
#!/bin/bash
# kiosk.sh — запускає Chromium у режимі кіоску на двох дисплеях
#
# Дисплей 1 (HDMI-1): PlayerView — інтерфейс гравця
# Дисплей 2 (HDMI-2): SideMonitor — нікнейм гравця
#
# Запускається автоматично при вході в систему через autostart
# Сервер квізу: port 8080 (Express статика + WebSocket)

QUIZ_SERVER="http://localhost:8080"
CHROMIUM_FLAGS="--noerrdialogs --disable-infobars --no-first-run \
  --disable-translate --disable-features=TranslateUI \
  --disable-pinch --overscroll-history-navigation=0 \
  --disable-session-crashed-bubble --disable-restore-session-state"

# Чекаємо доки сервер запуститься
until curl -s "$QUIZ_SERVER" > /dev/null 2>&1; do
  echo "Очікуємо сервер квізу..."
  sleep 2
done

# Запускаємо PlayerView на HDMI-1 (основний дисплей :0)
DISPLAY=:0 chromium-browser \
  --kiosk \
  $CHROMIUM_FLAGS \
  "$QUIZ_SERVER/#/" &

# Чекаємо 2 секунди перед запуском другого вікна
sleep 2

# Запускаємо SideMonitor на HDMI-2 (другий дисплей :1)
# Примітка: потребує налаштованого Xorg dual-head або окремого X сервера
DISPLAY=:1 chromium-browser \
  --kiosk \
  $CHROMIUM_FLAGS \
  "$QUIZ_SERVER/#/side" &

# Запускаємо GPIO сервіс
python3 /home/pi/quiz-room-local/pi-setup/gpio-service.py &

# Чекаємо завершення всіх процесів (нескінченно — кіоск режим)
wait
```

- [ ] **Step 14.4: Create install.sh**

```bash
#!/bin/bash
# install.sh — одноразове налаштування Raspberry Pi для кіоску
# Запускати від імені pi користувача: bash install.sh

set -e
echo "=== Quiz Room Local — Налаштування кіоску ==="

# Оновлення системи
sudo apt-get update -q
sudo apt-get upgrade -y -q

# Встановлення залежностей
sudo apt-get install -y -q \
  chromium-browser \
  python3-pip \
  unclutter \
  xdotool

# Встановлення Python залежностей для GPIO сервісу
pip3 install python-socketio[client] websocket-client RPi.GPIO

# Вимкнення screensaver та power management
sudo raspi-config nonint do_blanking 1

# Налаштування автозапуску
mkdir -p /home/pi/.config/autostart
cat > /home/pi/.config/autostart/quiz-kiosk.desktop << 'EOF'
[Desktop Entry]
Type=Application
Name=Quiz Kiosk
Exec=/home/pi/quiz-room-local/pi-setup/kiosk.sh
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
EOF

# Налаштування автовходу (без пароля)
sudo raspi-config nonint do_boot_behaviour B4

# Налаштування hostname (унікальний для кожного подіуму)
read -p "Введіть номер подіуму (1-8): " PODIUM_NUM
sudo hostnamectl set-hostname "podium-${PODIUM_NUM}"

echo "=== Встановлення завершено ==="
echo "Перезавантажте Pi: sudo reboot"
```

- [ ] **Step 14.5: Create pi-setup/README.md**

```markdown
# Pi Kiosk Setup Guide

## Hardware per Podium
- Raspberry Pi 5 (4GB)
- HDMI-1: touchscreen (player UI)
- HDMI-2: small side monitor (nickname display)
- 4 GPIO buttons wired to pins 17, 27, 22, 23 (BCM) and GND

## Button Wiring

| Button | Color  | Answer | GPIO Pin | Wire to |
|--------|--------|--------|----------|---------|
| A      | Red    | 0      | GPIO17   | GND     |
| B      | Blue   | 1      | GPIO27   | GND     |
| C      | Green  | 2      | GPIO22   | GND     |
| D      | Orange | 3      | GPIO23   | GND     |

All buttons use internal pull-up resistors (PUD_UP). Connect one leg to the GPIO pin, other leg to any GND pin. No external resistors needed.

## One-Time Setup

```bash
# 1. Flash Raspberry Pi OS (64-bit, Desktop) to SD card / USB SSD
# 2. Enable SSH and set WiFi/ethernet
# 3. SSH in and clone the repo
git clone https://github.com/EduardIng/quiz-room-local.git /home/pi/quiz-room-local

# 4. Run install script
cd /home/pi/quiz-room-local/pi-setup
bash install.sh

# 5. Reboot
sudo reboot
```

## After Setup

Pi boots → auto-login → kiosk.sh runs → Chromium opens on both displays → GPIO service starts.

If the quiz server is on a different machine, update `SERVER_URL` in `gpio-service.py` and `QUIZ_SERVER` in `kiosk.sh` to the server's LAN IP.

## Imaging for Multiple Podiums

After setting up one Pi perfectly:
```bash
# On your Mac — create image from SD card
sudo dd if=/dev/diskN of=podium-base.img bs=4m status=progress

# Flash to each additional Pi
sudo dd if=podium-base.img of=/dev/diskN bs=4m status=progress
```

Then SSH to each Pi and run: `sudo hostnamectl set-hostname podium-N`

## Troubleshooting

**Chromium doesn't open:** Check `~/.config/autostart/quiz-kiosk.desktop`
**GPIO buttons don't work:** Run `python3 gpio-service.py` manually, check wiring
**Side monitor blank:** Check HDMI-2 connection and `:1` display config
**Can't reach quiz server:** Confirm server runs on port 8080 and Pi is on same LAN
```

- [ ] **Step 14.6: Commit all pi-setup files**

```bash
git add pi-setup/
git commit -m "feat: Raspberry Pi kiosk setup — GPIO service, dual-display boot, install scripts"
```

---

## Chunk 8: Integration + Final Wiring

### Task 15: Add .gitignore entry for superpowers brainstorm files

- [ ] **Step 15.1: Add .superpowers to .gitignore**

```bash
echo ".superpowers/" >> /Users/einhorn/quiz-room-local/.gitignore
git add .gitignore
git commit -m "chore: ignore .superpowers brainstorm files"
```

### Task 16: Run full test suite and verify 176+ tests pass

- [ ] **Step 16.1: Run all tests**

```bash
cd /Users/einhorn/quiz-room-local
npm test 2>&1 | tail -20
```

Expected: all tests pass (176 existing + new tests from Tasks 1–4)

### Task 17: Update PROGRESS.md

- [ ] **Step 17.1: Add Phase 7 entry to PROGRESS.md**

Document: what was built, key decisions made, test counts, commit hash.

- [ ] **Step 17.2: Final commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — Phase 7 podium hardware integration complete"
git tag -a phase-7-complete -m "Phase 7: Podium hardware integration complete"
git push origin main --tags
```

---

## Execution Order & Dependencies

```
Chunk 1 (Backend)     → no dependencies, start here
Chunk 2 (Timebar)     → no dependencies, can run in parallel with Chunk 1
Chunk 3 (HostView)    → depends on Chunk 1 (playerCount in backend)
Chunk 4 (PlayerView)  → depends on Chunk 2 (Timebar), Chunk 1 (backend events)
Chunk 5 (Projector)   → depends on Chunk 2 (Timebar), Chunk 1 (backend events)
Chunk 6 (SideMonitor) → depends on Chunk 4 (PlayerView sets localStorage)
Chunk 7 (Pi setup)    → depends on Chunk 1 (podium-button-press event exists)
Chunk 8 (Integration) → depends on all chunks
```
