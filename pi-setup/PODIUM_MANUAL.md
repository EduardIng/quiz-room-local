# Podium Setup Manual
### Quiz Room Local — From Zero to Functional

---

## SHOPPING LIST (per podium)

```
[ ] Raspberry Pi 5 (4GB)
[ ] USB SSD — 120GB+, any USB 3.0 SSD or USB SSD stick (e.g. Samsung T7, Kingston XS2000)
[ ] Official Pi 5 PSU — 27W USB-C (5V/5A)
[ ] Micro-HDMI to HDMI cable × 2  (Ugreen or Vention, v2.0)
[ ] Female-to-female dupont jumper wires × 8
[ ] 4 arcade buttons (or tactile buttons) — ideally 4 different colors
[ ] Monitor × 2 (any HDMI, for testing — one can be a TV)
```

---

## STEP 1 — Flash the USB SSD

On your Mac:

1. Download **Raspberry Pi Imager** → https://www.raspberrypi.com/software/
2. Connect USB SSD to your Mac
3. Open Imager → Choose OS: **Raspberry Pi OS (64-bit, Desktop)**
4. Click the ⚙️ gear icon before flashing:
   - Set hostname: `podium-1`
   - Enable SSH ✓
   - Set username: `pi`
   - Set password: choose something
   - Configure WiFi (or skip if using ethernet)
5. Flash → wait ~5 minutes

```
  USB SSD
 ┌────────┐
 │ 💾     │  ← connect to Pi USB 3.0 port after flashing
 └────────┘
```

---

## STEP 1b — Enable USB Boot (one-time per physical Pi)

The Pi 5 boots from the SD slot by default. You must tell it to boot from USB first.
Do this once on your first Pi — all cloned Pis inherit the setting.

SSH into the Pi and run:

```bash
sudo raspi-config
```

Navigate: **Advanced Options → Boot Order → USB Boot**

Confirm and reboot:

```bash
sudo reboot
```

> Alternatively, edit the EEPROM directly:
> ```bash
> sudo rpi-eeprom-config --edit
> # Set: BOOT_ORDER=0xf14   (USB first, SD second as fallback)
> sudo reboot
> ```

After this reboot the Pi boots from the USB SSD. No SD card is needed.

---

## STEP 2 — Wire the Buttons

### GPIO Pinout (Pi 5, looking down at the board, pins on top-right)

```
  LEFT COLUMN (odd pins)     RIGHT COLUMN (even pins)
  ┌─────────────────────────────────────┐
  │  [1]  3.3V    [2]  5V               │
  │  [3]  GPIO2   [4]  5V               │
  │  [5]  GPIO3   [6]  GND  ←── use this│
  │  [7]  GPIO4   [8]  GPIO14           │
  │  [9]  GND     [10] GPIO15           │
  │  [11] GPIO17  [12] GPIO18           │  ← GPIO17 = Button A
  │  [13] GPIO27  [14] GND  ←── use this│  ← GPIO27 = Button B
  │  [15] GPIO22  [16] GPIO23           │  ← GPIO22 = C, GPIO23 = D
  │  [17] 3.3V    [18] GPIO24           │
  │  ...                                │
  └─────────────────────────────────────┘
```

### Button Wiring Table

```
  Button    Color     GPIO Pin    → GND Pin
  ────────────────────────────────────────
  A         Red       Pin 11      → Pin 6 or 9 or 14
  B         Blue      Pin 13      → Pin 6 or 9 or 14
  C         Green     Pin 15      → Pin 6 or 9 or 14
  D         Orange    Pin 16      → Pin 6 or 9 or 14
```

> All 4 GND wires can share the same GND pin, or use separate GND pins — both work.

### One button wired (example):

```
  Button A (Red)
  ┌──────────┐
  │  ●    ●  │
  └──┤    └──┤
     │       │
  jumper   jumper
  wire     wire
     │       │
  Pin 11   Pin 6
 (GPIO17) (GND)
```

No resistors needed — Pi has internal pull-up resistors.

---

## STEP 3 — Connect Displays and Power

```
  Raspberry Pi 5
  ┌──────────────────────────────────┐
  │                                  │
  │  [micro-HDMI 0] ──────────────── │──► Monitor 1 (PlayerView — player screen)
  │  [micro-HDMI 1] ──────────────── │──► Monitor 2 (SideMonitor — nickname display)
  │  [USB-C power]  ──────────────── │──► 27W PSU
  │  [USB 3.0 port] ── USB SSD       │
  │  [GPIO pins]    ── buttons       │
  │                                  │
  └──────────────────────────────────┘
```

> Power on only AFTER USB SSD and all cables are connected.

---

## STEP 4 — First Boot and SSH

1. Power on Pi — wait ~60 seconds for first boot
2. Find Pi's IP address:
   - Check your router's admin panel, or
   - From Mac terminal: `ping podium-1.local`
3. SSH in from your Mac:

