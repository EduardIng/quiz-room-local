# Kiosk Setup Guide — Quiz Room Local

Non-technical guide for setting up tablets as permanent player podiums.

---

## What You Need

- Server computer (laptop or mini-PC) on the local network
- 1+ Android tablets or iPads (Chrome / Chromium recommended)
- Wi-Fi router or switch connecting server + tablets

---

## Step 1: Start the Server

On the server computer:

```bash
cd /path/to/quiz-room-local
npm start
```

Note the IP address shown in the startup banner, e.g. `192.168.1.10:8080`.

---

## Step 2: Configure Each Tablet

### Chrome on Android (recommended)

1. Open Chrome
2. Navigate to `http://<server-ip>:8080/`
3. Tap the three-dot menu → **Add to Home Screen** → **Add**
4. This creates a fullscreen shortcut

**To enable Chrome kiosk / fullscreen mode on Android:**

Option A — Chrome flags:
1. Open `chrome://flags` in Chrome
2. Search for `"Persistent fullscreen"` → enable
3. Relaunch Chrome

Option B — Android kiosk mode (managed devices):
- Use Android MDM (e.g. Google Workspace) or `adb` to lock the device to a single app/URL

**Recommended Chrome settings:**
- Disable address bar (use kiosk mode or fullscreen shortcut)
- Disable auto-update popups during events
- Keep screen on: Settings → Display → Sleep → Never

### iPad (Safari)

1. Open Safari
2. Navigate to `http://<server-ip>:8080/`
3. Tap Share → **Add to Home Screen**
4. The app opens without browser chrome (address bar hidden)

**iPad Guided Access** (single-app kiosk):
1. Settings → Accessibility → Guided Access → enable
2. Open the Quiz Room shortcut
3. Triple-press side button to lock the iPad to that app

### Chromebook

1. Navigate to `http://<server-ip>:8080/`
2. Press **F11** for fullscreen
3. Or: set as kiosk app via Chrome Enterprise

---

## Step 3: Point Host Device to #/host

On the host's device (laptop or separate tablet):

Navigate to `http://<server-ip>:8080/#/host`

Bookmark this page. This is where the host:
- Selects which quiz to play
- Launches the quiz (creates the room)
- Presses **Start** to begin
- Controls the game (Pause / Skip)

---

## Step 4: Running a Game

1. Host opens `#/host`, selects a quiz, and sets the **expected player count** before clicking **🚀 Launch Quiz**
2. Tablets automatically detect the new game and show the nickname input
3. Players type their nickname and wait
4. The quiz **auto-starts** as soon as the expected number of players have joined — no manual Start needed
5. Game runs automatically: questions → answers → leaderboard → repeat
6. After the final question, tablets show final rankings, then return to "Waiting for host..."

---

## Tablet Placement Tips

- Mount tablets vertically (portrait) or horizontally (landscape) — both work
- Recommended: one tablet per player podium, permanently mounted
- Label each podium with a number so players know where to sit
- If a tablet loses Wi-Fi, it reconnects automatically (no player action needed)

---

## Network Requirements

- All tablets and server on the same Wi-Fi network
- No internet required (fully offline after initial setup)
- Recommended: dedicated Wi-Fi router for the venue (not shared with guests)
- If using wired Ethernet for server: ensure Wi-Fi and wired are on same subnet

---

## What Happens if a Tablet Disconnects?

The tablet reconnects automatically (exponential backoff: 2s → 30s max).

- If the game is in progress: the tablet rejoins and syncs to the current state
- If the game hasn't started: the tablet returns to the waiting screen
- Players see a subtle "Reconnecting..." indicator while offline

---

## Troubleshooting

**Tablet shows blank page:**
- Check Wi-Fi connection
- Try refreshing (swipe down or press F5)
- Confirm server IP is still the same (check startup banner)

**Tablet stuck on "Waiting for host...":**
- Host needs to launch a quiz from `#/host`
- Check server is running: open `http://<server-ip>:8080/health` — should show `{"status":"ok"}`

**Player can't submit answer:**
- Normal if time ran out — the reveal screen will show shortly
- Check Wi-Fi signal at that podium

**Game ended but tablets still show "waiting":**
- Expected behaviour — tablets wait for the host to launch the next game
