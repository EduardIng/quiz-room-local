# Podium Assembly Manual — Design Spec
**Date:** 2026-03-14
**Project:** quiz-room-local
**Output:** `pi-setup/PODIUM_ASSEMBLY_MANUAL.html`

---

## Goal

A self-contained, offline-capable HTML manual for assembling one complete player podium from scratch. Target reader: complete hardware novice. Covers physical component selection, stand design, wiring, software install, testing, cloning, troubleshooting, and component justification.

---

## Structure — 4 Pages (single HTML file, JS navigation)

### Page 1 — Hardware Assembly
- Shopping list: best option + Czech Republic / DACH alternative for each component
- Stand recommendation: tilted lectern style with layout diagram
- Monitor 1 (13"+ touchscreen) selection and mounting
- Monitor 2 (21"–27" non-touch) selection and mounting
- Raspberry Pi 5 setup and SD card flashing (Mac instructions)
- GPIO button wiring (annotated visual diagram, 4 arcade buttons, no resistors)
- Cable routing and final assembly checklist

### Page 2 — Software & Go-Live
- SSH into Pi, configure server address
- Run install.sh, set podium number
- End-to-end test: buttons, both screens, quiz flow
- Cloning for podiums 2–8 (dd image method)

### Page 3 — Troubleshooting
- Problem/solution table covering all known failure modes
- Common gotchas (HDMI boot order, GPIO pull-up, kiosk.sh path)

### Page 4 — Why These Components?
- Raspberry Pi 5 vs Pi 4 Model B vs Pi 400 vs mini PC
- Touchscreen options: Waveshare vs LILLIPUT vs generic Amazon panel
- Arcade vs tactile vs capacitive buttons
- Stand form factors: tilted lectern vs flat pedestal vs wall mount
- PSU: official 27W vs third-party
- SD card vs USB SSD boot

---

## Technical Spec

- **Format:** Single `.html` file, zero dependencies, no CDN, works offline
- **Navigation:** Fixed top nav bar with 4 page tabs; active page shown; prev/next buttons
- **Diagrams:** Inline SVG (no external images required)
- **Shopping tables:** Best pick + CZ/DACH alternative columns, with price range and sourcing link text
- **GPIO diagram:** Annotated SVG pinout showing Pi 40-pin header with used pins highlighted
- **Language:** English throughout
- **Output path:** `pi-setup/PODIUM_ASSEMBLY_MANUAL.html`

---

## Key Decisions

- Multi-page over single scroll: user prefers page-based navigation
- Both touchscreen AND GPIO buttons: all players get both input methods
- Screen 1: 13"+ capacitive touchscreen (HDMI + USB for touch)
- Screen 2: 21"–27" standard HDMI monitor (non-touch, nickname display)
- Stand: tilted lectern recommended for best quiz UX
- Region: Czech Republic primary, DACH/Amazon secondary
- Podiums: 8 total, manual covers 1 + cloning section