```bash
ssh pi@podium-1.local
# or
ssh pi@192.168.X.X
```

---

## STEP 5 — Install Quiz Room Software

Once SSH'd into the Pi:

```bash
# Clone the repository
git clone https://github.com/EduardIng/quiz-room-local.git /home/pi/quiz-room-local

# Run the install script
cd /home/pi/quiz-room-local/pi-setup
bash install.sh
```

The script will:
- Install Chromium, Node.js, Python GPIO libraries
- Build the frontend
- Set up autostart (kiosk launches on boot)
- Disable screensaver
- Ask for podium number → sets hostname

```bash
# When prompted:
Введіть номер подіуму (1-8): 1

# Then reboot
sudo reboot
```

---

## STEP 6 — Configure Server Address

> Skip this step if the quiz server runs ON the same Pi.
> If the server runs on a separate Mac/PC, do this:

```bash
# Edit gpio-service.py
nano /home/pi/quiz-room-local/pi-setup/gpio-service.py
# Change: SERVER_URL = 'http://localhost:8080'
# To:     SERVER_URL = 'http://192.168.X.X:8080'   ← your server's LAN IP

# Edit kiosk.sh
nano /home/pi/quiz-room-local/pi-setup/kiosk.sh
# Change: QUIZ_SERVER="http://localhost:8080"
# To:     QUIZ_SERVER="http://192.168.X.X:8080"
```

---

## STEP 7 — Start the Quiz Server

On the machine running the quiz server (Mac or Pi):

```bash
cd /home/pi/quiz-room-local   # or the path where you installed the server
npm start
```

Server starts on port 8080. Keep this running.

---

## STEP 8 — Reboot and Verify

```bash
sudo reboot
```

After reboot (~30 seconds):

```
  Monitor 1 should show:          Monitor 2 should show:
  ┌──────────────────┐            ┌──────────────────┐
  │                  │            │                  │
  │  Очікування      │            │  (blank or       │
  │  ведучого...     │            │   "Waiting")     │
  │                  │            │                  │
  └──────────────────┘            └──────────────────┘
  PlayerView (#/)                 SideMonitor (#/side)
```

---

## STEP 9 — Test Buttons

On the Pi (via SSH):

```bash
python3 /home/pi/quiz-room-local/pi-setup/gpio-service.py
```

Press each button — you should see in the terminal:
```
2026-03-13 10:00:00 [GPIO] Кнопка 0 натиснута (GPIO 17)   ← Button A
2026-03-13 10:00:01 [GPIO] Кнопка 1 натиснута (GPIO 27)   ← Button B
2026-03-13 10:00:02 [GPIO] Кнопка 2 натиснута (GPIO 22)   ← Button C
2026-03-13 10:00:03 [GPIO] Кнопка 3 натиснута (GPIO 23)   ← Button D
```

---

## STEP 10 — Full End-to-End Test

1. Open **Host panel** on your Mac: `http://192.168.X.X:8080/#/host`
2. Select a quiz, set player count to 1
3. Click Launch
4. On Monitor 1 (PlayerView): enter nickname → join
5. Quiz auto-starts
6. Press physical buttons A/B/C/D → answers register
7. Monitor 2 shows your nickname during play

---

## CLONING FOR ADDITIONAL PODIUMS

After one Pi works perfectly:

```bash
# Shut down Pi, unplug USB SSD, connect it to your Mac
diskutil list                          # find the SSD disk number
sudo dd if=/dev/rdiskN of=~/podium-base.img bs=4m status=progress

# Connect next SSD to Mac, find its disk number
sudo dd if=~/podium-base.img of=/dev/rdiskN bs=4m status=progress

# Then SSH to each new Pi and set unique hostname
sudo hostnamectl set-hostname podium-2
sudo reboot
```

USB 3.0 SSD cloning is ~3× faster than SD card imaging.

Repeat for podium-3, podium-4, etc.

---

## TROUBLESHOOTING

| Symptom | Fix |
|---------|-----|
| Monitor 1 blank after reboot | SSH in, run `kiosk.sh` manually to see errors |
| Monitor 2 blank | Check micro-HDMI-1 cable; check `:1` display config |
| Buttons do nothing | Run `gpio-service.py` manually and check terminal output |
| "Waiting for host" never clears | Check server is running and SERVER_URL is correct |
| Pi won't boot | Check USB boot order in EEPROM (Step 1b); re-flash SSD via Raspberry Pi Imager |
| npm start fails | `cd frontend && npm run build` to see error |

---

## QUICK REFERENCE — GPIO Pins Used

```
  Pin 11  GPIO17  Button A (Red)
  Pin 13  GPIO27  Button B (Blue)
  Pin 15  GPIO22  Button C (Green)
  Pin 16  GPIO23  Button D (Orange)
  Pin 6   GND     Shared ground for all buttons
```

---

*Quiz Room Local v0.3.0 — Podium Setup Manual*
