/**
 * quiz-session-auto.js - Серце автоматичної квіз-системи
 *
 * Цей файл реалізує машину станів (state machine) для одного квіз-сеансу.
 * Управляє всім ігровим процесом: від очікування гравців до фінального результату.
 *
 * Машина станів:
 * WAITING → STARTING → QUESTION → ANSWER_REVEAL → LEADERBOARD → (повтор) → ENDED
 *
 * Використання:
 *   const session = new AutoQuizSession(quizData, settings);
 *   session.init(io, roomCode);
 */

const { log } = require('./utils');

class AutoQuizSession {
  /**
   * Створює новий квіз-сеанс
   *
   * @param {Object} quizData - Дані квізу (title, questions)
   * @param {Object} settings - Налаштування таймерів та поведінки
   */
  constructor(quizData, settings, db = null) {
    // Category mode: uses rounds instead of flat questions array
    this.isCategoryMode = !!(quizData.categoryMode && quizData.rounds);
    this.rounds = this.isCategoryMode ? quizData.rounds : null;
    this.chooserIndex = 0;
    this.playerJoinOrder = [];
    this.currentChooserSocketId = null;
    this.categorySelectTimer = null;
    this.categorySelectTime = settings.categorySelectTime || 15;
    this.categoryChosenTime = settings.categoryChosenTime || 4;

    // Дані квізу: назва, питання
    // Якщо shuffle увімкнено — перемішуємо копію масиву питань (не змінюємо оригінал)
    // In category mode, questions array starts empty and is populated at runtime
    this.quizData = this.isCategoryMode
      ? { ...quizData, questions: [] }
      : (settings.shuffle
          ? { ...quizData, questions: this._shuffleArray([...quizData.questions]) }
          : quizData);

    // Налаштування: таймери, autoStart, waitForAllPlayers тощо
    this.settings = settings;

    // Поточний стан гри (машина станів)
    // Можливі значення: 'WAITING', 'STARTING', 'QUESTION', 'ANSWER_REVEAL', 'LEADERBOARD', 'ENDED'
    this.gameState = 'WAITING';

    // Індекс поточного питання (0-based)
    // -1 означає що гра ще не почалась
    this.currentQuestionIndex = -1;

    // Map гравців: socketId → { nickname, score, correctAnswers, totalAnswerTime, answers[] }
    this.players = new Map();

    // Map відповідей для поточного питання: socketId → { answerId, timestamp, timeSpent }
    this.currentAnswers = new Map();

    // Посилання на активний таймер (setTimeout)
    // Зберігаємо щоб можна було скасувати при потребі
    this.questionTimer = null;
    this.transitionTimer = null;

    // Час початку поточного питання (для розрахунку швидкості відповіді)
    this.questionStartTime = null;

    // ── Host Controls підтримка ──
    // isPaused: гра на паузі (зупинено таймер питання)
    this.isPaused = false;
    // Ліміт часу поточного питання (для розрахунку залишку при pause/resume)
    this.currentTimerLimit = 0;
    // Час що залишився при постановці на паузу
    this.questionTimeRemaining = 0;
    // Момент часу коли поставили на паузу
    this.pausedAt = null;

    // Socket.IO об'єкт (встановлюється через init())
    this.io = null;

    // Код кімнати (встановлюється через init())
    this.roomCode = null;

    // SQLite database (optional, for persistent storage)
    this.db = db;

    // Час початку квізу (для збереження в БД)
    this.startedAt = null;

    // Накопичена статистика по питаннях (для збереження в БД)
    this.collectedQuestionStats = [];

    log('Session', `Новий сеанс створено для квізу: "${quizData.title}"`);
  }

  /**
   * Ініціалізує сеанс з Socket.IO та кодом кімнати
   *
   * Викликається після створення сеансу, перед додаванням гравців.
   * Після init() сеанс готовий приймати гравців.
   *
   * @param {Object} io - Socket.IO сервер
   * @param {string} roomCode - Унікальний код кімнати (6 символів)
   */
  init(io, roomCode) {
    this.io = io;
    this.roomCode = roomCode;
    log('Session', `Сеанс ініціалізовано. Кімната: ${roomCode}`);
  }

  // ─────────────────────────────────────────────
  // УПРАВЛІННЯ ГРАВЦЯМИ
  // ─────────────────────────────────────────────

