#!/bin/bash
# kiosk.sh — запускає Chromium у режимі кіоську на двох дисплеях
#
# Дисплей 1 (HDMI-1): PlayerView — інтерфейс гравця
# Дисплей 2 (HDMI-2): SideMonitor — нікнейм гравця
#
# Запускається автоматично при вході в систему через autostart
# Сервер квізу: port 8080 (Express статика + WebSocket)
# Фронтенд: статична збірка у frontend/build/, роздає Express

QUIZ_SERVER="http://localhost:8080"
CHROMIUM_FLAGS="--noerrdialogs --disable-infobars --no-first-run \
  --disable-translate --disable-features=TranslateUI \
  --disable-pinch --overscroll-history-navigation=0 \
  --disable-session-crashed-bubble --disable-restore-session-state"

# Чекаємо доки сервер запуститься
until curl -s "$QUIZ_SERVER" > /dev/null 2>&1; do
  echo "Очікуємо сервер квізу..."
  sleep 2
done

# Запускаємо PlayerView на HDMI-1 (основний дисплей :0)
DISPLAY=:0 chromium-browser \
  --kiosk \
  $CHROMIUM_FLAGS \
  "$QUIZ_SERVER/#/" &

# Чекаємо 2 секунди перед запуском другого вікна
sleep 2

# Запускаємо SideMonitor на HDMI-2 (другий дисплей :1)
# Примітка: потребує налаштованого Xorg dual-head або окремого X сервера
DISPLAY=:1 chromium-browser \
  --kiosk \
  $CHROMIUM_FLAGS \
  "$QUIZ_SERVER/#/side" &

# Запускаємо GPIO сервіс
python3 /home/pi/quiz-room-local/pi-setup/gpio-service.py &

# Чекаємо завершення всіх процесів (нескінченно — кіоск режим)
wait
