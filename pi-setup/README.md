# Pi Kiosk Setup Guide

## Hardware per Podium

- Raspberry Pi 5 (4GB)
- HDMI-1: touchscreen (player UI — PlayerView)
- HDMI-2: small side monitor (nickname display — SideMonitor)
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
# 1. Flash Raspberry Pi OS (64-bit, Desktop) to USB SSD via Raspberry Pi Imager
# 2. Enable SSH and set WiFi/ethernet in Raspberry Pi Imager
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

The quiz server runs via `npm start` (started separately, or add it to `kiosk.sh` before the curl wait loop).

If the quiz server is on a different machine, update `SERVER_URL` in `gpio-service.py` and `QUIZ_SERVER` in `kiosk.sh` to the server's LAN IP (e.g. `http://192.168.1.100:8080`).

## Imaging for Multiple Podiums

After setting up one Pi perfectly (including USB boot EEPROM config — see PODIUM_MANUAL.md Step 4b):

```bash
# Shut down Pi, unplug USB SSD, connect it to your Mac
diskutil list                          # find the SSD disk number

# Create image from SSD (file will be ~120 GB — ensure 130+ GB free on Mac)
sudo dd if=/dev/rdiskN of=~/podium-base.img bs=4m status=progress

# Connect next SSD to Mac, find its disk number, flash it
sudo dd if=~/podium-base.img of=/dev/rdiskN bs=4m status=progress
```

> **Note:** EEPROM settings are not copied when cloning. Run `sudo raspi-config` → Advanced Options → Boot Order → USB Boot on each new Pi after first boot.

Then SSH to each Pi and run: `sudo hostnamectl set-hostname podium-N`

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Pi won't boot | Check USB boot enabled in EEPROM (PODIUM_MANUAL.md Step 4b); re-flash USB SSD via Raspberry Pi Imager |
| Chromium doesn't open | Check `~/.config/autostart/quiz-kiosk.desktop` |
| GPIO buttons don't work | Run `python3 gpio-service.py` manually, check wiring |
| Side monitor blank | Check HDMI-2 connection and display `:1` config |
| Can't reach quiz server | Confirm server on port 8080, Pi on same LAN subnet |
| Build fails on Pi | Run `cd frontend && npm run build` manually to see errors |
