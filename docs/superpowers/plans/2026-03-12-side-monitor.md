# SideMonitor + /api/podium/status Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/podium/status` backend endpoint and a `SideMonitor` React component that polls it every 2 seconds to display the player's nickname on the small side-monitor HDMI-2 display.

**Architecture:** The backend resolves the requesting IP against `this.roomManager.podiumRegistry` (a Map already populated on player join). The frontend component runs in a separate Chromium process that cannot share localStorage, so HTTP polling is the only viable IPC mechanism. A new `#/side` hash route mounts `SideMonitor`.

**Tech Stack:** Node.js + Express (backend), React + Vite + hash routing (frontend), supertest (tests)

---

## Chunk 1: Backend endpoint + test

### Task 1: Add `/api/podium/status` to `server.js`

**Files:**
- Modify: `backend/src/server.js` — add GET endpoint inside `setupRoutes()`, before the catch-all `app.get('*', ...)` handler

- [ ] **Step 1: Add the endpoint**

Insert before the catch-all route at line 204 in `backend/src/server.js`:

```js
// GET /api/podium/status — повертає нікнейм і фазу гри для IP цього подіуму
// SideMonitor (окремий Chromium на HDMI-2) опитує цей ендпоінт кожні 2с
// podiumRegistry зберігається в roomManager — Map: IP → socketId
this.app.get('/api/podium/status', (req, res) => {
  const ip = (req.ip || '').replace('::ffff:', '');
  const roomCode = this.roomManager.getCurrentRoom();

  if (!roomCode) {
    return res.json({ nickname: null, phase: 'WAITING' });
  }

  const session = this.roomManager.sessions.get(roomCode);
  if (!session) {
    return res.json({ nickname: null, phase: 'WAITING' });
  }

  // Знаходимо socket гравця за IP через podiumRegistry
  const playerSocketId = this.roomManager.podiumRegistry.get(ip);
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

- [ ] **Step 2: Add test in `backend/tests/server.test.js`**

Add a new `describe` block after the `GET /api/current-room` block:

```js
// ---------------------------------------------------------------------------
// GET /api/podium/status
// ---------------------------------------------------------------------------

describe('GET /api/podium/status', () => {
  afterEach(() => {
    server.roomManager.currentActiveRoom = null;
    server.roomManager.sessions.clear();
    server.roomManager.podiumRegistry.clear();
  });

  it('GET /api/podium/status returns null nickname when no active room', async () => {
    const res = await request(app).get('/api/podium/status');
    expect(res.status).toBe(200);
    expect(res.body.nickname).toBeNull();
    expect(res.body.phase).toBe('WAITING');
  });
});
```

- [ ] **Step 3: Run backend tests**

```bash
cd /Users/einhorn/quiz-room-local && npm test
```

All tests must pass.

---

## Chunk 2: Frontend SideMonitor component + route

### Task 2: Create `SideMonitor.jsx`

**Files:**
- Create: `frontend/src/components/SideMonitor.jsx`

- [ ] **Step 1: Write the component**

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

### Task 3: Create `SideMonitor.css`

**Files:**
- Create: `frontend/src/components/SideMonitor.css`

- [ ] **Step 1: Write the styles**

```css
/* SideMonitor.css — мінімальний дизайн для бічного екрану подіуму */

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

### Task 4: Add `#/side` route to `main.jsx`

**Files:**
- Modify: `frontend/src/main.jsx`

- [ ] **Step 1: Add import and route case**

Add `import SideMonitor from './components/SideMonitor.jsx';` alongside the other imports.

Add `if (route === '/side') return <SideMonitor />;` before the final `return <PlayerView />;` line, following the same pattern as `/host`, `/create`, `/stats`.

---

## Chunk 3: Build and commit

### Task 5: Build frontend and commit

- [ ] **Step 1: Build frontend**

```bash
cd /Users/einhorn/quiz-room-local/frontend && npm run build
```

Must complete with no errors.

- [ ] **Step 2: Commit**

```bash
git add backend/src/server.js backend/tests/server.test.js frontend/src/components/SideMonitor.jsx frontend/src/components/SideMonitor.css frontend/src/main.jsx
git commit -m "feat: SideMonitor — HTTP polling /api/podium/status for cross-process nickname display"
```
