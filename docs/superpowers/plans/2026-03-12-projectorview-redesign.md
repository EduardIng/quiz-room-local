# ProjectorView Redesign — All Game Phases for Central Stand Display

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign ProjectorView game-phase renders to use new `proj-*` CSS classes, add Timebar integration, podium leaderboard, and all required Ukrainian-commented renders — without touching room discovery or reconnect logic.

**Architecture:** The existing component already has a correct socket handler (`handleUpdate`) and room discovery (polling + watch-room). We only replace the JSX renders for the `watching` phase and extend the CSS. A `playerCount` state variable is added to track expected player count from `PLAYER_JOINED`/`PLAYER_LEFT`. Timebar is imported from `./Timebar.jsx`.

**Tech Stack:** React 18, Socket.IO client, Vite, CSS modules (flat class names)

---

## Chunk 1: State additions + Timebar import + socket handler wire-up

### Task 1: Add `playerCount` state and Timebar import

**Files:**
- Modify: `frontend/src/components/ProjectorView.jsx`

- [ ] **Step 1: Add Timebar import after the existing CSS import**

In `ProjectorView.jsx`, after line 24 (`import './ProjectorView.css';`), add:

```jsx
import Timebar from './Timebar.jsx';
```

- [ ] **Step 2: Add `playerCount` state variable**

After the `totalPlayers` state declaration (line 65), add:

```jsx
// Очікувана кількість гравців (з PLAYER_JOINED/PLAYER_LEFT)
const [playerCount, setPlayerCount] = useState(0);
```

- [ ] **Step 3: Wire `playerCount` in the `PLAYER_JOINED`/`PLAYER_LEFT` case**

The existing handler sets `setTotalPlayers(data.totalPlayers || 0)`. Alongside it, add:

```js
if (data.playerCount) setPlayerCount(data.playerCount);
```

- [ ] **Step 4: Wire `playerCount` in `syncState`**

In `syncState`, after `setTotalPlayers(...)`, add:

```js
setPlayerCount(gs.playerCount || gs.players?.length || 0);
```

---

## Chunk 2: Replace game-phase JSX renders

### Task 2: Replace WAITING render

**Files:**
- Modify: `frontend/src/components/ProjectorView.jsx`

- [ ] **Step 1: Replace the `gameState === 'WAITING'` block**

Replace the entire existing WAITING block (lines 431–459) with:

```jsx
{/* ── WAITING: очікування гравців (кіоск-режим, центральний стенд) ── */}
{gameState === 'WAITING' && (
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
)}
```

### Task 3: Replace CATEGORY_SELECT render

- [ ] **Step 1: Replace the `gameState === 'CATEGORY_SELECT'` block**

Replace the entire existing CATEGORY_SELECT block (lines 469–492) with:

```jsx
{/* ── CATEGORY_SELECT: вибір категорії гравцем ── */}
{gameState === 'CATEGORY_SELECT' && categoryOptions && (
  <div className="proj-screen proj-category-select">
    <div className="proj-chooser">{categoryChooser} обирає категорію</div>
    <Timebar timeLimit={categoryTimeLimit} timeRemaining={categoryTimeLeft} />
    <div className="proj-category-options">
      {categoryOptions.map((opt, i) => (
        <div key={i} className="proj-category-card">{opt.category}</div>
      ))}
    </div>
  </div>
)}
```

### Task 4: Replace CATEGORY_CHOSEN render

- [ ] **Step 1: Replace the `gameState === 'CATEGORY_CHOSEN'` block**

Replace the entire existing CATEGORY_CHOSEN block (lines 494–503) with:

```jsx
{/* ── CATEGORY_CHOSEN: показуємо обрану категорію 4 секунди ── */}
{gameState === 'CATEGORY_CHOSEN' && categoryChosen && (
  <div className="proj-screen proj-category-chosen">
    <div className="proj-chosen-label">Категорія</div>
    <div className="proj-chosen-name">{categoryChosen.category}</div>
  </div>
)}
```

### Task 5: Replace QUESTION render

- [ ] **Step 1: Replace the `gameState === 'QUESTION'` block**

Replace the entire existing QUESTION block (lines 505–562) with:

```jsx
{/* ── QUESTION: питання + відповіді + таймбар + лічильник ── */}
{gameState === 'QUESTION' && question && (
  <div className="proj-screen proj-question">
    <div className="proj-q-header">
      <span>Питання {questionIndex}/{totalQuestions}</span>
      <span className="proj-answer-count">{answeredCount}/{totalPlayers || '?'} відповіли</span>
    </div>
    <Timebar timeLimit={timeLimit} timeRemaining={timeLeft} />
    <div className="proj-question-text">{question.text}</div>
    <div className="proj-answer-grid">
      {question.answers.map(ans => (
        <div key={ans.id} className={`proj-answer-card answer-${ans.id}`}>
          <span className="proj-answer-letter">{['A', 'B', 'C', 'D'][ans.id]}</span>
          <span className="proj-answer-text">{ans.text}</span>
        </div>
      ))}
    </div>
  </div>
)}
```

### Task 6: Replace ANSWER_REVEAL render

- [ ] **Step 1: Replace the `gameState === 'ANSWER_REVEAL'` block**

Replace the entire existing ANSWER_REVEAL block (lines 564–601) with:

