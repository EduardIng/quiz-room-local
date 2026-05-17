# Podium Setup Manual
### Quiz Room Local — From Zero to Functional

---

## SHOPPING LIST (per podium)

### Required for every podium

```
[ ] Raspberry Pi 5 (4GB)
[ ] Official Pi 5 PSU — 27W USB-C (5V/5A)
[ ] Micro-HDMI to HDMI cable x 2  (Ugreen or Vention, v2.0)
[ ] Female-to-female dupont jumper wires x 8
[ ] 4 arcade buttons (or tactile buttons) — ideally 4 different colors
[ ] Monitor x 2 (any HDMI, for testing — one can be a TV)
```

### Boot media — pick ONE of the three options below

You need exactly ONE storage device per podium to hold the operating system and quiz software.
All three options work. Pick whichever you have on hand or can buy easily.

```
OPTION A — microSD Card
========================
What it looks like:

    ┌──────────┐
    │          │  <-- about the size of your thumbnail
    │  microSD │  <-- a tiny flat chip
    │          │
    └────┬─────┘
         └── gold contacts on bottom

Size:      About 15mm x 11mm (smaller than a postage stamp)
Buy:       16GB or larger, Class 10 or A1/A2 speed rating
Price:     $5 - $15
Examples:  SanDisk Ultra 32GB, Samsung EVO Select 32GB
Where it goes on the Pi:  slides into the SD card slot on the BOTTOM of the Pi

Pros:
  + Cheapest option
  + Every Pi boots from microSD out of the box — no extra setup
  + Easy to buy anywhere

Cons:
  - Slowest option — boot takes longer, software loads slower
  - SD cards can wear out over time (years of heavy use)
  - Easy to lose (it's tiny!)
```

```
OPTION B — USB Flash Drive (USB stick / thumb drive / pen drive)
=================================================================
What it looks like:

    ┌──────────────────┐
    │                  │
    │   USB FLASH      ├──┐
    │   DRIVE          │  │ <-- USB-A plug (flat rectangular metal)
    │                  ├──┘
    └──────────────────┘

Size:      About the size of your thumb, or smaller
Buy:       16GB or larger, USB 3.0 (NOT USB 2.0 — 3.0 is much faster)
Price:     $7 - $20
Examples:  SanDisk Ultra USB 3.0, Kingston DataTraveler
Where it goes on the Pi:  plugs into any USB port on the Pi (prefer the blue USB 3.0 ports)

Pros:
  + Cheap and easy to find in any store
  + Faster than microSD
  + Sticks out of the Pi so you can see it and grab it

Cons:
  - Sticks out — can get bumped and break the USB port
  - Not as fast as an SSD
  - Requires one-time EEPROM change on the Pi (Step 4b)
```

```
OPTION C — USB SSD (Solid State Drive)
========================================
What it looks like (two common forms):

    Portable SSD (like Samsung T7):       USB SSD stick:
    ┌──────────────────────┐              ┌──────────────────┐
    │                      │              │                  ├──┐
    │    PORTABLE SSD      │              │   SSD STICK      │  │ USB-A plug
    │                      │              │                  ├──┘
    │            ┌──┐      │              └──────────────────┘
    │            │  │ USB-C│
    └────────────┴──┘──────┘
    (needs USB-C to USB-A cable
     or adapter to plug into Pi)

Size:      Credit-card size (portable SSD) or thumb-drive size (SSD stick)
Buy:       120GB or larger, USB 3.0 / USB 3.2
Price:     $20 - $50
Examples:  Samsung T7, Kingston XS2000, ADATA SE880 (SSD stick form)
Where it goes on the Pi:  plugs into a blue USB 3.0 port on the Pi

Pros:
  + Fastest option — Pi boots quickly, everything feels snappy
  + Very reliable — SSDs last a very long time
  + Large storage capacity

Cons:
  - Most expensive option
  - Portable SSDs need an extra cable (USB-C to USB-A)
  - Requires one-time EEPROM change on the Pi (Step 4b)
```

> **Summary: which to pick?**
>
> | | microSD | USB Flash | USB SSD |
> |---|---------|-----------|---------|
> | Cost | $5-15 | $7-20 | $20-50 |
> | Speed | Slow | Medium | Fast |
> | Extra Pi setup? | No | Yes (Step 4b) | Yes (Step 4b) |
> | Reliability | OK | Good | Best |
>
> If unsure, start with a **microSD card** — it is the simplest because every Pi boots from it automatically. You can always switch to USB later.

