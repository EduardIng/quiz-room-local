/**
 * utils.js - Допоміжні функції для всього проєкту
 *
 * Містить:
 * - Завантаження та валідація конфігурації
 * - Допоміжні функції для логування
 * - Інші утиліти загального використання
 */

const fs = require('fs');
const path = require('path');

// Шлях до файлу конфігурації (відносно кореня проєкту)
const CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');

/**
 * Значення за замовчуванням якщо config.json відсутній або неповний
 * Гарантує що сервер завжди запуститься навіть без конфіг-файлу
 */
const DEFAULT_CONFIG = {
  server: {
    port: 8080,
    host: '0.0.0.0'
  },
  quiz: {
    autoMode: true,
    questionTime: 30,      // секунд на відповідь
    answerRevealTime: 5,   // секунд показувати правильну відповідь
    leaderboardTime: 5,    // секунд показувати рейтинг
    autoStart: true,
    waitForAllPlayers: true,
    minPlayers: 1,
    maxPlayers: 8,
    shuffle: false         // перемішувати порядок питань перед початком
  },
  display: {
    fullscreen: true,
    fontSize: 'large'
  },
  sounds: {
    enabled: true,
    volume: 0.7
  }
};

/**
 * Завантажує та валідує конфігурацію з config.json
 *
 * Перевіряє:
 * - Чи існує файл config.json
 * - Чи всі значення правильного типу
 * - Чи значення в допустимих межах
 *
 * @returns {Object} Валідна конфігурація з defaults для відсутніх полів
 */
function loadConfig() {
  let userConfig = {};

  // Перевіряємо чи існує config.json
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      // Читаємо та парсимо JSON файл
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      userConfig = JSON.parse(raw);
    } catch (err) {
      console.warn(`[Config] Помилка читання config.json: ${err.message}`);
      console.warn('[Config] Використовуємо значення за замовчуванням');
    }
  } else {
    console.warn(`[Config] config.json не знайдено за шляхом ${CONFIG_PATH}`);
    console.warn('[Config] Використовуємо значення за замовчуванням');
  }

  // Глибоке об'єднання з дефолтами (defaults перезаписуються userConfig)
  const config = deepMerge(DEFAULT_CONFIG, userConfig);

  // Валідація та виправлення значень
  config.quiz.questionTime = clamp(config.quiz.questionTime, 10, 120);
  config.quiz.answerRevealTime = clamp(config.quiz.answerRevealTime, 2, 15);
  config.quiz.leaderboardTime = clamp(config.quiz.leaderboardTime, 2, 15);
  config.quiz.minPlayers = clamp(config.quiz.minPlayers, 1, 8);
  config.quiz.maxPlayers = clamp(config.quiz.maxPlayers, 1, 50);
  config.sounds.volume = clamp(config.sounds.volume, 0, 1);

  // Гарантуємо правильні типи для boolean полів
  config.quiz.autoMode = Boolean(config.quiz.autoMode);
  config.quiz.autoStart = Boolean(config.quiz.autoStart);
  config.quiz.waitForAllPlayers = Boolean(config.quiz.waitForAllPlayers);
  config.quiz.shuffle = Boolean(config.quiz.shuffle);
  config.display.fullscreen = Boolean(config.display.fullscreen);
  config.sounds.enabled = Boolean(config.sounds.enabled);

  // Гарантуємо що port є числом
  config.server.port = parseInt(config.server.port, 10) || 8080;

  return config;
}

/**
 * Обмежує число в діапазоні [min, max]
 *
 * @param {number} value - Вхідне значення
 * @param {number} min - Мінімальне допустиме значення
 * @param {number} max - Максимальне допустиме значення
 * @returns {number} Значення в межах [min, max]
 */
function clamp(value, min, max) {
  const num = Number(value);
  // Якщо не число - повертаємо мінімум
  if (isNaN(num)) return min;
  return Math.min(Math.max(num, min), max);
}

/**
 * Глибоке злиття двох об'єктів
 * Значення з source перезаписують значення з target
 *
 * @param {Object} target - Базовий об'єкт (дефолти)
 * @param {Object} source - Об'єкт з новими значеннями
 * @returns {Object} Новий об'єкт зі злитими значеннями
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      // Рекурсивно зливаємо вкладені об'єкти
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      // Просте значення - просто перезаписуємо
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Форматує поточний час для логів
 * Приклад: "[14:05:32]"
 *
 * @returns {string} Відформатований час
 */
function timestamp() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `[${h}:${m}:${s}]`;
}

/**
 * Логує повідомлення з мітками часу та категорії
 *
 * @param {string} category - Категорія (Server, Session, WS тощо)
 * @param {string} message - Повідомлення для логу
 */
function log(category, message) {
  console.log(`${timestamp()} [${category}] ${message}`);
}

module.exports = { loadConfig, log, timestamp };
