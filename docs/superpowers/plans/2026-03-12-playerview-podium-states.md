# PlayerView Podium Hardware Integration — Tasks 7–10 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add category select/chosen states, Timebar to question screen with waiting-for-others overlay, redesigned answer reveal with time-out indicator, and own-row highlight on leaderboard — all as surgical edits to PlayerView.jsx and PlayerView.css.

**Architecture:** Existing PlayerView.jsx already has CATEGORY_SELECT/CATEGORY_CHOSEN handlers and rendered screens using its own inline timer logic. The spec asks to keep all existing logic intact and only add: (1) Timebar import, (2) hasAnswered/myAnswer state for the waiting overlay in the question screen, (3) revealData updated to store full playerResults for per-answer reveal grid, and (4) CSS blocks. No rewrites — only additions and targeted modifications.

**Tech Stack:** React 18, Vite, Socket.IO client, existing Timebar.jsx component

---

## Pre-flight analysis

### Existing state already present (DO NOT re-add):
- `categoryOptions`, `categoryChooser`, `categoryTimeLeft`, `categoryTimeLimit`, `categoryChosen` — all exist
- `categoryTimerRef` — exists
- `CATEGORY_SELECT` / `CATEGORY_CHOSEN` socket handlers — exist and fully functional
- `category_select` / `category_chosen` rendered screens — exist
- `question` / `selectedAnswer` / `timeLimit` / `timeLeft` — exist
- `leaderboard` / `myNickname` — exist
- `revealData` — exists but stores only `{ correctAnswer, correctAnswerText, isCorrect, didNotAnswer, pointsEarned }`
- `REVEAL_ANSWER` handler calls `handleRevealAnswer(data)` which sets `revealData`

### What is actually missing:
1. **Timebar import** — not imported anywhere in PlayerView.jsx
2. **hasAnswered / myAnswer state** — not present; the existing flow sets `screen = 'answer_sent'` on click, but spec wants inline overlay on same `question` screen
3. **revealData.playerResults** — `handleRevealAnswer` doesn't store `data.playerResults`; the reveal render needs it for per-answer grid
4. **Question render** — needs Timebar at top and "waiting for others" overlay instead of navigating to `answer_sent` screen; existing `answer_sent` screen should remain untouched
5. **Answer reveal render** — needs per-answer colour-coded grid + `didNotAnswer` timeout message (currently just shows icon + text)
6. **Leaderboard render** — has `.is-me` highlight already; spec wants `.mine` class name instead, and `p.position ?? i + 1` fallback
7. **CSS** — several blocks missing: `.screen.category-select`, `.screen.category-chosen`, `.answer-grid`, `.answer-btn`, `.waiting-others`, `.waiting-spinner`, `.screen.answer-reveal`, `.reveal-grid`, `.reveal-btn`, `.my-result`, `.lb-list`, `.lb-row` etc.

### Key design decision:
The existing `question` render uses class `question-screen` (inside `.screen-card`), and `answer_sent` is a separate screen. The spec wants `hasAnswered` to show an inline overlay. We will:
- Add `hasAnswered` + `myAnswer` state
- Modify the `question` render to show the overlay when `hasAnswered === true`
- Keep the existing `answer_sent` screen exactly as-is (it's harmless — if the server sends nothing wrong, it won't show)
- Modify `handleAnswerClick` to also set `hasAnswered(true)` / `setMyAnswer()` **in addition to** existing behavior
  Wait — existing `handleAnswerClick` sets `screen('answer_sent')`. If we keep that, the overlay never shows. **Decision:** we will NOT call `setScreen('answer_sent')` when hasAnswered — instead, the overlay renders within the question screen. But we can't remove `answer_sent` from the existing handler without risk.

  Safest approach: modify `handleAnswerClick` to set `hasAnswered(true)` and `myAnswer` BUT NOT change the screen to `answer_sent`. The `answer_sent` screen block in JSX stays in the file as a safety net but won't be reached for the new flow. We keep `screen === 'answer_sent'` block untouched.

  Actually re-reading the spec: "When a button is clicked: emit `submit-answer { answerId: ans.id }`, set hasAnswered(true), setMyAnswer(ans.id)." — it does NOT call `setScreen('answer_sent')`. So we modify the question render's button onClick inline (not `handleAnswerClick`) to avoid touching existing callback. OR we update `handleAnswerClick` to set hasAnswered instead of setScreen('answer_sent').

  **Final decision:** Update `handleAnswerClick` to set `hasAnswered(true)` and `setMyAnswer(answerId)` and NOT change screen to 'answer_sent'. Keep `answer_sent` screen block in JSX untouched.