---

## STEP 1 — Flash Your Boot Media

This step writes the Raspberry Pi operating system onto your storage device using your Mac.

On your Mac:

1. Download **Raspberry Pi Imager** from https://www.raspberrypi.com/software/
2. Install it (drag to Applications) and open it
3. Click **Choose OS** → select **Raspberry Pi OS (64-bit, Desktop)**
4. Now connect your storage device to your Mac and select it (see your option below)
5. Click the gear icon (settings) before flashing:
   - Set hostname: `podium-1`
   - Enable SSH: check the box
   - Set username: `pi`
   - Set password: choose something you will remember
   - Configure WiFi: enter your network name and password (or skip if using ethernet cable)
6. Click **Write** → confirm → wait ~5 minutes

### Option A: Flashing a microSD card

**How to connect the microSD to your Mac:**

```
Your Mac has an SD card slot (a thin slot on the side):

    Mac side view:
    ┌──────────────────────────────────────┐
    │            ┌──────┐                  │
    │            │ SD   │ <-- SD card slot │
    │            │ slot │                  │
    │            └──────┘                  │
    └──────────────────────────────────────┘

If your microSD card fits directly:
  Just slide it in, gold contacts facing down.

If your microSD card is too small for the slot (most are):
  You need a microSD-to-SD adapter. One usually comes in the box
  with the microSD card — it looks like a bigger SD card with a
  slot to insert the microSD into:

    ┌────────────────────┐
    │                    │
    │   SD ADAPTER       │  <-- full-size SD card shape
    │                    │
    │   ┌──────────┐     │
    │   │ microSD  │     │  <-- slide the tiny microSD in here
    │   │ goes here│     │
    │   └──────────┘     │
    │                    │
    └────────┬───────────┘
             └── gold contacts on bottom

  1. Slide the microSD into the adapter (label side up, contacts down)
  2. Slide the adapter into your Mac's SD card slot

If your Mac has NO SD card slot (some newer Macs):
  Buy a USB SD card reader ($5-10) and plug it into a USB port.
```

**In Raspberry Pi Imager**, click **Choose Storage**. You should see something like:

```
  ┌─────────────────────────────────────────────┐
  │  Choose Storage                              │
  │                                              │
  │  ● Apple SDXC Reader - 31.9 GB               │  <-- THIS IS YOUR SD CARD
  │                                              │
  │  (other drives may also appear — do NOT      │
  │   select your Mac's hard drive!)             │
  └─────────────────────────────────────────────┘
```

Look for a drive that matches your microSD card's size (e.g. 32GB shows as ~31.9 GB).
It usually says "SDXC Reader" or "SD Card Reader" or similar.
Click it, then proceed to flash.

**After flashing:** eject the SD card from your Mac. You will insert it into the Pi in Step 3.


### Option B: Flashing a USB flash drive

**How to connect the USB flash drive to your Mac:**

```
  1. Find a USB port on your Mac
  2. Plug the USB flash drive in

  That's it. Really.

    Mac side/back view:
    ┌──────────────────────────────────────┐
    │    ┌──┐  ┌──┐                        │
    │    │  │  │  │ <-- USB ports          │
    │    └──┘  └──┘                        │
    └──────────────────────────────────────┘
                 ▲
          ┌──────┴──────────┐
          │                 ├──┐
          │  USB FLASH      │  │ plugs in here
          │  DRIVE          ├──┘
          └─────────────────┘

  If your Mac only has USB-C ports (oval shaped) and your flash drive
  has a USB-A plug (rectangular), you need a USB-C to USB-A adapter
  or a USB-C hub.
```

**In Raspberry Pi Imager**, click **Choose Storage**. You should see something like:

```
  ┌─────────────────────────────────────────────┐
  │  Choose Storage                              │
  │                                              │
  │  ● SanDisk Ultra USB 3.0 - 31.5 GB           │  <-- THIS IS YOUR FLASH DRIVE
  │                                              │
  │  (it will show the brand name and size)      │
  └─────────────────────────────────────────────┘
```

Look for a drive matching your flash drive's brand and size.
**Do NOT select your Mac's internal drive.**
Click it, then proceed to flash.

**After flashing:** eject the flash drive from your Mac. You will plug it into the Pi in Step 3.


### Option C: Flashing a USB SSD

**How to connect the USB SSD to your Mac:**

