/**
 * quiz-storage.js - Завантаження та збереження квізів з диску
 *
 * Відповідає за:
 * - Сканування директорії quizzes/ для JSON файлів
 * - Завантаження та валідацію квізів (стандартних і categoryMode)
 * - Збереження квізу на диск
 * - Видалення квізу з диску
 */

const fs = require('fs');
const path = require('path');
const { log } = require('./utils');

// Шлях до директорії з квізами (відносно кореня проєкту)
const QUIZZES_DIR = process.env.TEST_QUIZZES_DIR || path.join(__dirname, '..', '..', 'quizzes');

/**
 * Перевіряє чи квіз є валідним (стандартний або categoryMode)
 *
 * @param {Object} quiz - Об'єкт квізу
 * @returns {boolean}
 */
function isValidQuiz(quiz) {
  if (!quiz.title) return false;
  if (quiz.categoryMode) {
    return Array.isArray(quiz.rounds) && quiz.rounds.length > 0;
  }
  return Array.isArray(quiz.questions) && quiz.questions.length > 0;
}

/**
 * Завантажує всі квізи з директорії quizzes/
 *
 * Читає всі .json файли в директорії quizzes/ і повертає
 * масив валідних квізів. Невалідні файли пропускаються з попередженням.
 * Підтримує стандартні квізи (questions[]) і categoryMode (rounds[]).
 *
 * @returns {Array} Масив об'єктів квізів
 */
function loadAllQuizzes() {
  const quizzes = [];

  // Перевіряємо що директорія існує
  if (!fs.existsSync(QUIZZES_DIR)) {
    log('Storage', `Директорія quizzes/ не знайдена: ${QUIZZES_DIR}`);
    return quizzes;
  }

  // Читаємо всі файли в директорії
  const files = fs.readdirSync(QUIZZES_DIR).filter(f => f.endsWith('.json') && f !== 'README.json');

  for (const filename of files) {
    const filePath = path.join(QUIZZES_DIR, filename);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const quiz = JSON.parse(raw);

      // Базова валідація (стандартний або categoryMode)
      if (!isValidQuiz(quiz)) {
        log('Storage', `Пропускаємо невалідний квіз: ${filename}`);
        continue;
      }

      // Додаємо унікальний id якщо відсутній
      if (!quiz.id) {
        quiz.id = filename.replace('.json', '');
      }

      quizzes.push(quiz);

      const count = quiz.categoryMode
        ? `${quiz.rounds.length} раундів`
        : `${quiz.questions.length} питань`;
      log('Storage', `Завантажено квіз: "${quiz.title}" (${count})`);

    } catch (err) {
      log('Storage', `Помилка при завантаженні ${filename}: ${err.message}`);
    }
  }

  log('Storage', `Завантажено ${quizzes.length} квізів`);
  return quizzes;
}

/**
 * Завантажує один квіз за назвою файлу або id
 *
 * @param {string} quizId - ID квізу (назва файлу без .json)
 * @returns {Object|null} Об'єкт квізу або null якщо не знайдено
 */
function loadQuizById(quizId) {
  const filePath = path.join(QUIZZES_DIR, `${quizId}.json`);

  if (!fs.existsSync(filePath)) {
    log('Storage', `Квіз "${quizId}" не знайдено`);
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const quiz = JSON.parse(raw);
    if (!quiz.id) quiz.id = quizId;
    return quiz;
  } catch (err) {
    log('Storage', `Помилка при завантаженні квізу "${quizId}": ${err.message}`);
    return null;
  }
}

/**
 * Перетворює назву квізу у безпечну назву файлу
 *
 * Наприклад: "Мій Квіз #1!" → "mii-kviz-1"
 *
 * @param {string} title - Назва квізу
 * @returns {string} Безпечна назва файлу без розширення
 */
function titleToFilename(title) {
  return title
    .toLowerCase()
    .replace(/\s+/g, '-')       // пробіли → дефіси
    .replace(/[^\w\u0400-\u04ff-]/g, '') // видаляємо спецсимволи (залишаємо кирилицю)
    .replace(/-+/g, '-')        // кілька дефісів → один
    .replace(/^-|-$/g, '')      // дефіси на початку/кінці
    || 'quiz';
}

/**
 * Зберігає квіз на диск у директорію quizzes/
 *
 * Якщо файл з такою назвою вже існує — додає суфікс -2, -3, тощо.
 * Повертає id збереженого квізу.
 *
 * @param {Object} quizData - Дані квізу (title + questions або rounds)
 * @returns {{ id: string, filename: string }} ID та ім'я файлу
 * @throws {Error} Якщо квіз невалідний або не вдалося зберегти
 */
function saveQuiz(quizData) {
  if (!isValidQuiz(quizData)) {
    throw new Error('Невалідний квіз: відсутній title або питання/раунди');
  }

  // Переконуємось що директорія існує
  if (!fs.existsSync(QUIZZES_DIR)) {
    fs.mkdirSync(QUIZZES_DIR, { recursive: true });
  }

  // Генеруємо базову назву файлу з title
  const baseName = titleToFilename(quizData.title);

  // Знаходимо вільну назву (якщо файл вже є — додаємо -2, -3...)
  let filename = `${baseName}.json`;
  let counter = 2;
  while (fs.existsSync(path.join(QUIZZES_DIR, filename))) {
    filename = `${baseName}-${counter}.json`;
    counter++;
  }

  const id = filename.replace('.json', '');

  // Зберігаємо з id всередині файлу
  const dataToSave = { ...quizData, id };
  fs.writeFileSync(
    path.join(QUIZZES_DIR, filename),
    JSON.stringify(dataToSave, null, 2),
    'utf8'
  );

  log('Storage', `Збережено квіз "${quizData.title}" → ${filename}`);
  return { id, filename };
}

/**
 * Видаляє квіз з диску за його id
 *
 * @param {string} quizId - ID квізу (назва файлу без .json)
 * @returns {boolean} true якщо видалено, false якщо файл не знайдено
 */
function deleteQuiz(quizId) {
  // Захист від path traversal
  const safe = path.basename(quizId);
  const filePath = path.join(QUIZZES_DIR, `${safe}.json`);

  if (!fs.existsSync(filePath)) {
    log('Storage', `Видалення: квіз "${quizId}" не знайдено`);
    return false;
  }

  fs.unlinkSync(filePath);
  log('Storage', `Видалено квіз: ${quizId}`);
  return true;
}

module.exports = { loadAllQuizzes, loadQuizById, saveQuiz, deleteQuiz };
