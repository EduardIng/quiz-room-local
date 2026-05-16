#!/bin/bash
# kiosk.sh — запускає Chromium у режимі кіоську
#
# PlayerView — інтерфейс гравця на під'єднаному HDMI виході
# SideMonitor — нікнейм гравця (тільки якщо є другий дисплей)
#
# Запускається автоматично при вході в систему через autostart
# Сервер квізу: port 8080 (Express статика + WebSocket)
# Фронтенд: статична збірка у frontend/build/, роздає Express

CHROMIUM=/usr/bin/chromium
QUIZ_SERVER="http://localhost:8080"

# X session script — гарантуємо DISPLAY встановлено для xset/xrandr
export DISPLAY=${DISPLAY:-:0}

# Вимикаємо заставку та енергозбереження дисплея назавжди
xset s off
xset -dpms
xset s noblank

# Робимо під'єднаний HDMI основним дисплеєм. На rpi1 HDMI-1 від'єднаний,
# тому primary за замовчуванням стоїть на ньому — це збиває Chromium і
# вікно займає лише половину екрану. Перевизначаємо primary на справді
# під'єднаний вихід.
CONNECTED_OUTPUT=$(xrandr --query | awk '/ connected/ {print $1; exit}')
if [ -n "$CONNECTED_OUTPUT" ]; then
  xrandr --output "$CONNECTED_OUTPUT" --primary
fi

# Розмір екрану під'єднаного дисплею (для --window-size)
SCREEN_GEOMETRY=$(xrandr --query | awk '/ connected/ && /\+0\+0/ {for(i=1;i<=NF;i++) if($i ~ /^[0-9]+x[0-9]+\+/) {split($i,a,"+"); print a[1]; exit}}')
SCREEN_W=${SCREEN_GEOMETRY%x*}
SCREEN_H=${SCREEN_GEOMETRY#*x}
: "${SCREEN_W:=1920}"
: "${SCREEN_H:=1080}"

# Прапори Chromium:
# --disable-gpu вимикає GPU рендеринг — Pi 5 з --use-angle=gles
# (інжектує обгортка) дає некоректні пікселі (білі квадрати замість
# фіолетових кружечків, невидимий текст). Software rasterization
# для цього UI достатньо швидкий.
# --window-size + --window-position потрібні, бо без віконного
# менеджера --kiosk сам по собі не розгортає вікно на весь екран.
CHROMIUM_FLAGS="--noerrdialogs --disable-infobars --no-first-run \
  --disable-translate --disable-features=TranslateUI \
  --disable-pinch --overscroll-history-navigation=0 \
  --disable-session-crashed-bubble --disable-restore-session-state \
  --disable-gpu \
  --window-size=${SCREEN_W},${SCREEN_H} --window-position=0,0"

# Чекаємо доки сервер запуститься
until curl -s "$QUIZ_SERVER" > /dev/null 2>&1; do
  echo "Очікуємо сервер квізу..."
  sleep 2
done

# Запускаємо PlayerView на основному дисплеї
DISPLAY=:0 "$CHROMIUM" \
  --kiosk \
  $CHROMIUM_FLAGS \
  "$QUIZ_SERVER/#/" &

# SideMonitor на DISPLAY=:1 — запускаємо тільки якщо другий X-сервер
# реально існує (для конфігурацій з двома моніторами на одному Pi).
if [ -e /tmp/.X1-lock ] || xdpyinfo -display :1 >/dev/null 2>&1; then
  sleep 2
  DISPLAY=:1 "$CHROMIUM" \
    --kiosk \
    $CHROMIUM_FLAGS \
    "$QUIZ_SERVER/#/side" &
fi

# GPIO сервіс — запускаємо тільки якщо файл існує (на тестових Pi може
# бути відсутнім)
if [ -f /home/admin/quiz-room-local/pi-setup/gpio-service.py ]; then
  python3 /home/admin/quiz-room-local/pi-setup/gpio-service.py &
fi

# Чекаємо завершення всіх процесів (нескінченно — кіоск режим)
wait