```
  SSD stick form (has USB-A plug built in):
    Just plug it into a USB port on your Mac, same as a flash drive.

  Portable SSD (like Samsung T7):
    It has a USB-C port. Use the cable that came with the SSD.
    - If your Mac has USB-C ports: plug the cable directly into Mac
    - If your Mac has USB-A ports: use a USB-C to USB-A adapter or cable

    ┌────────────────────┐         ┌──────────────────────┐
    │                    │         │                      │
    │   Mac              │ ══════  │   Portable SSD       │
    │                    │  cable  │                      │
    └────────────────────┘         └──────────────────────┘
```

**In Raspberry Pi Imager**, click **Choose Storage**. You should see something like:

```
  ┌─────────────────────────────────────────────┐
  │  Choose Storage                              │
  │                                              │
  │  ● Samsung Portable SSD T7 - 120.0 GB        │  <-- THIS IS YOUR SSD
  │                                              │
  │  (or Kingston XS2000, or similar brand name) │
  └─────────────────────────────────────────────┘
```

Look for a drive matching your SSD's brand and size.
**Do NOT select your Mac's internal drive.**
Click it, then proceed to flash.

**After flashing:** eject the SSD from your Mac. You will plug it into the Pi in Step 3.

---

## STEP 2 — Wire the Buttons

### GPIO Pinout (Pi 5, looking down at the board, pins on top-right)

```
  LEFT COLUMN (odd pins)     RIGHT COLUMN (even pins)
  ┌─────────────────────────────────────┐
  │  [1]  3.3V    [2]  5V               │
  │  [3]  GPIO2   [4]  5V               │
  │  [5]  GPIO3   [6]  GND  <── use this│
  │  [7]  GPIO4   [8]  GPIO14           │
  │  [9]  GND     [10] GPIO15           │
  │  [11] GPIO17  [12] GPIO18           │  <-- GPIO17 = Button A
  │  [13] GPIO27  [14] GND  <── use this│  <-- GPIO27 = Button B
  │  [15] GPIO22  [16] GPIO23           │  <-- GPIO22 = C, GPIO23 = D
  │  [17] 3.3V    [18] GPIO24           │
  │  ...                                │
  └─────────────────────────────────────┘
```

### Button Wiring Table

```
  Button    Color     GPIO Pin    -> GND Pin
  ────────────────────────────────────────
  A         Red       Pin 11      -> Pin 6 or 9 or 14
  B         Blue      Pin 13      -> Pin 6 or 9 or 14
  C         Green     Pin 15      -> Pin 6 or 9 or 14
  D         Orange    Pin 16      -> Pin 6 or 9 or 14
```

> All 4 GND wires can share the same GND pin, or use separate GND pins — both work.

### One button wired (example):

```
  Button A (Red)
  ┌──────────┐
  │  o    o  │
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

## STEP 3 — Connect Storage, Displays, and Power

This is where you plug everything into the Pi. The storage device goes in a different place depending on which option you chose.

### Where each storage device plugs in

```
  Raspberry Pi 5 — TOP VIEW
  ┌──────────────────────────────────────────────────┐
  │                                                  │
  │  [micro-HDMI 0]  [micro-HDMI 1]  [USB-C power]  │ <-- front edge
  │                                                  │
  │   GPIO pins                                      │
  │   (top right)                                    │
  │                                                  │
  │                  [USB 2.0] [USB 2.0]             │ <-- back edge
  │                  [USB 3.0] [USB 3.0]             │    (USB 3.0 ports
  │                   (blue)    (blue)               │     are BLUE inside)
  └──────────────────────────────────────────────────┘

  Raspberry Pi 5 — BOTTOM VIEW (flipped over)
  ┌──────────────────────────────────────────────────┐
  │                                                  │
  │                     ┌──────────────┐             │
  │                     │  SD CARD     │             │
  │                     │  SLOT        │             │ <-- spring-loaded slot
  │                     │  (push to    │             │     on the BOTTOM
  │                     │   insert)    │             │     of the board
  │                     └──────────────┘             │
  │                                                  │
  └──────────────────────────────────────────────────┘
```

**Option A — microSD card:**

```
  1. Flip the Pi upside down
  2. Find the SD card slot (a thin metal rectangle)
  3. Hold the microSD card with gold contacts facing UP (toward the board)
  4. Gently slide it into the slot until it clicks

  Side view:
       Pi board
  ═══════════════════
       ▲
       │  push in
  ┌────┴────┐
  │ microSD │  gold contacts face up (toward the board)
  └─────────┘