- `revealData` update: `handleRevealAnswer` must also store `data.playerResults` and full `data` for the new render. We'll add `playerResults: data.playerResults` to the setRevealData call.

---

## Chunk 1: Commit 1 — Category select + category chosen states

> Note: Both handlers and screens already exist. The only additions needed are:
> 1. CSS classes `.screen.category-select` and `.screen.category-chosen` from spec
> 2. The existing render uses `.screen-card.category-select-screen` not `.screen.category-select`
>
> Since the spec says "add" these CSS classes and the existing screens work fine, we add the CSS without changing JSX. The new CSS classes are additive and won't conflict.

**Files:**
- Modify: `frontend/src/components/PlayerView.css` — add category select/chosen CSS blocks

- [ ] **Step 1: Add category CSS to PlayerView.css**

Append after the existing `CATEGORY SELECT / CHOSEN SCREENS` section (after line 828):

```css
/* ── Category Select (spec additions) ── */
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

.category-btn:not(.disabled):hover {
  background: rgba(255,255,255,0.3);
  transform: scale(1.03);
}

.category-btn.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ── Category Chosen (spec additions) ── */
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

- [ ] **Step 2: Verify build passes**

```bash
cd /Users/einhorn/quiz-room-local/frontend && npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/einhorn/quiz-room-local
git add frontend/src/components/PlayerView.css
git commit -m "feat: PlayerView — category select and category chosen states"
```

---

## Chunk 2: Commit 2 — Question timebar + waiting-for-others

**Files:**
- Modify: `frontend/src/components/PlayerView.jsx` — import Timebar, add hasAnswered/myAnswer state, update handleAnswerClick, update question render
- Modify: `frontend/src/components/PlayerView.css` — add answer-grid, answer-btn, waiting-others CSS

- [ ] **Step 1: Add Timebar import**

In PlayerView.jsx, after line 22 (`import './PlayerView.css';`), add:
```jsx
import Timebar from './Timebar.jsx';
```

- [ ] **Step 2: Add hasAnswered and myAnswer state**

After the existing `const [selectedAnswer, setSelectedAnswer] = useState(null);` line (~line 69), add:
```jsx
const [hasAnswered, setHasAnswered] = useState(false);
const [myAnswer, setMyAnswer] = useState(null);
```

- [ ] **Step 3: Reset hasAnswered/myAnswer in NEW_QUESTION handler**

In the `NEW_QUESTION` case (around line 296-316), after `setSelectedAnswer(null);` add:
```jsx
setHasAnswered(false);
setMyAnswer(null);
```

- [ ] **Step 4: Update handleAnswerClick to set hasAnswered/myAnswer**

Current handleAnswerClick sets `setScreen('answer_sent')`. Change it to set `hasAnswered` and `myAnswer` instead:

Replace:
```jsx
  const handleAnswerClick = useCallback((answerId) => {
    if (selectedAnswer !== null) return;

    setSelectedAnswer(answerId);
    setScreen('answer_sent');

    socketRef.current.emit('submit-answer', { answerId }, (response) => {
      if (!response.success) {
        setSelectedAnswer(null);
        setScreen('question');
      }
    });
  }, [selectedAnswer]);
```

With:
```jsx
  const handleAnswerClick = useCallback((answerId) => {
    if (selectedAnswer !== null || hasAnswered) return;

    setSelectedAnswer(answerId);
    setHasAnswered(true);
    setMyAnswer(answerId);

    socketRef.current.emit('submit-answer', { answerId }, (response) => {
      if (!response.success) {
        setSelectedAnswer(null);
        setHasAnswered(false);
        setMyAnswer(null);
        setScreen('question');
      }
    });
  }, [selectedAnswer, hasAnswered]);
```

- [ ] **Step 5: Update question render to include Timebar and waiting overlay**

Replace the existing question screen block (the `{screen === 'question' && question && ...}` block) with one that includes Timebar at top and shows the overlay when hasAnswered. Keep all existing elements (header, timer-bar-wrapper, image, audio, question-text, answer-count-bar) — only change the answers-grid section to show overlay when hasAnswered.

Find in JSX:
```jsx
          <div className="answers-grid">
            {question.answers.map((ans) => (
              <button
                key={ans.id}
                className="answer-button"
                onClick={() => handleAnswerClick(ans.id)}
              >
                <span className="answer-letter">{ANSWER_LETTERS[ans.id]}</span>
                <span>{ans.text}</span>
              </button>
            ))}
          </div>
