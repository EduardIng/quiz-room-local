#!/bin/bash
# install.sh — одноразове налаштування Raspberry Pi для кіоську
# Запускати від імені pi користувача: bash install.sh

set -e
echo "=== Quiz Room Local — Налаштування кіоску ==="

# Оновлення системи
sudo apt-get update -q
sudo apt-get upgrade -y -q

# Встановлення залежностей
sudo apt-get install -y -q \
  chromium-browser \
  python3-pip \
  unclutter \
  xdotool \
  nodejs \
  npm

# Встановлення Python залежностей для GPIO сервісу
pip3 install python-socketio[client] websocket-client RPi.GPIO

# Встановлення Node залежностей і збірка фронтенду
cd /home/pi/quiz-room-local
npm install
cd frontend && npm install && npm run build
cd /home/pi/quiz-room-local

# Вимкнення screensaver та power management
sudo raspi-config nonint do_blanking 1

# Налаштування автозапуску
mkdir -p /home/pi/.config/autostart
cat > /home/pi/.config/autostart/quiz-kiosk.desktop << 'EOF'
[Desktop Entry]
Type=Application
Name=Quiz Kiosk
Exec=/home/pi/quiz-room-local/pi-setup/kiosk.sh
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
EOF

# Зробити скрипт виконуваним
chmod +x /home/pi/quiz-room-local/pi-setup/kiosk.sh

# Налаштування автовходу (без пароля)
sudo raspi-config nonint do_boot_behaviour B4

# Налаштування hostname (унікальний для кожного подіуму)
read -p "Введіть номер подіуму (1-8): " PODIUM_NUM
sudo hostnamectl set-hostname "podium-${PODIUM_NUM}"

echo "=== Встановлення завершено ==="
echo "Перезавантажте Pi: sudo reboot"