```

**Option B — USB flash drive:**

```
  1. Find the USB ports on the back edge of the Pi
  2. Plug the USB flash drive into one of the BLUE USB 3.0 ports
     (blue ports are faster — use them if possible)

  Back edge view:
  ┌──────────────────────────┐
  │  [USB 2.0]  [USB 2.0]   │
  │  [USB 3.0]  [USB 3.0]   │ <-- plug flash drive into one of these
  └────────────┬─────────────┘     (blue inside)
               │
        ┌──────┴──────────┐
        │                 ├──┐
        │  USB FLASH      │  │
        │  DRIVE          ├──┘
        └─────────────────┘
```

**Option C — USB SSD:**

```
  1. Find the USB ports on the back edge of the Pi
  2. Plug the USB SSD into one of the BLUE USB 3.0 ports
     (you MUST use a blue USB 3.0 port for good speed)

  For SSD sticks:  plug directly into the blue USB 3.0 port
  For portable SSDs:  connect the cable from the SSD to the blue USB 3.0 port
                      (you may need a USB-C to USB-A adapter)
```

### Full connection diagram

```
  Raspberry Pi 5
  ┌──────────────────────────────────┐
  │                                  │
  │  [micro-HDMI 0] ────────────────>│  Monitor 1 (PlayerView — player screen)
  │  [micro-HDMI 1] ────────────────>│  Monitor 2 (SideMonitor — nickname display)
  │  [USB-C power]  ────────────────>│  27W PSU
  │                                  │
  │  Storage (ONE of these):         │
  │    microSD   -> SD slot (bottom) │
  │    USB flash -> USB port (back)  │
  │    USB SSD   -> USB 3.0 (back)   │
  │                                  │
  │  [GPIO pins]    -> buttons       │
  │                                  │
  └──────────────────────────────────┘
```

> Power on only AFTER your storage device and all cables are connected.

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

## STEP 4b — Enable USB Boot (ONLY for USB flash drive and USB SSD users)

> **Using a microSD card (Option A)?**
> **SKIP THIS ENTIRE STEP. Go directly to Step 5.**
> The Pi boots from microSD by default. No changes needed.

> **Using a USB flash drive (Option B) or USB SSD (Option C)?**
> **You MUST complete this step.** The Pi does not boot from USB by default.
> You need to change a setting stored inside the Pi's permanent memory (called EEPROM).

### The chicken-and-egg problem

Here is the tricky part. Read this carefully.

The Pi's boot setting (EEPROM) can only be changed while the Pi is running. But the Pi can only boot from a microSD card right now — because you have not changed the boot setting yet. So how do you boot the Pi to change the setting?

**You have two options:**

```
  SITUATION 1: You have a microSD card available (even a small, old one)
  ======================================================================
  This is the easiest path. You will:
    1. Flash a temporary microSD with Raspberry Pi OS (same as Step 1, Option A)
    2. Boot the Pi from that microSD
    3. Change the boot setting (EEPROM)
    4. Shut down the Pi
    5. Remove the microSD
    6. Plug in your USB flash drive / USB SSD
    7. Boot the Pi — it now boots from USB!

  You only need the microSD card for this ONE boot. After that, you can
  reuse the microSD card for other podiums or throw it in a drawer.

  SITUATION 2: You already completed Step 4b on this SAME PHYSICAL Pi before
  ===========================================================================
  The EEPROM setting is stored permanently on the Pi board itself (not on the
  storage device). If you already changed the boot order on THIS Pi at any
  point in the past, it still remembers. Just plug in your USB device and
  it should boot.

  Note: if you bought a brand new Pi, you have NEVER done this before.
  You need a microSD card (Situation 1).

  SITUATION 3: You do not have any microSD card at all
  =====================================================
  You must get one. Even a tiny 4GB microSD card will work. Borrow one,
  buy one ($3-5), or pull one from an old phone or camera. You need it
  just once to do the EEPROM change, then you can return it.
```

### How to change the boot order

Once the Pi is booted (from a temporary microSD card if needed), SSH in and run:

```bash
sudo raspi-config
```

A menu appears in the terminal. Navigate with arrow keys:

```
  1. Use arrow keys to highlight: Advanced Options     -> press Enter
  2. Use arrow keys to highlight: Boot Order           -> press Enter
  3. Use arrow keys to highlight: USB Boot             -> press Enter
  4. Confirm: Yes
