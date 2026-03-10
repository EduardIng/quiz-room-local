/**
 * sound.js - Звукові ефекти через Web Audio API
 *
 * Синтезує звуки програмно — не потребує MP3 файлів.
 * Працює в будь-якому сучасному браузері.
 *
 * Звуки:
 * - playCorrect()  — радісний акорд (правильна відповідь)
 * - playWrong()    — низький сигнал (неправильна відповідь)
 * - playTimeout()  — швидкий бузер (час вийшов)
 * - playTick()     — тихий клік (таймер < 5 сек)
 * - playCountdown() — чіткий бiп для відліку 3-2-1
 *
 * Використання:
 *   import { playCorrect } from '../utils/sound.js';
 *   playCorrect();
 */

// Lazy-ініціалізація AudioContext (можна створити лише після першої взаємодії користувача)
let audioCtx = null;

/**
 * Повертає (або створює) глобальний AudioContext
 * Браузери вимагають щоб AudioContext був створений після дії користувача
 *
 * @returns {AudioContext|null} AudioContext або null якщо не підтримується
 */
function getCtx() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  // Відновлюємо якщо браузер призупинив (autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Відтворює простий тон через Web Audio API
 *
 * @param {number} frequency   - Частота в герцах (наприклад 440 = нота A4)
 * @param {number} duration    - Тривалість в секундах
 * @param {number} volume      - Гучність 0.0–1.0
 * @param {string} type        - Тип осцилятора: 'sine' | 'square' | 'sawtooth' | 'triangle'
 * @param {number} startDelay  - Затримка перед відтворенням в секундах
 */
function playTone(frequency, duration, volume = 0.3, type = 'sine', startDelay = 0) {
  const ctx = getCtx();
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  // З'єднуємо осцилятор → gainNode → вихід
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + startDelay);

  const start = ctx.currentTime + startDelay;
  const end = start + duration;

  // Плавне затухання в кінці (уникаємо клацання)
  gainNode.gain.setValueAtTime(volume, start);
  gainNode.gain.exponentialRampToValueAtTime(0.001, end);

  oscillator.start(start);
  oscillator.stop(end);
}

// ─────────────────────────────────────────────
// ПУБЛІЧНІ ФУНКЦІЇ
// ─────────────────────────────────────────────

/**
 * Звук правильної відповіді — висхідний акорд (до-мі-соль)
 * Грає три ноти послідовно зі зростаючою висотою
 */
export function playCorrect() {
  // До4 → Мі4 → Соль4 → До5 (мажорний акорд)
  playTone(523, 0.12, 0.25, 'sine', 0.0);
  playTone(659, 0.12, 0.25, 'sine', 0.1);
  playTone(784, 0.12, 0.25, 'sine', 0.2);
  playTone(1047, 0.25, 0.3,  'sine', 0.3);
}

/**
 * Звук неправильної відповіді — низький бузер, що знижується
 */
export function playWrong() {
  // Низький спадний тон
  const ctx = getCtx();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(300, ctx.currentTime);
  // Плавно знижуємо частоту для ефекту "бузера"
  osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.3);

  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.35);
}

/**
 * Звук закінчення часу — швидкі три низькі імпульси
 */
export function playTimeout() {
  playTone(200, 0.08, 0.25, 'square', 0.0);
  playTone(200, 0.08, 0.25, 'square', 0.1);
  playTone(160, 0.15, 0.3,  'square', 0.2);
}

/**
 * Тихий клік-таймер — короткий клік для зворотного відліку < 5 сек
 */
export function playTick() {
  playTone(1200, 0.04, 0.1, 'sine', 0);
}

/**
 * Звук відліку 3-2-1 — чіткий бiп, трохи нижче ніж tick
 */
export function playCountdown() {
  playTone(880, 0.1, 0.2, 'sine', 0);
}

/**
 * Урочистий фінальний звук — для завершення квізу
 */
export function playFinish() {
  // До-мі-соль-до (октава) з акцентом
  playTone(523,  0.15, 0.3, 'sine', 0.0);
  playTone(659,  0.15, 0.3, 'sine', 0.15);
  playTone(784,  0.15, 0.3, 'sine', 0.3);
  playTone(1047, 0.4,  0.4, 'sine', 0.45);
}
