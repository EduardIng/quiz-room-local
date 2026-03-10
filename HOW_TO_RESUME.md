# How to Resume Development — Quiz Room Local

Step-by-step guide for starting a new Claude Code session on this project.

---

## Step 1: Open the project in Claude Code

```bash
cd /Users/einhorn/quiz-room-local
claude
```

Or open VS Code / Cursor with Claude Code extension pointed at `/Users/einhorn/quiz-room-local`.

---

## Step 2: Give Claude this exact opening message

```
Read CLAUDE.md and PROGRESS.md fully. Then tell me:
1. What is the current project status?
2. What is the next recommended task from the KNOWN REMAINING WORK table?

Do not start any work yet — just report back.
```

Claude will read both files and give you a status summary. Verify it matches:
- Version: v0.2.0
- Tests: 176/176 passing
- All phases 0–6 complete
- 7 known remaining items in CLAUDE.md

---

## Step 3: Verify the project still works

Ask Claude to run:

```
Run the tests and confirm they pass.
```

Expected output:
```
Tests: 176 passed, 176 total
```

If tests fail, stop and ask Claude to diagnose before doing anything else.

---

## Step 4: Choose what to work on

The **KNOWN REMAINING WORK** table in `CLAUDE.md` lists 7 items in priority order.
The highest-impact ones are:

| # | Item | What it does |
|---|------|-------------|
| 2 | ProjectorView auto-discover room | Big screen no longer needs room code — auto-joins like tablets |
| 4 | Player list in HostView | Host sees player names, not just a count |
| 3 | color-mix() CSS fallback | Fixes visual glitch on older tablets |

Pick one and tell Claude:

```
Work on item #2 from the KNOWN REMAINING WORK table in CLAUDE.md.
```

---

## Step 5: Let Claude work

Claude is configured for **fully autonomous mode** — it will plan, implement, test, and commit without asking for approval. You will see:
- File edits happening automatically
- Test runs after each change
- Git commits with descriptive messages

You only need to intervene if Claude explicitly stops and says it hit a blocker (which should be rare).

---

## Step 6: After work is done

Ask Claude:

```
Update PROGRESS.md and CLAUDE.md to reflect what was just completed.
Then push to GitHub.
```

Claude will:
1. Mark the completed item in the KNOWN REMAINING WORK table (or remove it)
2. Commit the documentation update
3. Push to `https://github.com/EduardIng/quiz-room-local`

---

## Reference: Key commands

```bash
# Start the server
npm start
# → backend on http://localhost:8080

# Frontend dev server (hot reload, separate terminal)
cd frontend && npm run dev
# → frontend on http://localhost:3000

# Build frontend for production
cd frontend && npm run build

# Run all tests
npm test
# → 176 tests expected

# Check git status
git log --oneline -5
git tag -l
```

---

## Reference: Key URLs (server running)

| URL | What it is |
|-----|-----------|
| `http://localhost:8080/` | Player kiosk screen |
| `http://localhost:8080/#/host` | Host controls panel |
| `http://localhost:8080/#/create` | Quiz editor |
| `http://localhost:8080/#/screen` | Projector view |
| `http://localhost:8080/health` | Server health check |

---

## Reference: Key files

| File | What to read it for |
|------|---------------------|
| `CLAUDE.md` | Architecture, API reference, remaining work |
| `PROGRESS.md` | What was built in each phase, file inventory |
| `backend/src/websocket-handler-auto.js` | currentActiveRoom logic, join-quiz kiosk behaviour |
| `frontend/src/components/PlayerView.jsx` | Kiosk player UI, reconnect logic, room polling |
| `frontend/src/components/HostView.jsx` | Host panel, quiz library, host controls |

---

## Troubleshooting a new session

**Claude seems confused about the project:**
→ Make sure you opened Claude Code from inside `/Users/einhorn/quiz-room-local`, not from the parent folder or quiz-room-auto.

**Claude starts asking for confirmation on every step:**
→ Remind it: "This project runs in fully autonomous mode as documented in CLAUDE.md. Proceed without asking for approval."

**Tests fail on a fresh checkout:**
```bash
npm install
cd frontend && npm install && cd ..
npm test
```
If Vite build fails specifically:
```bash
cd frontend && rm -rf node_modules && npm install && npm run build
```

**Claude edits the wrong project (quiz-room-auto instead of quiz-room-local):**
→ Stop it immediately. Confirm current working directory with `pwd`. Reopen Claude Code from the correct folder.

**Git push fails:**
→ Check remote: `git remote -v` should show `https://github.com/EduardIng/quiz-room-local.git`
→ The token is embedded in the remote URL from the original setup.