```jsx
{/* ── ANSWER_REVEAL: підсвічуємо правильну відповідь ── */}
{gameState === 'ANSWER_REVEAL' && question && (
  <div className="proj-screen proj-reveal">
    <div className="proj-reveal-label">Правильна відповідь</div>
    <div className="proj-answer-grid reveal">
      {question.answers.map(ans => (
        <div
          key={ans.id}
          className={`proj-answer-card answer-${ans.id}${ans.id === correctAnswer ? ' proj-correct' : ' proj-wrong'}`}
        >
          <span className="proj-answer-letter">{['A', 'B', 'C', 'D'][ans.id]}</span>
          <span className="proj-answer-text">{ans.text}</span>
          {ans.id === correctAnswer && <span className="proj-tick">✓</span>}
        </div>
      ))}
    </div>
  </div>
)}
```

### Task 7: Replace LEADERBOARD / ENDED render

- [ ] **Step 1: Replace the `gameState === 'LEADERBOARD' || gameState === 'ENDED'` block**

Replace the entire existing LEADERBOARD block (lines 603–624) with:

```jsx
{/* ── LEADERBOARD / ENDED: подіум топ-3 + решта списку ── */}
{(gameState === 'LEADERBOARD' || gameState === 'ENDED') && (
  <div className="proj-screen proj-leaderboard">
    <div className="proj-podium">
      {[1, 0, 2].map(idx => leaderboard[idx] && (
        <div key={leaderboard[idx].nickname} className={`proj-podium-slot pos-${idx + 1}`}>
          <div className="proj-podium-name">{leaderboard[idx].nickname}</div>
          <div className="proj-podium-score">{leaderboard[idx].score}</div>
          <div className="proj-podium-block">{['🥇', '🥈', '🥉'][idx]}</div>
        </div>
      ))}
    </div>
    <div className="proj-lb-rest">
      {leaderboard.slice(3).map((p, i) => (
        <div key={p.nickname} className="proj-lb-row">
          <span className="proj-lb-pos">#{p.position ?? i + 4}</span>
          <span className="proj-lb-name">{p.nickname}</span>
          <span className="proj-lb-score">{p.score}</span>
        </div>
      ))}
    </div>
  </div>
)}
```

---

## Chunk 3: CSS additions

### Task 8: Add new `proj-*` CSS classes to ProjectorView.css

**Files:**
- Modify: `frontend/src/components/ProjectorView.css`

- [ ] **Step 1: Append all new `proj-*` CSS classes at end of file**

Append the following block after the last existing rule:

```css
/* ═══════════════════════════════════════════
   PROJ-* КЛАСИ — центральний стенд (Tasks 11-12)
   Великий екран для залу: кожна фаза гри
═══════════════════════════════════════════ */

/* Базовий екран — займає весь залишок висоти */
.proj-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  font-size: 1.4rem;
  color: #fff;
}

/* ── WAITING ── */
.proj-quiz-title {
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 8px;
  color: #a78bfa;
}

.proj-join-count {
  font-size: 2rem;
  margin: 24px 0;
  font-weight: bold;
  color: #22d3ee;
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
  background: rgba(255, 255, 255, 0.15);
  border-radius: 24px;
  font-size: 1.1rem;
  color: #e2e8f0;
}

/* ── QUESTION ── */
.proj-question-text {
  font-size: 2.4rem;
  font-weight: bold;
  text-align: center;
  margin: 24px 0;
  max-width: 900px;
  line-height: 1.3;
  color: #f1f5f9;
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

/* Кольори карток відповідей (A-D) */
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

.proj-answer-card.proj-wrong {
  opacity: 0.3;
}

.proj-answer-card.proj-correct {
  opacity: 1;
  box-shadow: 0 0 0 5px #fff, 0 0 30px rgba(255, 255, 255, 0.3);
}

.proj-tick {
  position: absolute;
  right: 20px;
  font-size: 2rem;
}

/* Хедер питання: номер + лічильник відповідей */
.proj-q-header {
  display: flex;
  justify-content: space-between;
  width: 100%;
  max-width: 900px;
  font-size: 1.2rem;
  opacity: 0.8;
  margin-bottom: 8px;
}

.proj-answer-count {
  font-weight: bold;
}

/* Мітка правильної відповіді */
.proj-reveal-label {
  font-size: 1.8rem;
  font-weight: bold;
  color: #22d3ee;
  margin-bottom: 24px;
}

/* ── PODIUM (leaderboard) ── */
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

/* Подіум: золото центр, срібло ліворуч, бронза праворуч */
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

/* Решта гравців під подіумом */
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
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  font-size: 1.2rem;
}

.proj-lb-pos {
  width: 40px;
  opacity: 0.6;
}

.proj-lb-name {
  flex: 1;
}

.proj-lb-score {
  font-weight: bold;
  color: #22d3ee;
}

/* ── CATEGORY_SELECT ── */
.proj-chooser {
  font-size: 1.6rem;
  font-weight: bold;
  margin-bottom: 16px;
  text-align: center;
  color: #22d3ee;
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
  background: rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  text-align: center;
}

/* ── CATEGORY_CHOSEN ── */
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
  background: rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  color: #22d3ee;
  animation: pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

---

## Chunk 4: Build and commit

### Task 9: Build frontend and commit

**Files:** No new files — only the two modified above.

- [ ] **Step 1: Run Vite build**

```bash
cd /Users/einhorn/quiz-room-local/frontend && npm run build
```

Expected: exits 0, no errors.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ProjectorView.jsx frontend/src/components/ProjectorView.css
git commit -m "feat: ProjectorView redesign — all game phases for central stand display"
```