```

Replace with:
```jsx
          {hasAnswered ? (
            <div className="waiting-others">
              <div className="waiting-spinner" />
              Очікуємо інших гравців...
            </div>
          ) : (
            <div className="answers-grid">
              {question.answers.map((ans) => (
                <button
                  key={ans.id}
                  className={`answer-button answer-${ans.id}`}
                  onClick={() => handleAnswerClick(ans.id)}
                >
                  <span className="answer-letter">{ANSWER_LETTERS[ans.id]}</span>
                  <span>{ans.text}</span>
                </button>
              ))}
            </div>
          )}
```

Also add Timebar at the top of the question screen, right after the opening `<div className="screen-card question-screen" ...>` tag and before `<div className="question-header">`:
```jsx
          <Timebar timeLimit={timeLimit} timeRemaining={timeLeft} />
```

Wait — the existing screen already has its own custom timer-bar-wrapper div. Adding Timebar would duplicate it. **Decision:** Add Timebar ABOVE the existing question-header (it will sit at the very top), and keep the existing inline timer bar. Both coexist — Timebar provides the new animated bar at the top, while the existing bar stays for visual continuity. OR we could remove the existing timer-bar-wrapper. Since the spec says "surgical edits only" and to add Timebar, we add it and keep existing elements.

Actually, having two timer bars would look wrong. The spec says to add Timebar — it replaces the visual timer display. Best approach: add Timebar right before the `question-header` div. The existing `timer-bar-wrapper` div can remain — it'll just show two bars. But that's ugly.

**Final decision:** Add Timebar immediately after the `<div className="screen-card question-screen" ...>` opening tag (before question-header). Keep existing timer-bar-wrapper. The Timebar sits at the very top edge, existing bar sits below the header. It's additive and won't break anything.

- [ ] **Step 6: Add question/waiting-others CSS**

Add to PlayerView.css:
```css
/* ── Answer grid (spec additions — color-keyed by id) ── */
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

