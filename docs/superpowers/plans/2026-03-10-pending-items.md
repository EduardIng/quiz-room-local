# Pending Items Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 7 post-v0.2.0 pending items from CLAUDE.md to bring the project to a fully clean state.

**Architecture:** All changes are frontend-only except the package.json version bump. No backend changes needed. Items are independent and can be implemented sequentially.

**Tech Stack:** React + Vite, CSS variables, Socket.IO client, hash routing (#/)

---

## Chunk 1: Quick wins — version bump + delete dead file

### Task 1: Bump package.json version to 0.2.0

**Files:**
- Modify: `package.json:2`

- [ ] **Step 1: Edit version field**

Change `"version": "0.1.0"` → `"version": "0.2.0"`

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 0.2.0"
```

---

### Task 2: Delete AdminPanel.jsx (dead code)

**Files:**
- Delete: `frontend/src/components/AdminPanel.jsx`

- [ ] **Step 1: Verify the file exists and route is already removed**

Check `frontend/src/main.jsx` — confirm there is no `AdminPanel` import or route.

- [ ] **Step 2: Delete the file**

```bash
rm frontend/src/components/AdminPanel.jsx
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete dead AdminPanel.jsx — route was removed in Phase 3"
```

---

## Chunk 2: CSS — replace color-mix() with hardcoded RGBA

### Task 3: Fix color-mix() in HostView.css

`color-mix()` is unsupported in Chrome < 111 (which some older kiosk tablets may run).

Primary color: `#6c3fc5` = rgb(108, 63, 197). Card bg: `#16213e` = rgb(22, 33, 62).

Computed replacements:
- `color-mix(in srgb, var(--color-primary) 12%, var(--color-bg-card))` → `#20254e`
- `color-mix(in srgb, var(--color-primary) 20%, transparent)` → `rgba(108, 63, 197, 0.2)`
- `color-mix(in srgb, var(--color-primary) 10%, transparent)` → `rgba(108, 63, 197, 0.1)`
- `color-mix(in srgb, var(--color-primary) 30%, transparent)` → `rgba(108, 63, 197, 0.3)`

**Files:**
- Modify: `frontend/src/components/HostView.css:131,149,174,176`

- [ ] **Step 1: Replace line 131** (`.host-quiz-item.selected` background)

```css
/* Before */
background: color-mix(in srgb, var(--color-primary) 12%, var(--color-bg-card));
/* After */
background: #20254e;
```

- [ ] **Step 2: Replace line 149** (`.host-badge-category` background)

```css
/* Before */
background: color-mix(in srgb, var(--color-primary) 20%, transparent);
/* After */
background: rgba(108, 63, 197, 0.2);
```

- [ ] **Step 3: Replace lines 174 and 176** (`.host-selected-info`)

```css
/* Before */
background: color-mix(in srgb, var(--color-primary) 10%, transparent);
border: 1px solid color-mix(in srgb, var(--color-primary) 30%, transparent);
/* After */
background: rgba(108, 63, 197, 0.1);
border: 1px solid rgba(108, 63, 197, 0.3);
```

- [ ] **Step 4: Verify no color-mix() remains**

```bash
grep -r "color-mix" frontend/src/
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/HostView.css
git commit -m "fix: replace color-mix() with hardcoded RGBA in HostView.css — Chrome compat"
```

---

## Chunk 3: HostView UX improvements

### Task 4: Show player names list in HostView (not just count)

Currently `playerCount` is a number. Add `players` state (array of `{nickname}`) updated via `PLAYER_JOINED`/`PLAYER_LEFT`.

**Files:**
- Modify: `frontend/src/components/HostView.jsx`

- [ ] **Step 1: Add players state**

After line 45 (`const [playerCount, setPlayerCount] = useState(0);`), add:

```jsx
const [players, setPlayers] = useState([]);    // список нікнеймів гравців
```

- [ ] **Step 2: Update PLAYER_JOINED/PLAYER_LEFT handler in the quiz-update useEffect**

Replace the handler for `PLAYER_JOINED` / `PLAYER_LEFT` (currently lines 143-145):

```jsx
case 'PLAYER_JOINED':
case 'PLAYER_LEFT':
  setPlayerCount(data.totalPlayers ?? data.players?.length ?? 0);
  setPlayers(data.players || []);
  break;
```

- [ ] **Step 3: Reset players in handleReset**

In `handleReset` (after `setPlayerCount(0)`), add:

```jsx
setPlayers([]);
```

Also reset in handleLaunch success callback (after `setPlayerCount(0)`):

```jsx
setPlayers([]);
```

- [ ] **Step 4: Render player chips in the host controls view**

In the `if (roomCode)` render block, after the "Гравців" status row (line ~274), add a player chips list below the status card:

```jsx
{/* Список гравців */}
{players.length > 0 && (
  <div className="host-player-list">
    {players.map((p, i) => (
      <span key={i} className="host-player-chip">{p.nickname}</span>
    ))}
  </div>
)}
```

- [ ] **Step 5: Add CSS for player chips**

At the end of `frontend/src/components/HostView.css`, add:

```css
/* ────────────────────────────────────────────
   Список гравців на хост-екрані
   ──────────────────────────────────────────── */

.host-player-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  background: var(--color-bg-card);
  border-radius: 10px;
}

.host-player-chip {
  background: rgba(108, 63, 197, 0.2);
  color: var(--color-primary-light);
  border: 1px solid rgba(108, 63, 197, 0.4);
  border-radius: 20px;
  padding: 4px 12px;
  font-size: 0.85rem;
  font-weight: 600;
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/HostView.jsx frontend/src/components/HostView.css
git commit -m "feat: show joined player names in HostView controls panel"
```

---

### Task 5: Refresh quiz library after game ends

When `QUIZ_ENDED` is received, re-fetch `/api/quizzes` so the library is fresh when host clicks "Нова гра".

**Files:**
- Modify: `frontend/src/components/HostView.jsx`

- [ ] **Step 1: Extract fetchQuizzes into a reusable function**

Replace the `useEffect` fetch block (lines 61-75) with a named function + useEffect:

```jsx
// Завантажує список квізів з /api/quizzes
const fetchQuizzes = useCallback(() => {
  setLoadingLib(true);
  fetch(`${SERVER_URL}/api/quizzes`)
    .then(r => r.json())
    .then(data => {
      const list = data.quizzes || [];
      setQuizzes(list);
      if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
      setLoadingLib(false);
    })
    .catch(() => {
      setLibError('Не вдалось завантажити бібліотеку квізів.');
      setLoadingLib(false);
    });
}, [selectedId]);

useEffect(() => { fetchQuizzes(); }, []); // eslint-disable-line
```

- [ ] **Step 2: Call fetchQuizzes on QUIZ_ENDED in the quiz-update handler**

In the `quiz-update` useEffect handler, update the `QUIZ_ENDED` case:

```jsx
case 'QUIZ_ENDED':
  setGameEnded(true);
  setGamePhase('ended');
  fetchQuizzes();   // оновлення бібліотеки після завершення гри
  break;
```

Add `fetchQuizzes` to the useEffect dependency array.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/HostView.jsx
git commit -m "feat: refresh quiz library after game ends in HostView"
```

---

## Chunk 4: QuizCreator and ProjectorView

### Task 6: "Go to Host Panel" button in QuizCreator after save

After a successful save, show a link to `#/host` alongside the success message.

**Files:**
- Modify: `frontend/src/components/QuizCreator.jsx`

- [ ] **Step 1: Add showHostLink state**

Near the `saveSuccess` state (line 72), add:

```jsx
const [showHostLink, setShowHostLink] = useState(false);
```

- [ ] **Step 2: Set showHostLink on successful save**

In `handleSaveToLibrary`, after `setSaveSuccess(...)` (line 590), add:

```jsx
setShowHostLink(true);
setTimeout(() => { setSaveSuccess(''); setShowHostLink(false); }, 5000);
```

Remove the existing `setTimeout(() => setSaveSuccess(''), 3000)`.

- [ ] **Step 3: Render the host link next to the success message**

Replace line 1120:
```jsx
{saveSuccess && <div className="creator-save-success">{saveSuccess}</div>}
```
With:
```jsx
{saveSuccess && (
  <div className="creator-save-success">
    {saveSuccess}
    {showHostLink && (
      <a href="#/host" className="creator-host-link">
        {lang === 'uk' ? ' → Перейти до Host Panel' : ' → Go to Host Panel'}
      </a>
    )}
  </div>
)}
```

- [ ] **Step 4: Add CSS for the host link**

At the end of `frontend/src/components/QuizCreator.css`, add:

```css
.creator-host-link {
  display: inline-block;
  margin-left: 10px;
  color: #9b6dff;
  text-decoration: underline;
  font-weight: 600;
  font-size: 0.9rem;
}
.creator-host-link:hover {
  color: #fff;
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/QuizCreator.jsx frontend/src/components/QuizCreator.css
git commit -m "feat: add Go to Host Panel link in QuizCreator after save"
```

---

### Task 7: ProjectorView auto-discovers room via /api/current-room

Currently ProjectorView shows an "Enter room code" form. For kiosk use it should poll `/api/current-room` like PlayerView — no manual code entry needed.

**Approach:** On mount, fetch `/api/current-room`. If a room exists → auto-connect. If not → poll every 3s and show "Waiting for game..." screen. Keep the `?room=` URL param path as fallback (for manual override if needed).

**Files:**
- Modify: `frontend/src/components/ProjectorView.jsx`

- [ ] **Step 1: Add polling state and ref**

After the `connectError` state (line ~49), add:

```jsx
const [waitingForRoom, setWaitingForRoom] = useState(false); // чекаємо на активну кімнату
const pollRef = useRef(null);                                 // інтервал опитування
```

- [ ] **Step 2: Replace the initial phase logic**

Replace the `useState` initializer for `phase` (lines 38-42) and the `roomCode` initializer (lines 45-47):

```jsx
// Фаза: 'waiting_for_room' | 'connecting' | 'watching'
// ?room= у URL → одразу підключаємось; інакше → чекаємо на activeRoom
const [phase, setPhase] = useState(() => {
  const code = new URLSearchParams(window.location.search).get('room');
  return code ? 'connecting' : 'waiting_for_room';
});

const [roomCode, setRoomCode] = useState(() => {
  return new URLSearchParams(window.location.search).get('room')?.toUpperCase() || '';
});
```

Remove `inputCode` and `connectError` states (no longer needed — no manual entry form). Keep `connectError` only if used elsewhere; otherwise remove it too.

- [ ] **Step 3: Add auto-discovery useEffect**

Replace the existing mount useEffect (lines 136-145) with:

```jsx
useEffect(() => {
  const urlCode = new URLSearchParams(window.location.search).get('room');

  if (urlCode) {
    // Є ?room= → підключаємось одразу
    connectToRoom(urlCode);
  } else {
    // Немає коду → починаємо опитування /api/current-room
    setPhase('waiting_for_room');
    const tryConnect = () => {
      fetch(`${SERVER_URL}/api/current-room`)
        .then(r => r.json())
        .then(data => {
          if (data.roomCode) {
            clearInterval(pollRef.current);
            connectToRoom(data.roomCode);
          }
        })
        .catch(() => {}); // ігноруємо помилки мережі, продовжуємо polling
    };
    tryConnect();
    pollRef.current = setInterval(tryConnect, 3000);
  }

  return () => {
    clearInterval(pollRef.current);
    clearInterval(timerRef.current);
    clearInterval(countdownRef.current);
    clearInterval(categoryTimerRef.current);
    socketRef.current?.disconnect();
  };
}, []); // eslint-disable-line
```

- [ ] **Step 4: Update connectToRoom to set roomCode**

In `connectToRoom`, after `setPhase('connecting')`, add:

```jsx
setRoomCode(cleanCode);
```

This ensures the room code is stored even when discovered via polling (not URL param).

- [ ] **Step 5: Replace enter_code render with waiting_for_room screen**

Replace the `if (phase === 'enter_code')` block (lines 317-341) with:

```jsx
if (phase === 'waiting_for_room') {
  return (
    <div className="projector-root">
      <div className="projector-enter-screen">
        <div className="projector-logo">📺</div>
        <h1 className="projector-enter-title">Quiz Room — Великий Екран</h1>
        <p className="projector-enter-sub">Очікування активної гри...</p>
        <div className="projector-spinner" />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Remove unused state and imports**

Remove `inputCode` state and `connectError` state if unused. Remove the `connectToRoom` length-check on `cleanCode` (the auto-discovered code from the server is always valid — but keep the validation for the URL param path, which users might type).

Actually keep `connectError` as a fallback display on the connecting screen in case the server is unreachable.

- [ ] **Step 7: Run the app and verify**

```bash
# Terminal 1: npm start
# Terminal 2: cd frontend && npm run dev
# 1. Open http://localhost:5173/#/screen — should show "Очікування активної гри..."
# 2. From #/host, launch a quiz
# 3. ProjectorView should auto-connect within 3 seconds
# 4. Open http://localhost:5173/#/screen?room=XXXXXX — should still work (manual override)
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ProjectorView.jsx
git commit -m "feat: ProjectorView auto-discovers active room via /api/current-room polling"
```

---

## Final: tag and update docs

- [ ] **Update PROGRESS.md** — add a new section for this session's work, list all 7 items as complete.

- [ ] **Update CLAUDE.md** — clear the "KNOWN REMAINING WORK" table (all items resolved).

- [ ] **Final commit**

```bash
git add PROGRESS.md CLAUDE.md
git commit -m "docs: mark all pending items complete, update PROGRESS.md"
```

- [ ] **Tag**

```bash
git tag -a v0.2.1 -m "v0.2.1 — all pending items resolved"
git push origin main --tags
```