```

Then reboot:

```bash
sudo reboot
```

> **Alternative method (for advanced users):**
> Instead of using raspi-config, you can edit the EEPROM directly:
> ```bash
> sudo rpi-eeprom-config --edit
> ```
> Find the line `BOOT_ORDER=` and change it to:
> ```
> BOOT_ORDER=0xf14
> ```
> This means: try USB first, then SD card as fallback.
> Save and exit the editor (Ctrl+O, Enter, Ctrl+X if using nano), then reboot:
> ```bash
> sudo reboot
> ```

### After the EEPROM change

```
  If you booted from a TEMPORARY microSD card:
    1. Shut down the Pi:  sudo shutdown now
    2. Wait for the green LED to stop blinking
    3. Unplug power
    4. Remove the temporary microSD card from the bottom of the Pi
    5. Plug your USB flash drive or USB SSD into a blue USB 3.0 port
    6. Plug power back in
    7. The Pi should boot from USB!

  If you were already booted from your USB device:
    The Pi will reboot and come back up from USB. You are done.
```

**Important:** This EEPROM change is per-Pi. If you set up 4 podiums, you must do Step 4b on each of the 4 physical Pi boards. Cloning a storage device does NOT copy the EEPROM setting — it lives on the Pi board, not on the storage.

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
- Ask for podium number -> sets hostname

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
# To:     SERVER_URL = 'http://192.168.X.X:8080'   <-- your server's LAN IP

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
2026-03-13 10:00:00 [GPIO] Кнопка 0 натиснута (GPIO 17)   <-- Button A
2026-03-13 10:00:01 [GPIO] Кнопка 1 натиснута (GPIO 27)   <-- Button B
2026-03-13 10:00:02 [GPIO] Кнопка 2 натиснута (GPIO 22)   <-- Button C
2026-03-13 10:00:03 [GPIO] Кнопка 3 натиснута (GPIO 23)   <-- Button D
```

---

## STEP 10 — Full End-to-End Test

1. Open **Host panel** on your Mac: `http://192.168.X.X:8080/#/host`
2. Select a quiz, set player count to 1
3. Click Launch
4. On Monitor 1 (PlayerView): enter nickname -> join
5. Quiz auto-starts
6. Press physical buttons A/B/C/D -> answers register
7. Monitor 2 shows your nickname during play

---

## CLONING FOR ADDITIONAL PODIUMS

After setting up one Pi perfectly, you can clone the storage device to make copies for additional podiums. This saves you from repeating Steps 1, 5, 6, and 7 for each podium.

### Step 1: Create the image from your working podium

Shut down the Pi, unplug the storage device, and connect it to your Mac.

**Find the disk number:**

```bash
diskutil list
```

This shows all connected drives. Look for your device:

```
  For microSD:     Look for the size matching your SD card.
                   It will say something like "/dev/disk4 (external, physical)"
                   with your card's size (e.g., "31.9 GB").

  For USB flash:   Look for your flash drive's brand name and size.
                   It will say something like "/dev/disk4 (external, physical)".

  For USB SSD:     Look for your SSD's brand name and size.
                   It will say something like "/dev/disk4 (external, physical)".
```

**IMPORTANT:** The disk number (e.g., `disk4`) will be different on your Mac. Triple-check you have the right one. Selecting your Mac's internal drive will destroy your Mac's data.

**Create the image file:**

```bash
# Replace N with your disk number (e.g., 4)
sudo dd if=/dev/rdiskN of=~/podium-base.img bs=4m status=progress
```

This copies the entire storage device to a file on your Mac called `podium-base.img`.
It may take 5-30 minutes depending on the size and speed of the device.

### Step 2: Write the image to each new storage device

Connect the new (blank) storage device to your Mac. Find its disk number with `diskutil list`.

```bash
# Unmount the new device first (replace N with the NEW disk number)
diskutil unmountDisk /dev/diskN

# Write the image (replace N with the NEW disk number)
sudo dd if=~/podium-base.img of=/dev/rdiskN bs=4m status=progress
```

> **Note about speed:**
> - microSD card cloning: ~10-20 minutes
> - USB flash drive cloning: ~5-15 minutes
> - USB SSD cloning: ~3-8 minutes (fastest)

### Step 3: Set a unique hostname on each new podium

After writing the image, put the new storage device into the new Pi, boot it, SSH in, and set a unique hostname:

```bash
sudo hostnamectl set-hostname podium-2
sudo reboot
```