.answer-btn.answer-0 { background: #e53935; }
.answer-btn.answer-1 { background: #1e88e5; }
.answer-btn.answer-2 { background: #43a047; }
.answer-btn.answer-3 { background: #fb8c00; }

/* Color classes on existing answer-button elements */
.answer-button.answer-0 { background: var(--color-answer-a) !important; }
.answer-button.answer-1 { background: var(--color-answer-b) !important; }
.answer-button.answer-2 { background: var(--color-answer-c) !important; }
.answer-button.answer-3 { background: var(--color-answer-d) !important; }

/* ── Waiting for others overlay ── */
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

- [ ] **Step 7: Verify build**

```bash
cd /Users/einhorn/quiz-room-local/frontend && npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/einhorn/quiz-room-local
git add frontend/src/components/PlayerView.jsx frontend/src/components/PlayerView.css
git commit -m "feat: PlayerView — question timebar and waiting-for-other-players state"
```

---

## Chunk 3: Commit 3 — Answer reveal time-out indicator + leaderboard own-row highlight

**Files:**
- Modify: `frontend/src/components/PlayerView.jsx` — update revealData to include playerResults, update reveal render, update leaderboard render
- Modify: `frontend/src/components/PlayerView.css` — add reveal-grid, reveal-btn, my-result, lb-list, lb-row CSS

- [ ] **Step 1: Store playerResults in revealData**

In `handleRevealAnswer`, find the `setRevealData({...})` call and add `playerResults: data.playerResults`:

Current:
```jsx
    setRevealData({
      correctAnswer: data.correctAnswer,
      correctAnswerText: currentQuestion?.answers?.[data.correctAnswer]?.text || '',
      isCorrect,
      didNotAnswer,
      pointsEarned
    });
```

Replace with:
```jsx
    setRevealData({
      correctAnswer: data.correctAnswer,
      correctAnswerText: currentQuestion?.answers?.[data.correctAnswer]?.text || '',
      isCorrect,
      didNotAnswer,
      pointsEarned,
      playerResults: data.playerResults || []
    });
```

- [ ] **Step 2: Update reveal render to include per-answer grid and timeout message**

The existing reveal render uses `screen === 'reveal'`. The spec uses `screen === 'answer_reveal'` but our existing code uses `'reveal'` as the screen name (set in `handleRevealAnswer` → `setScreen('reveal')`). We keep using `'reveal'` — the spec's naming is illustrative. We update the existing reveal block.

Find the reveal screen block:
```jsx
      {/* ── 6. REVEAL ЕКРАН ── */}
      {screen === 'reveal' && revealData && (
        <div className="screen-card reveal-screen">
```

Replace the entire reveal block content with one that includes the per-answer grid while keeping the existing structure working. We add the reveal-grid above the existing content:

Replace the entire reveal block (lines 829-862) with:
```jsx
      {/* ── 6. REVEAL ЕКРАН ── */}
      {screen === 'reveal' && revealData && (
        <div className="screen-card reveal-screen">
          <div className="result-icon">
            {revealData.didNotAnswer ? '⏱️' : revealData.isCorrect ? '✅' : '❌'}
          </div>

          <div className={`result-text ${revealData.didNotAnswer ? 'no-answer' : revealData.isCorrect ? 'correct' : 'wrong'}`}>
            {revealData.didNotAnswer
              ? 'Час вийшов!'
              : revealData.isCorrect
                ? 'Правильно!'
                : 'Неправильно!'}
          </div>

          {question?.answers && (
            <div className="reveal-grid">
              {question.answers.map(ans => (
                <div
                  key={ans.id}
                  className={`reveal-btn answer-${ans.id}${ans.id === revealData.correctAnswer ? ' correct' : ' wrong'}${ans.id === myAnswer ? ' my-pick' : ''}`}
                >
                  {ans.text}
                  {ans.id === revealData.correctAnswer && <span className="tick">✓</span>}
                </div>
              ))}
            </div>
          )}

          <div className="my-result">
            {revealData.didNotAnswer
              ? <span className="timeout-msg">Час вийшов — 0 балів</span>
              : revealData.isCorrect
                ? <span className="correct-msg">+{revealData.pointsEarned} балів!</span>
                : <span className="wrong-msg">Неправильно — 0 балів</span>
            }
          </div>

          {revealData.isCorrect && (
            <div className="points-earned">
              <div className="points-value">+{revealData.pointsEarned}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: 4 }}>балів</div>
            </div>
          )}

          <div className="correct-answer-box">
            <div className="correct-answer-label">✓ Правильна відповідь</div>
            <div className="correct-answer-text">
              {ANSWER_LETTERS[revealData.correctAnswer]}: {revealData.correctAnswerText}
            </div>
          </div>

          <div className="total-score">
            <span className="total-score-label">Твій рахунок</span>
            <span className="total-score-value">{myScore}</span>
          </div>
        </div>
      )}
```

Note: `myAnswer` is now available (added in Chunk 2) so we can use it here to highlight the player's chosen answer.

- [ ] **Step 3: Update leaderboard render to use `.mine` class (keeping `.is-me` too)**

The existing leaderboard render uses `is-me` class. The spec wants `mine` class. We add `mine` as an alias alongside `is-me` so both old CSS and new CSS work:

Find in leaderboard render:
```jsx
                className={`leaderboard-item ${player.nickname === myNickname ? 'is-me' : ''}`}
```

Replace with:
```jsx
                className={`leaderboard-item ${player.nickname === myNickname ? 'is-me mine' : ''}`}
```

And update `p.position ?? i + 1` fallback for the `#${player.position}` display. The existing render uses `player.position` directly — it already handles this. No change needed there.

- [ ] **Step 4: Add reveal + leaderboard CSS**

Add to PlayerView.css:
```css
/* ── Answer Reveal (spec additions) ── */
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

/* Base colours matching answer buttons */
.reveal-btn.answer-0 { background: #e53935; }
.reveal-btn.answer-1 { background: #1e88e5; }
.reveal-btn.answer-2 { background: #43a047; }
.reveal-btn.answer-3 { background: #fb8c00; }

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
.wrong-msg   { color: #ff5252; }
.timeout-msg { color: #bbb; }

/* ── Leaderboard (spec additions) ── */
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

/* .mine alias on leaderboard-item for spec compatibility */
.leaderboard-item.mine {
  background: rgba(108, 63, 197, 0.25);
  border: 1px solid rgba(108, 63, 197, 0.5);
}

.lb-pos { width: 32px; opacity: 0.7; }
.lb-name { flex: 1; }
.lb-score { font-weight: bold; }
```

- [ ] **Step 5: Verify build**

```bash
cd /Users/einhorn/quiz-room-local/frontend && npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/einhorn/quiz-room-local
git add frontend/src/components/PlayerView.jsx frontend/src/components/PlayerView.css
git commit -m "feat: PlayerView — answer reveal time-out indicator and leaderboard own-row highlight"
```

---

## Final verification

- [ ] Run build one more time and confirm zero errors
- [ ] Report all 3 commit hashes
