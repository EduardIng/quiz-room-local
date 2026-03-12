#!/usr/bin/env python3
"""
gpio-service.py — GPIO кнопки → Socket.IO сервер квізу

Підключається до сервера квізу через Socket.IO.
Читає стан GPIO пінів (4 кнопки відповідей A/B/C/D).
При натисканні — надсилає подію podium-button-press на сервер.
Сервер визначає гравця за IP адресою і зараховує відповідь.

Запуск: python3 gpio-service.py
"""

import time
import logging
import socketio
import RPi.GPIO as GPIO

# ─── Конфігурація ───────────────────────────────────────────
SERVER_URL = 'http://localhost:8080'

# GPIO піни для кнопок A/B/C/D (BCM нумерація)
BUTTON_PINS = {
    0: 17,  # Кнопка A (червона)
    1: 27,  # Кнопка B (синя)
    2: 22,  # Кнопка C (зелена)
    3: 23,  # Кнопка D (помаранчева)
}

DEBOUNCE_MS = 300  # мінімальний інтервал між натисканнями (мс)
# ────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [GPIO] %(message)s'
)
log = logging.getLogger(__name__)

# Час останнього натискання для debounce
last_press = {i: 0 for i in BUTTON_PINS}

# Socket.IO клієнт
sio = socketio.Client(reconnection=True, reconnection_delay=2, reconnection_delay_max=30)


@sio.event
def connect():
    log.info('Підключено до сервера квізу')


@sio.event
def disconnect():
    log.info('Відключено від сервера. Спроба перепідключення...')


def make_button_callback(button_index):
    """Повертає callback для конкретної кнопки з debounce захистом"""
    def callback(channel):
        now = time.time() * 1000  # мс
        if now - last_press[button_index] < DEBOUNCE_MS:
            return  # ігноруємо відскок кнопки
        last_press[button_index] = now

        log.info(f'Кнопка {button_index} натиснута (GPIO {channel})')

        if sio.connected:
            sio.emit('podium-button-press', {'buttonIndex': button_index})
        else:
            log.warning('Сервер недоступний — натискання ігнорується')

    return callback


def setup_gpio():
    """Налаштовує GPIO піни з внутрішніми pull-up резисторами"""
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)

    for button_index, pin in BUTTON_PINS.items():
        GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        GPIO.add_event_detect(
            pin,
            GPIO.FALLING,  # натискання = LOW (кнопка підключена до GND)
            callback=make_button_callback(button_index),
            bouncetime=DEBOUNCE_MS
        )
        log.info(f'Кнопка {button_index} → GPIO{pin} готова')


def main():
    setup_gpio()

    log.info(f'Підключення до {SERVER_URL}...')
    try:
        sio.connect(SERVER_URL, transports=['websocket'])
        sio.wait()  # блокуємо основний потік, GPIO callbacks в окремих потоках
    except KeyboardInterrupt:
        log.info('Зупинка GPIO сервісу')
    finally:
        GPIO.cleanup()
        if sio.connected:
            sio.disconnect()


if __name__ == '__main__':
    main()