  /**
   * Додає нового гравця до сеансу
   *
   * Коли викликається:
   * - Гравець надсилає подію 'join-quiz' через WebSocket
   *
   * Що робить:
   * 1. Перевіряє чи можна приєднатись (стан WAITING, не перевищено maxPlayers)
   * 2. Додає гравця до Map
   * 3. Відправляє оновлений список гравців всій кімнаті
   * 4. Перевіряє умову autoStart
   *
   * Побічні ефекти:
   * - Broadcast PLAYER_JOINED до всіх в кімнаті
   * - Може запустити startQuiz() якщо умови autoStart виконані
   *
   * @param {string} socketId - Унікальний ID сокету гравця
   * @param {string} nickname - Псевдонім гравця (2-20 символів)
   * @returns {{ success: boolean, error?: string }}
   */
  addPlayer(socketId, nickname) {
    // Забороняємо приєднання якщо гра вже почалась
    if (this.gameState !== 'WAITING') {
      return { success: false, error: 'Гра вже почалась. Приєднання неможливе.' };
    }

    // Забороняємо приєднання якщо досягнуто максимальну кількість гравців
    if (this.players.size >= this.settings.maxPlayers) {
      return { success: false, error: `Кімната повна (максимум ${this.settings.maxPlayers} гравців)` };
    }

    // Перевіряємо чи nickname вже зайнятий
    for (const player of this.players.values()) {
      if (player.nickname.toLowerCase() === nickname.toLowerCase()) {
        return { success: false, error: `Нікнейм "${nickname}" вже зайнятий` };
      }
    }

    // Додаємо гравця до Map
    this.players.set(socketId, {
      nickname,
      score: 0,              // загальний рахунок
      correctAnswers: 0,     // кількість правильних відповідей
      totalAnswerTime: 0,    // сумарний час відповідей (для tiebreaker)
      answers: []            // історія відповідей по питаннях
    });

    // Track join order for category chooser rotation
    this.playerJoinOrder.push(socketId);

    log('Session', `Гравець "${nickname}" (${socketId}) приєднався. Гравців: ${this.players.size}`);

    // Повідомляємо всіх в кімнаті про нового гравця
    this.broadcast({
      type: 'PLAYER_JOINED',
      players: this._getPlayerList(),
      totalPlayers: this.players.size
    });

    // Перевіряємо умову autoStart:
    // Якщо autoStart увімкнено І кількість гравців досягла мінімуму → стартуємо
    if (this.settings.autoStart && this.players.size >= this.settings.minPlayers) {
      // Запускаємо з невеликою затримкою щоб гравець встиг отримати підтвердження
      setTimeout(() => this.startQuiz(), 500);
    }

    return { success: true };
  }

  /**
   * Видаляє гравця з сеансу (при відключенні)
   *
   * Коли викликається:
   * - Гравець закриває браузер або втрачає з'єднання
   *
   * Що робить:
   * 1. Видаляє гравця з Map
   * 2. Видаляє його відповідь якщо вона є (для поточного питання)
   * 3. Повідомляє інших гравців
   * 4. Якщо waitForAllPlayers і всі хто залишився відповіли → завершує питання
   *
   * Побічні ефекти:
   * - Broadcast PLAYER_LEFT до всіх в кімнаті
   * - Може завершити питання достроково
   *
   * @param {string} socketId - ID сокету гравця що відключився
   */
  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return; // Гравець не знайдений - нічого не робимо

    // Видаляємо гравця та його поточну відповідь
    this.players.delete(socketId);
    this.currentAnswers.delete(socketId);

    // Update join order tracking
    const joinIdx = this.playerJoinOrder.indexOf(socketId);
    if (joinIdx !== -1) {
      this.playerJoinOrder.splice(joinIdx, 1);
      // Keep chooserIndex valid after removal
      if (joinIdx < this.chooserIndex) {
        this.chooserIndex = Math.max(0, this.chooserIndex - 1);
      }
    }

    log('Session', `Гравець "${player.nickname}" відключився. Залишилось: ${this.players.size}`);

    // Якщо гравців не залишилось - нічого не broadcast
    if (this.players.size === 0) return;

    // Повідомляємо інших про від'єднання
    this.broadcast({
      type: 'PLAYER_LEFT',
      nickname: player.nickname,
      players: this._getPlayerList(),
      totalPlayers: this.players.size
    });

    // Якщо гра в процесі і стоїть умова waitForAllPlayers:
    // Перевіряємо чи всі хто залишився вже відповіли
    if (this.gameState === 'QUESTION' && this.settings.waitForAllPlayers) {
      if (this.allPlayersAnswered()) {
        log('Session', 'Всі гравці відповіли після відключення. Завершуємо питання достроково.');
        this.endQuestion();
      }
    }