Repeat for podium-3, podium-4, etc.

### Step 4 (USB users only): Run Step 4b on each new Pi

**If using microSD:** skip this — each Pi boots from microSD automatically.

**If using USB flash drive or USB SSD:** you must run Step 4b (EEPROM change) on each new physical Pi. Cloning the storage device does NOT copy EEPROM settings — the boot order is stored on the Pi board itself, not on the storage device.

For each new Pi:
1. Boot it from a temporary microSD card (or skip if you already did Step 4b on this Pi before)
2. SSH in and run `sudo raspi-config` -> Advanced Options -> Boot Order -> USB Boot
3. Shut down, remove the microSD, plug in the cloned USB device, and boot

---

## TROUBLESHOOTING

### General issues

| Symptom | Fix |
|---------|-----|
| Monitor 1 blank after reboot | SSH in, run `kiosk.sh` manually to see errors |
| Monitor 2 blank | Check micro-HDMI-1 cable; check `:1` display config |
| Buttons do nothing | Run `gpio-service.py` manually and check terminal output |
| "Waiting for host" never clears | Check server is running and SERVER_URL is correct |
| npm start fails | `cd frontend && npm run build` to see error |

### Storage-specific issues

| Symptom | Fix |
|---------|-----|
| Pi won't boot from microSD card | Re-flash the microSD card using Raspberry Pi Imager. Try a different microSD card. Make sure the card is fully pushed into the slot (it should click). Check that the gold contacts are clean and not damaged. |
| Pi won't boot from USB flash drive | Did you do Step 4b? The Pi does not boot from USB by default. SSH in via a temporary microSD card and run `sudo raspi-config` -> Advanced Options -> Boot Order -> USB Boot. Also try a different USB port (use the blue USB 3.0 ports). |
| Pi won't boot from USB SSD | Same as USB flash drive above — check Step 4b. Also make sure the SSD is getting enough power. The 27W PSU is required for USB SSDs. If using a portable SSD with a cable, try a shorter cable. Try a different USB 3.0 port. |
| Raspberry Pi Imager does not show my device | Unplug the device and plug it back in. Try a different USB port on your Mac. Try a different cable. Close Imager and reopen it. Make sure the device is not mounted by another program — run `diskutil unmountDisk /dev/diskN` first. If using a microSD card, make sure it is fully inserted into the adapter and the adapter is fully inserted into the Mac's SD slot. |
| Pi boots but is very slow | If using microSD, this is normal — SD cards are slower. If using USB flash drive, make sure it is USB 3.0 (not USB 2.0) AND plugged into a blue USB 3.0 port on the Pi (not a black USB 2.0 port). |
| Pi boot loops (starts, then restarts, over and over) | The storage device may be corrupted. Re-flash it using Raspberry Pi Imager. If the problem persists, try a different storage device. |

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

## GPIO Buttons — Wiring & State-Aware Behaviour

### Wiring

| Button | BCM pin | 40-pin header | Wire to GND | UI colour |
|---|---|---|---|---|
| A | 17 | 11 | any GND pin (6/9/14/20/25/30/34/39) | red |
| B | 27 | 13 | any GND pin | blue |
| C | 22 | 15 | any GND pin | orange |
| D | 23 | 16 | any GND pin | green |

Each button is a momentary switch between its BCM pin and ground. Internal pull-up
resistors are enabled in software (`gpio-service.py`), so wiring is just
`pin ↔ switch ↔ GND` — no external resistors needed.

### State-aware behaviour

The server's `routePodiumButton` decides what a press means based on `session.gameState`:

| Game state        | Button A (0) | Button B (1) | Buttons C/D (2/3) |
|-------------------|--------------|--------------|---------------------|
| `CATEGORY_SELECT` | submitCategory(0) — pick left option | submitCategory(1) — pick right option | silently ignored |
| `QUESTION`        | submitAnswer(0) — answer A | submitAnswer(1) — answer B | submitAnswer(2)/submitAnswer(3) |
| any other state   | silently ignored | silently ignored | silently ignored |

### Activating the service

```bash
# One-time per Pi:
sudo cp /home/admin/quiz-room-local/pi-setup/gpio-service.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gpio-service

# Verify
systemctl status gpio-service
journalctl -fu gpio-service
```

Expected on healthy startup: `[GPIO] Підключено до сервера квізу`.

---

*Quiz Room Local v0.3.0 — Podium Setup Manual*