    // If the chooser disconnected during CATEGORY_SELECT, auto-resolve
    if (this.gameState === 'CATEGORY_SELECT' && socketId === this.currentChooserSocketId) {
      clearTimeout(this.categorySelectTimer);
      this.categorySelectTimer = null;
      const roundIndex = this.currentQuestionIndex + 1;
      const randomChoice = Math.floor(Math.random() * 2);
      this._resolveCategory(roundIndex, randomChoice, true);
    }
  }

  /**
   * Перевіряє чи всі активні гравці вже відповіли на поточне питання
   *
   * @returns {boolean} true якщо всі відповіли, false якщо є хто ще не відповів
   */
  allPlayersAnswered() {
    if (this.players.size === 0) return false;
    // Порівнюємо кількість відповідей з кількістю гравців
    return this.currentAnswers.size >= this.players.size;
  }

  // ─────────────────────────────────────────────
  // ІГРОВИЙ ПРОЦЕС (GAME FLOW)
  // ─────────────────────────────────────────────

  /**
   * Запускає квіз з 3-секундним відліком
   *
   * Коли викликається:
   * - Автоматично якщо autoStart = true і players >= minPlayers
   * - Або вручну адміністратором
   *
   * Що робить:
   * 1. Перевіряє що стан WAITING
   * 2. Переводить стан в STARTING
   * 3. Broadcast QUIZ_STARTING з відліком 3
   * 4. Через 3 секунди викликає nextQuestion()
   *
   * Побічні ефекти:
   * - Змінює gameState на 'STARTING'
   * - Broadcast QUIZ_STARTING
   * - Запускає таймер на 3 секунди
   */
  startQuiz() {
    // Запобігаємо подвійному запуску
    if (this.gameState !== 'WAITING') {
      log('Session', `startQuiz() ігнорується - поточний стан: ${this.gameState}`);
      return;
    }

    this.gameState = 'STARTING';
    this.startedAt = Date.now();
    log('Session', `Квіз "${this.quizData.title}" починається! Відлік 3 секунди...`);

    const totalQuestions = this.isCategoryMode ? this.rounds.length : this.quizData.questions.length;

    // Відправляємо сигнал початку з відліком
    this.broadcast({
      type: 'QUIZ_STARTING',
      countdown: 3,
      quizTitle: this.quizData.title,
      totalQuestions
    });

    // Чекаємо 3 секунди і переходимо до першого питання/вибору категорії
    this.transitionTimer = setTimeout(() => {
      if (this.isCategoryMode) {
        this.startCategorySelect();
      } else {
        this.nextQuestion();
      }
    }, 3000);
  }

  /**
   * Переходить до наступного питання
   *
   * Коли викликається:
   * - Після відліку 3 секунди (перше питання)
   * - Після LEADERBOARD (наступні питання)
   *
   * Що робить:
   * 1. Збільшує індекс питання
   * 2. Якщо питання закінчились → endQuiz()
   * 3. Очищає відповіді попереднього питання
   * 4. Переводить стан в QUESTION
   * 5. Broadcast NEW_QUESTION з даними питання
   * 6. Запускає таймер питання
   *
   * Побічні ефекти:
   * - Змінює gameState на 'QUESTION'
   * - Очищає currentAnswers Map
   * - Broadcast NEW_QUESTION
   * - Запускає questionTimer
   */
  nextQuestion() {
    // Переходимо до наступного питання
    this.currentQuestionIndex++;

    const totalQuestions = this.isCategoryMode ? this.rounds.length : this.quizData.questions.length;

    // Перевіряємо чи є ще питання
    if (this.currentQuestionIndex >= totalQuestions) {
      // Всі питання пройдено - завершуємо квіз
      this.endQuiz();
      return;
    }

    // Очищаємо відповіді з попереднього питання
    this.currentAnswers.clear();

    // Змінюємо стан на QUESTION
    this.gameState = 'QUESTION';

    // Запам'ятовуємо час початку питання для розрахунку швидкості
    this.questionStartTime = Date.now();

    const question = this.getCurrentQuestion();
    const timeLimit = question.timeLimit || this.settings.questionTime;

    // Запам'ятовуємо ліміт часу для підтримки pause/resume
    this.currentTimerLimit = timeLimit;
    this.questionTimeRemaining = timeLimit;
    this.isPaused = false;

    log('Session', `Питання ${this.currentQuestionIndex + 1}/${totalQuestions}: "${question.question}"`);

    // Відправляємо питання всім гравцям
    // ВАЖЛИВО: відправляємо тільки варіанти відповідей БЕЗ правильної відповіді
    this.broadcast({
      type: 'NEW_QUESTION',
      questionIndex: this.currentQuestionIndex + 1,  // 1-based для відображення
      totalQuestions,
      question: {
        text: question.question,
        answers: question.answers.map((text, id) => ({ id, text })),
        ...(question.image ? { image: question.image } : {}),
        ...(question.audio ? { audio: question.audio } : {})
      },
      timeLimit
    });

    // Запускаємо таймер питання
    this.startQuestionTimer(timeLimit);
  }

  /**
   * Завершує поточне питання і показує правильну відповідь
   *
   * Викликається автоматично коли:
   * - Закінчився таймер питання, АБО
   * - Всі гравці відповіли (якщо waitForAllPlayers = true)
   *
   * Що робить:
   * 1. Зупиняє таймер питання
   * 2. Обчислює статистику відповідей
   * 3. Оновлює бали гравців
   * 4. Відправляє REVEAL_ANSWER всім клієнтам
   * 5. Планує показ leaderboard через answerRevealTime секунд
   *
   * Побічні ефекти:
   * - Змінює gameState на 'ANSWER_REVEAL'
   * - Broadcast REVEAL_ANSWER до всіх гравців
   * - Запускає таймер для showLeaderboard()
   */
  endQuestion() {
    // Перевіряємо що ми в стані QUESTION (захист від подвійного виклику)
    if (this.gameState !== 'QUESTION') return;

    // Зупиняємо таймер щоб не спрацював двічі
    clearTimeout(this.questionTimer);
    this.questionTimer = null;

    // Змінюємо стан гри
    this.gameState = 'ANSWER_REVEAL';

    const question = this.getCurrentQuestion();
    const correctAnswerId = question.correctAnswer;

    log('Session', `Питання завершено. Правильна відповідь: ${correctAnswerId} ("${question.answers[correctAnswerId]}")`);

    // Оновлюємо бали гравців та отримуємо результати
    const playerResults = this.updatePlayerScores(correctAnswerId);

    // Обчислюємо статистику відповідей (скільки гравців обрали кожен варіант)
    const statistics = this._calculateAnswerStatistics(correctAnswerId);

    // Зберігаємо статистику питання для БД
    this.collectedQuestionStats.push(statistics);

    // Відправляємо результат питання всім гравцям
    this.broadcast({
      type: 'REVEAL_ANSWER',
      correctAnswer: correctAnswerId,
      statistics,
      playerResults
    });

    // Плануємо показ leaderboard через answerRevealTime секунд
    this.transitionTimer = setTimeout(() => {
      this.showLeaderboard();
    }, this.settings.answerRevealTime * 1000);
  }

  /**
   * Показує поточний рейтинг гравців між питаннями
   *
   * Коли викликається:
   * - Автоматично через answerRevealTime секунд після REVEAL_ANSWER
   *
   * Що робить:
   * 1. Переводить стан в LEADERBOARD
   * 2. Обчислює та сортує рейтинг
   * 3. Broadcast SHOW_LEADERBOARD з позиціями гравців
   * 4. Планує nextQuestion() або endQuiz() через leaderboardTime секунд
   *
   * Побічні ефекти:
   * - Змінює gameState на 'LEADERBOARD'
   * - Broadcast SHOW_LEADERBOARD
   * - Запускає таймер для наступного кроку
   */
  showLeaderboard() {
    this.gameState = 'LEADERBOARD';

    const totalQuestions = this.isCategoryMode ? this.rounds.length : this.quizData.questions.length;
    const leaderboard = this.calculateLeaderboard();
    const isLastQuestion = this.currentQuestionIndex >= totalQuestions - 1;

    log('Session', `Leaderboard. Лідер: "${leaderboard[0]?.nickname}" (${leaderboard[0]?.score} балів)`);

    this.broadcast({
      type: 'SHOW_LEADERBOARD',
      leaderboard,
      questionIndex: this.currentQuestionIndex + 1,
      totalQuestions,
      isLastQuestion
    });

    // Плануємо перехід до наступного кроку через leaderboardTime секунд
    this.transitionTimer = setTimeout(() => {
      if (isLastQuestion) {
        this.endQuiz();
      } else if (this.isCategoryMode) {
        this.startCategorySelect();
      } else {
        this.nextQuestion();
      }
    }, this.settings.leaderboardTime * 1000);
  }

  // ─────────────────────────────────────────────
  // CATEGORY MODE МЕТОДИ
  // ─────────────────────────────────────────────

  /**
   * Починає вибір категорії — переводить гру в стан CATEGORY_SELECT
   */
  startCategorySelect() {
    this.gameState = 'CATEGORY_SELECT';

    const roundIndex = this.currentQuestionIndex + 1; // next round (0-based index into rounds)

    // Get active players in join order
    const activeIds = this.playerJoinOrder.filter(id => this.players.has(id));
    if (activeIds.length === 0) {
      this.endQuiz();
      return;
    }

    const chooserSocketId = activeIds[this.chooserIndex % activeIds.length];
    this.currentChooserSocketId = chooserSocketId;
    const chooserPlayer = this.players.get(chooserSocketId);
    const chooserNickname = chooserPlayer ? chooserPlayer.nickname : '';

    const round = this.rounds[roundIndex];
    const options = round.options.map((opt, idx) => ({ index: idx, category: opt.category }));

    log('Session', `CATEGORY_SELECT: раунд ${roundIndex + 1}, chooser="${chooserNickname}"`);

    this.broadcast({
      type: 'CATEGORY_SELECT',
      chooserNickname,
      options,
      roundIndex: roundIndex + 1,     // 1-based for display
      totalRounds: this.rounds.length,
      timeLimit: this.categorySelectTime
    });

    // Auto-resolve on timeout
    this.categorySelectTimer = setTimeout(() => {
      const randomChoice = Math.floor(Math.random() * 2);
      this._resolveCategory(roundIndex, randomChoice, true);
    }, this.categorySelectTime * 1000);
  }

  /**
   * Обробляє вибір категорії гравцем
   *
   * @param {string} socketId - ID гравця що обирає
   * @param {number} choiceIndex - 0 або 1
   * @returns {{ success: boolean, error?: string }}
   */
  submitCategory(socketId, choiceIndex) {
    if (this.gameState !== 'CATEGORY_SELECT') {
      return { success: false, error: 'Зараз не час для вибору категорії' };
    }
    if (socketId !== this.currentChooserSocketId) {
      return { success: false, error: 'Зараз не твоя черга обирати' };
    }
    if (choiceIndex !== 0 && choiceIndex !== 1) {
      return { success: false, error: 'choiceIndex має бути 0 або 1' };
    }

    clearTimeout(this.categorySelectTimer);
    this.categorySelectTimer = null;

    const roundIndex = this.currentQuestionIndex + 1;
    this._resolveCategory(roundIndex, choiceIndex, false);

    return { success: true };
  }

  /**
   * Вирішує вибір категорії — будує питання, broadcast CATEGORY_CHOSEN, запускає nextQuestion
   *
   * @param {number} roundIndex - 0-based index into this.rounds
   * @param {number} choiceIndex - 0 or 1
   * @param {boolean} wasTimeout - чи вибір відбувся через таймаут
   */
  _resolveCategory(roundIndex, choiceIndex, wasTimeout) {
    this.chooserIndex++;

    const round = this.rounds[roundIndex];
    const option = round.options[choiceIndex];

    // Build question object from the chosen option
    const questionObj = {
      question: option.question,
      answers: option.answers,
      correctAnswer: option.correctAnswer,
      category: option.category
    };
    if (option.timeLimit) questionObj.timeLimit = option.timeLimit;
    if (option.image) questionObj.image = option.image;
    if (option.audio) questionObj.audio = option.audio;

    this.quizData.questions.push(questionObj);

    log('Session', `CATEGORY_CHOSEN: "${option.category}" (choiceIndex=${choiceIndex}, wasTimeout=${wasTimeout})`);

    this.broadcast({
      type: 'CATEGORY_CHOSEN',
      category: option.category,
      choiceIndex,
      wasTimeout
    });

    // Затримка перед показом питання — дає час гравцям побачити обрану категорію
    setTimeout(() => this.nextQuestion(), this.categoryChosenTime * 1000);
  }

  // ─────────────────────────────────────────────
  // HOST CONTROLS — ручне керування ведучим
  // ─────────────────────────────────────────────

  /**
   * Ставить питання на паузу — зупиняє таймер
   *
   * Може викликатись тільки в стані QUESTION і тільки якщо не на паузі.
   * Зберігає час що залишився для resume.
   * Broadcast: GAME_PAUSED до всіх клієнтів.
   *
   * @returns {{ success: boolean, error?: string }}
   */
  pauseGame() {
    if (this.gameState !== 'QUESTION') {
      return { success: false, error: 'Пауза можлива тільки під час питання' };
    }
    if (this.isPaused) {
      return { success: false, error: 'Гра вже на паузі' };
    }

    // Зупиняємо таймер
    clearTimeout(this.questionTimer);
    this.questionTimer = null;
    this.isPaused = true;
    this.pausedAt = Date.now();

    // Обчислюємо скільки часу залишилось
    const elapsed = (this.pausedAt - this.questionStartTime) / 1000;
    this.questionTimeRemaining = Math.max(0, this.currentTimerLimit - elapsed);

    log('Session', `Гра на паузі. Залишилось: ${Math.ceil(this.questionTimeRemaining)}с`);

    this.broadcast({
      type: 'GAME_PAUSED',
      timeRemaining: Math.ceil(this.questionTimeRemaining)
    });

    return { success: true };
  }

  /**
   * Відновлює питання після паузи
   *
   * Коригує questionStartTime щоб час відповіді гравців не включав тривалість паузи.
   * Перезапускає таймер на залишений час.
   * Broadcast: GAME_RESUMED до всіх клієнтів.
   *
   * @returns {{ success: boolean, error?: string }}
   */
  resumeGame() {
    if (!this.isPaused) {
      return { success: false, error: 'Гра не на паузі' };
    }

    this.isPaused = false;

    // Коригуємо questionStartTime:
    // elapsed_before_pause = currentTimerLimit - questionTimeRemaining
    // новий questionStartTime = now - elapsed_before_pause * 1000
    // → timeSpent для гравця що відповість зараз = elapsed_before_pause (правильно)
    const elapsedBeforePause = this.currentTimerLimit - this.questionTimeRemaining;
    this.questionStartTime = Date.now() - elapsedBeforePause * 1000;
    this.pausedAt = null;

    log('Session', `Гра відновлена. Залишилось: ${Math.ceil(this.questionTimeRemaining)}с`);

    // Перезапускаємо таймер на залишений час
    this.startQuestionTimer(this.questionTimeRemaining);

    this.broadcast({
      type: 'GAME_RESUMED',
      timeRemaining: Math.ceil(this.questionTimeRemaining)
    });

    return { success: true };
  }

  /**
   * Пропускає поточне питання або перехід між фазами
   *
   * Якщо в QUESTION → завершує питання достроково (показує відповідь).
   * Якщо в ANSWER_REVEAL → пропускає до leaderboard.
   * Якщо в LEADERBOARD → пропускає до наступного питання/кінця.
   * Якщо в CATEGORY_SELECT → авто-вибирає категорію.
   *
   * @returns {{ success: boolean, error?: string }}
   */
  skipQuestion() {
    if (this.gameState === 'QUESTION') {
      if (this.isPaused) this.isPaused = false;
      log('Session', 'Ведучий пропустив питання (endQuestion)');
      this.endQuestion();
      return { success: true };
    }

    if (this.gameState === 'ANSWER_REVEAL') {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
      log('Session', 'Ведучий пропустив reveal → leaderboard');
      this.showLeaderboard();
      return { success: true };
    }

    if (this.gameState === 'LEADERBOARD') {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
      const totalQuestions = this.isCategoryMode ? this.rounds.length : this.quizData.questions.length;
      const isLast = this.currentQuestionIndex >= totalQuestions - 1;
      log('Session', 'Ведучий пропустив leaderboard');
      if (isLast) {
        this.endQuiz();
      } else if (this.isCategoryMode) {
        this.startCategorySelect();
      } else {
        this.nextQuestion();
      }
      return { success: true };
    }

    if (this.gameState === 'CATEGORY_SELECT') {
      clearTimeout(this.categorySelectTimer);
      this.categorySelectTimer = null;
      const roundIndex = this.currentQuestionIndex + 1;
      const randomChoice = Math.floor(Math.random() * 2);
      log('Session', 'Ведучий пропустив вибір категорії — авто-вибір');
      this._resolveCategory(roundIndex, randomChoice, true);
      return { success: true };
    }

    return { success: false, error: `Неможливо пропустити в стані ${this.gameState}` };
  }

  /**
   * Примусово стартує квіз незалежно від кількості гравців
   *
   * Корисно коли autoStart вимкнений або minPlayers ще не досягнуто.
   *
   * @returns {{ success: boolean, error?: string }}
   */
  forceStart() {
    if (this.gameState !== 'WAITING') {
      return { success: false, error: `Гра вже почалась (стан: ${this.gameState})` };
    }
    log('Session', 'Примусовий старт від ведучого');
    this.startQuiz();
    return { success: true };
  }

  /**
   * Завершує квіз і показує фінальний результат
   *
   * Коли викликається:
   * - Після показу leaderboard після останнього питання
   *
   * Що робить:
   * 1. Зупиняє всі таймери
   * 2. Переводить стан в ENDED
   * 3. Broadcast QUIZ_ENDED з фінальним рейтингом
   *
   * Побічні ефекти:
   * - Змінює gameState на 'ENDED'
   * - Broadcast QUIZ_ENDED
   * - Очищає всі активні таймери
   */
  endQuiz() {
    // Зупиняємо всі активні таймери
    clearTimeout(this.questionTimer);
    clearTimeout(this.transitionTimer);
    clearTimeout(this.categorySelectTimer);
    this.questionTimer = null;
    this.transitionTimer = null;
    this.categorySelectTimer = null;

    this.gameState = 'ENDED';

    const finalLeaderboard = this.calculateLeaderboard();

    log('Session', `Квіз завершено! Переможець: "${finalLeaderboard[0]?.nickname}" (${finalLeaderboard[0]?.score} балів)`);

    this.broadcast({
      type: 'QUIZ_ENDED',
      finalLeaderboard,
      totalQuestions: this.quizData.questions.length
    });

    // Persist session to SQLite if db is available
    if (this.db && this.startedAt) {
      this.db.saveSession(
        this.roomCode,
        this.quizData.title,
        this.startedAt,
        Date.now(),
        this.quizData.questions.length,
        finalLeaderboard,
        this.collectedQuestionStats
      );
    }
  }

  // ─────────────────────────────────────────────
  // ОБРОБКА ВІДПОВІДЕЙ
  // ─────────────────────────────────────────────

  /**
   * Приймає відповідь гравця на поточне питання
   *
   * Коли викликається:
   * - Гравець натискає кнопку відповіді
   * - Подія 'submit-answer' через WebSocket
   *
   * Що робить:
   * 1. Валідує стан (тільки в QUESTION можна відповідати)
   * 2. Валідує гравця (повинен бути в кімнаті)
   * 3. Валідує що ще не відповідав
   * 4. Зберігає відповідь з часом
   * 5. Broadcast оновлений лічильник відповідей
   * 6. Якщо всі відповіли і waitForAllPlayers → завершує питання
   *
   * Побічні ефекти:
   * - Зберігає відповідь в currentAnswers Map
   * - Broadcast ANSWER_COUNT
   * - Може завершити питання достроково через endQuestion()
   *
   * @param {string} socketId - ID гравця що відповідає
   * @param {number} answerId - Індекс обраної відповіді (0-3)
   * @param {number} timestamp - Час отримання відповіді на сервері (Date.now())
   * @returns {{ success: boolean, error?: string }}
   */
  submitAnswer(socketId, answerId, timestamp) {
    // Перевірка стану: відповіді приймаються тільки під час QUESTION
    if (this.gameState !== 'QUESTION') {
      return { success: false, error: 'Зараз не час для відповідей' };
    }

    // Перевірка що гравець є в кімнаті
    if (!this.players.has(socketId)) {
      return { success: false, error: 'Гравець не знайдений в цій кімнаті' };
    }

    // Перевірка що гравець ще не відповідав на це питання
    if (this.currentAnswers.has(socketId)) {
      return { success: false, error: 'Ви вже відповіли на це питання' };
    }

    // Обчислюємо час відповіді в секундах від початку питання
    const timeSpent = Math.max(0, (timestamp - this.questionStartTime) / 1000);

    // Зберігаємо відповідь
    this.currentAnswers.set(socketId, {
      answerId,
      timestamp,
      timeSpent
    });

    const player = this.players.get(socketId);
    log('Session', `Відповідь від "${player.nickname}": варіант ${answerId} (${timeSpent.toFixed(1)}с)`);

    // Оновлюємо лічильник відповідей для всіх
    this.broadcast({
      type: 'ANSWER_COUNT',
      answered: this.currentAnswers.size,
      total: this.players.size
    });

    // Якщо waitForAllPlayers увімкнено і всі відповіли → завершуємо достроково
    if (this.settings.waitForAllPlayers && this.allPlayersAnswered()) {
      log('Session', 'Всі гравці відповіли. Завершуємо питання достроково.');
      this.endQuestion();
    }

    return { success: true };
  }

  // ─────────────────────────────────────────────
  // ТАЙМЕРИ
  // ─────────────────────────────────────────────

  /**
   * Запускає таймер зворотного відліку для поточного питання
   *
   * Коли викликається:
   * - Відразу після broadcast NEW_QUESTION в nextQuestion()
   *
   * Що робить:
   * 1. Зберігає посилання на setTimeout
   * 2. Через timeLimit секунд викликає endQuestion()
   *
   * Побічні ефекти:
   * - Зберігає таймер в this.questionTimer
   *
   * @param {number} timeLimit - Час на відповідь в секундах
   */
  startQuestionTimer(timeLimit) {
    // Очищаємо попередній таймер якщо є (захист від memory leak)
    clearTimeout(this.questionTimer);

    // Запускаємо таймер на timeLimit секунд
    this.questionTimer = setTimeout(() => {
      log('Session', `Час вийшов для питання ${this.currentQuestionIndex + 1}`);
      this.endQuestion();
    }, timeLimit * 1000);
  }

  // ─────────────────────────────────────────────
  // ПІДРАХУНОК БАЛІВ
  // ─────────────────────────────────────────────

  /**
   * Оновлює бали всіх гравців після завершення питання
   *
   * Формула нарахування балів:
   * - Правильна відповідь: 100 базових + (questionTime - timeSpent) * 2 бонусних
   * - Неправильна відповідь: 0 балів
   * - Немає відповіді: 0 балів
   *
   * @param {number} correctAnswerId - Індекс правильної відповіді (0-3)
   * @returns {Array} Масив результатів для кожного гравця
   */
  updatePlayerScores(correctAnswerId) {
    const playerResults = [];
    const questionTime = this.getCurrentQuestion().timeLimit || this.settings.questionTime;

    // Обходимо всіх гравців та рахуємо бали
    for (const [socketId, player] of this.players.entries()) {
      const answer = this.currentAnswers.get(socketId);

      if (!answer) {
        // Гравець не відповів (час вийшов)
        player.answers.push({ answerId: null, isCorrect: false, timeSpent: null, pointsEarned: 0 });
        playerResults.push({
          playerId: socketId,
          nickname: player.nickname,
          answerId: null,
          isCorrect: false,
          didNotAnswer: true,
          pointsEarned: 0
        });
        continue;
      }

      const isCorrect = answer.answerId === correctAnswerId;
      let pointsEarned = 0;

      if (isCorrect) {
        // Базові бали + бонус за швидкість
        const basePoints = 100;
        const timeBonus = Math.max(0, questionTime - answer.timeSpent) * 2;
        pointsEarned = Math.round(basePoints + timeBonus);

        // Оновлюємо статистику гравця
        player.score += pointsEarned;
        player.correctAnswers += 1;
        player.totalAnswerTime += answer.timeSpent;
      } else {
        // Неправильна відповідь - оновлюємо тільки час для tiebreaker
        player.totalAnswerTime += answer.timeSpent;
      }

      // Зберігаємо відповідь в historії гравця
      player.answers.push({
        answerId: answer.answerId,
        isCorrect,
        timeSpent: answer.timeSpent,
        pointsEarned
      });

      playerResults.push({
        playerId: socketId,
        nickname: player.nickname,
        answerId: answer.answerId,
        isCorrect,
        didNotAnswer: false,
        pointsEarned
      });
    }

    return playerResults;
  }

  /**
   * Обчислює та сортує поточний рейтинг гравців
   *
   * Сортування:
   * 1. За загальним рахунком (більше - краще)
   * 2. Тай-брейкер: середній час відповіді (менше - краще)
   *
   * @returns {Array} Відсортований масив гравців з позиціями
   */
  calculateLeaderboard() {
    const leaderboard = [];

    for (const [socketId, player] of this.players.entries()) {
      // Обчислюємо середній час відповіді (для тай-брейкера)
      const avgAnswerTime = player.correctAnswers > 0
        ? player.totalAnswerTime / player.correctAnswers
        : 999; // Якщо немає правильних відповідей - ставимо максимум

      leaderboard.push({
        playerId: socketId,
        nickname: player.nickname,
        score: player.score,
        correctAnswers: player.correctAnswers,
        totalQuestions: this.currentQuestionIndex + 1,
        avgAnswerTime: Math.round(avgAnswerTime * 10) / 10  // округляємо до 0.1
      });
    }

    // Сортуємо: спочатку по балам (більше = краще), потім по часу (менше = краще)
    leaderboard.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.avgAnswerTime - b.avgAnswerTime;
    });

    // Додаємо позицію (1, 2, 3, ...)
    leaderboard.forEach((player, index) => {
      player.position = index + 1;
    });

    return leaderboard;
  }

  // ─────────────────────────────────────────────
  // ДОПОМІЖНІ МЕТОДИ
  // ─────────────────────────────────────────────

  /**
   * Відправляє подію 'quiz-update' всім в кімнаті
   *
   * @param {Object} message - Дані для відправки (повинен містити поле 'type')
   */
  broadcast(message) {
    if (!this.io || !this.roomCode) {
      log('Session', 'ПОМИЛКА: broadcast() викликано до ініціалізації');
      return;
    }
    this.io.to(this.roomCode).emit('quiz-update', message);
  }

  /**
   * Повертає поточне питання
   *
   * @returns {Object} Об'єкт питання { question, answers, correctAnswer, timeLimit? }
   */
  getCurrentQuestion() {
    return this.quizData.questions[this.currentQuestionIndex];
  }

  /**
   * Повертає поточний стан гри (для нових гравців що приєднуються та для Projector View)
   *
   * Розширений стан включає:
   * - Поточне питання (без правильної відповіді) якщо gameState=QUESTION
   * - Правильну відповідь якщо gameState=ANSWER_REVEAL
   * - Leaderboard якщо gameState=LEADERBOARD або ENDED
   * - isPaused та часові показники для Projector timer sync
   *
   * @returns {Object} Стан гри для синхронізації клієнта
   */
  getState() {
    const totalQuestions = this.isCategoryMode ? this.rounds.length : this.quizData.questions.length;

    const state = {
      gameState: this.gameState,
      isPaused: this.isPaused,
      players: this._getPlayerList(),
      totalQuestions,
      currentQuestionIndex: this.currentQuestionIndex,
      quizTitle: this.quizData.title,
      isCategoryMode: this.isCategoryMode,
      playerCount: this.players.size,
    };

    // Дані поточного питання (без правильної відповіді) — для Projector sync
    if ((this.gameState === 'QUESTION' || this.gameState === 'ANSWER_REVEAL') &&
        this.currentQuestionIndex >= 0) {
      const q = this.getCurrentQuestion();
      state.currentQuestion = {
        text: q.question,
        answers: q.answers.map((text, id) => ({ id, text })),
        ...(q.image ? { image: q.image } : {}),
        ...(q.audio ? { audio: q.audio } : {}),
      };
      state.questionIndex = this.currentQuestionIndex + 1;
      state.answeredCount = this.currentAnswers.size;
    }

    // Залишок часу для Projector timer (тільки в QUESTION)
    if (this.gameState === 'QUESTION') {
      if (this.isPaused) {
        state.timeRemaining = Math.ceil(this.questionTimeRemaining);
      } else {
        const elapsed = (Date.now() - this.questionStartTime) / 1000;
        state.timeRemaining = Math.max(0, Math.ceil(this.currentTimerLimit - elapsed));
      }
      state.timeLimit = this.currentTimerLimit;
    }

    // Правильна відповідь для Projector (тільки в ANSWER_REVEAL)
    if (this.gameState === 'ANSWER_REVEAL' && this.currentQuestionIndex >= 0) {
      state.correctAnswer = this.getCurrentQuestion().correctAnswer;
    }

    // Leaderboard для Projector
    if (this.gameState === 'LEADERBOARD' || this.gameState === 'ENDED') {
      state.leaderboard = this.calculateLeaderboard();
    }

    return state;
  }

  /**
   * Повертає список гравців у форматі для клієнта
   * (без внутрішніх деталей типу socketId)
   *
   * @returns {Array} Масив { nickname, score }
   * @private
   */
  _getPlayerList() {
    return Array.from(this.players.values()).map(p => ({
      nickname: p.nickname,
      score: p.score
    }));
  }

  /**
   * Перемішує масив за алгоритмом Fisher-Yates (Durstenfeld variant)
   *
   * Повертає новий перемішаний масив (оригінал не змінюється).
   * Кожна перестановка рівноймовірна — справжнє випадкове перемішування.
   *
   * @param {Array} array - Масив для перемішування
   * @returns {Array} Новий перемішаний масив
   * @private
   */
  _shuffleArray(array) {
    // Йдемо з кінця масиву до початку
    for (let i = array.length - 1; i > 0; i--) {
      // Вибираємо випадковий індекс від 0 до i включно
      const j = Math.floor(Math.random() * (i + 1));
      // Міняємо місцями елементи i та j
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Обчислює статистику відповідей для поточного питання
   * (скільки гравців обрали кожен варіант)
   *
   * @param {number} correctAnswerId - Правильна відповідь для логування
   * @returns {Object} Статистика у форматі { total, answers: { 0: {...}, 1: {...}, ... } }
   * @private
   */
  _calculateAnswerStatistics(correctAnswerId) {
    const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    let totalAnswered = 0;

    // Рахуємо кількість відповідей по кожному варіанту
    for (const answer of this.currentAnswers.values()) {
      if (answer.answerId >= 0 && answer.answerId <= 3) {
        counts[answer.answerId]++;
        totalAnswered++;
      }
    }

    // Перетворюємо кількість у відсотки
    const answers = {};
    for (let i = 0; i < 4; i++) {
      answers[i] = {
        count: counts[i],
        percentage: totalAnswered > 0 ? Math.round((counts[i] / this.players.size) * 100) : 0
      };
    }

    return {
      total: totalAnswered,
      notAnswered: this.players.size - totalAnswered,
      answers
    };
  }
}

module.exports = AutoQuizSession;
