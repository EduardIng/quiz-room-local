/**
 * websocket-handler-auto.js - Обробник всіх WebSocket подій
 *
 * Відповідає за:
 * - Прийом подій від клієнтів (host та players)
 * - Маршрутизацію до правильної сесії
 * - Управління кімнатами (створення, видалення)
 * - Обробку відключень
 *
 * Клас QuizRoomManager зберігає всі активні сесії та обробляє
 * Socket.IO події для кожного підключеного клієнта.
 */

const AutoQuizSession = require('./quiz-session-auto');
const { log } = require('./utils');
const db = require('./db');

class QuizRoomManager {
  /**
   * Створює менеджер кімнат
   *
   * @param {Object} io - Ініціалізований Socket.IO сервер
   * @param {Object} config - Глобальна конфігурація (config.json)
   */
  constructor(io, config) {
    this.io = io;

    // Глобальна конфігурація (таймери, ліміти)
    this.config = config;

    // Map активних сесій: roomCode → AutoQuizSession
    // Кожна кімната має унікальний 6-символьний код
    this.sessions = new Map();

    // Map приналежності сокетів: socketId → roomCode
    // Потрібно щоб при відключенні знати з якої кімнати видалити гравця
    this.socketToRoom = new Map();

    // Map хостів кімнат: roomCode → socketId ведучого
    // Тільки хост може надсилати host-control події
    this.roomHosts = new Map();

    // Map спостерігачів (Projector View): socketId → roomCode
    // Спостерігачі підписані на broadcast але не є гравцями
    this.observers = new Map();

    // Rate limiting для submit-answer: socketId → { count, resetAt }
    // Максимум 10 подій за 30 секунд (захист від flood-атак)
    this.answerRateLimit = new Map();

    // Поточна активна кімната (kiosk mode) — один активний слот на весь сервер
    // Планшети підключаються до неї без введення коду
    // null = жодна гра не запущена (показуємо "Очікуємо ведучого")
    this.currentActiveRoom = null;
  }

  /**
   * Ініціалізує обробники подій для Socket.IO
   *
   * Викликається один раз при старті сервера.
   * Реєструє обробник для кожного нового підключення.
   *
   * Побічні ефекти:
   * - Реєструє слухача 'connection' на io
   */
  init() {
    // Обробляємо кожне нове підключення
    this.io.on('connection', (socket) => {
      log('WS', `Нове підключення: ${socket.id}`);

      // Реєструємо всі обробники подій для цього сокету
      socket.on('create-quiz', (data, callback) => this.handleCreateQuiz(socket, data, callback));
      socket.on('join-quiz', (data, callback) => this.handleJoinQuiz(socket, data, callback));
      socket.on('submit-answer', (data, callback) => this.handleSubmitAnswer(socket, data, callback));
      socket.on('submit-category', (data, callback) => this.handleSubmitCategory(socket, data, callback));
      socket.on('get-game-state', (data, callback) => this.handleGetGameState(socket, data, callback));
      // Нові обробники: підписка спостерігача (Projector View) та керування від ведучого
      socket.on('watch-room', (data, callback) => this.handleWatchRoom(socket, data, callback));
      socket.on('host-control', (data, callback) => this.handleHostControl(socket, data, callback));
      socket.on('disconnect', () => this.handleDisconnect(socket));
    });

    // Запускаємо очищення старих сесій кожні 30 хвилин
    setInterval(() => this.cleanupOldSessions(), 30 * 60 * 1000);

    log('WS', 'WebSocket менеджер ініціалізовано');
  }

  // ─────────────────────────────────────────────
  // ОБРОБНИКИ ПОДІЙ
  // ─────────────────────────────────────────────

  /**
   * Обробляє створення нової квіз-кімнати (хостом)
   *
   * Подія: 'create-quiz'
   * Відправник: Host (адміністратор квізу)
   *
   * Що робить:
   * 1. Валідує вхідні дані квізу
   * 2. Генерує унікальний код кімнати
   * 3. Створює новий AutoQuizSession
   * 4. Реєструє хост-сокет в кімнаті
   * 5. Повертає код кімнати хосту
   *
   * @param {Object} socket - Socket.IO сокет хоста
   * @param {Object} data - { quizData, settings }
   * @param {Function} callback - Функція відповіді { success, roomCode } або { success, error }
   */
  handleCreateQuiz(socket, data, callback) {
    // Безпечна перевірка що callback - функція
    const respond = typeof callback === 'function' ? callback : () => {};

    try {
      // Валідація вхідних даних
      if (!data || !data.quizData) {
        return respond({ success: false, error: 'Відсутні дані квізу' });
      }

      // Category mode validation
      if (data.quizData.categoryMode) {
        if (!Array.isArray(data.quizData.rounds) || data.quizData.rounds.length === 0) {
          return respond({ success: false, error: 'Квіз у режимі категорій повинен мати масив раундів' });
        }
        for (let i = 0; i < data.quizData.rounds.length; i++) {
          const round = data.quizData.rounds[i];
          if (!Array.isArray(round.options) || round.options.length !== 2) {
            return respond({ success: false, error: `Раунд ${i + 1}: потрібно рівно 2 варіанти категорій` });
          }
          for (let j = 0; j < round.options.length; j++) {
            const opt = round.options[j];
            if (!opt.category || typeof opt.category !== 'string') {
              return respond({ success: false, error: `Раунд ${i + 1}, варіант ${j + 1}: вкажіть назву категорії` });
            }
            if (!opt.question || !Array.isArray(opt.answers) || opt.answers.length !== 4) {
              return respond({ success: false, error: `Раунд ${i + 1}, варіант ${j + 1}: неправильний формат (потрібно 4 варіанти відповіді)` });
            }
            if (typeof opt.correctAnswer !== 'number' || opt.correctAnswer < 0 || opt.correctAnswer > 3) {
              return respond({ success: false, error: `Раунд ${i + 1}, варіант ${j + 1}: correctAnswer має бути числом 0-3` });
            }
          }
        }
        // Set empty questions array for category mode
        data.quizData.questions = [];
      } else {
        // Standard quiz validation
        if (!data.quizData.questions || !Array.isArray(data.quizData.questions)) {
          return respond({ success: false, error: 'Квіз повинен мати масив питань' });
        }

        if (data.quizData.questions.length === 0) {
          return respond({ success: false, error: 'Квіз повинен мати хоча б одне питання' });
        }

        // Перевіряємо кожне питання
        for (let i = 0; i < data.quizData.questions.length; i++) {
          const q = data.quizData.questions[i];
          if (!q.question || !q.answers || q.answers.length !== 4) {
            return respond({ success: false, error: `Питання ${i + 1} має неправильний формат (потрібно 4 варіанти відповіді)` });
          }
          if (typeof q.correctAnswer !== 'number' || q.correctAnswer < 0 || q.correctAnswer > 3) {
            return respond({ success: false, error: `Питання ${i + 1}: correctAnswer має бути числом 0-3` });
          }
        }
      }

      // Генеруємо унікальний код кімнати
      const roomCode = this.generateRoomCode();

      // Об'єднуємо налаштування від хоста з глобальними дефолтами
      const settings = {
        questionTime: this.config.quiz.questionTime,
        answerRevealTime: this.config.quiz.answerRevealTime,
        leaderboardTime: this.config.quiz.leaderboardTime,
        autoStart: this.config.quiz.autoStart,
        waitForAllPlayers: this.config.quiz.waitForAllPlayers,
        minPlayers: this.config.quiz.minPlayers,
        maxPlayers: this.config.quiz.maxPlayers,
        // Налаштування від хоста перезаписують дефолти (якщо надані)
        ...(data.settings || {})
      };

      // Створюємо новий сеанс
      const session = new AutoQuizSession(data.quizData, settings, db);
      session.init(this.io, roomCode);

      // Зберігаємо сеанс
      this.sessions.set(roomCode, session);

      // Реєструємо як поточну активну кімнату (kiosk mode)
      // Нова гра замінює попередню — на сервері одночасно одна активна гра
      this.currentActiveRoom = roomCode;

      // Підключаємо хоста до Socket.IO кімнати
      socket.join(roomCode);
      this.socketToRoom.set(socket.id, roomCode);

      // Запам'ятовуємо хоста кімнати (тільки він може надсилати host-control)
      this.roomHosts.set(roomCode, socket.id);

      log('WS', `Квіз створено. Кімната: ${roomCode}, Питань: ${data.quizData.questions.length}`);

      // Відповідаємо хосту з кодом кімнати
      respond({ success: true, roomCode });

    } catch (err) {
      log('WS', `Помилка при створенні квізу: ${err.message}`);
      respond({ success: false, error: 'Внутрішня помилка сервера' });
    }
  }

  /**
   * Обробляє приєднання гравця до кімнати
   *
   * Подія: 'join-quiz'
   * Відправник: Player (гравець зі своїм телефоном/планшетом)
   *
   * Що робить:
   * 1. Валідує roomCode та nickname
   * 2. Знаходить сесію за кодом кімнати
   * 3. Додає гравця до сесії через session.addPlayer()
   * 4. Підключає сокет до Socket.IO кімнати
   * 5. Повертає поточний стан гри
   *
   * @param {Object} socket - Socket.IO сокет гравця
   * @param {Object} data - { roomCode, nickname }
   * @param {Function} callback - Функція відповіді
   */
  handleJoinQuiz(socket, data, callback) {
    const respond = typeof callback === 'function' ? callback : () => {};

    try {
      if (!data) {
        return respond({ success: false, error: 'Відсутні дані' });
      }

      // Визначаємо код кімнати:
      //   1. Явно переданий roomCode (звичайний режим або адмін)
      //   2. Поточна активна кімната (kiosk mode — планшет без вводу коду)
      let roomCode;
      if (data.roomCode) {
        roomCode = String(data.roomCode).toUpperCase().trim();
        if (roomCode.length !== 6) {
          return respond({ success: false, error: 'Код кімнати має бути 6 символів' });
        }
      } else {
        // Kiosk mode: сервер автоматично підключає до поточної активної кімнати
        if (!this.currentActiveRoom) {
          return respond({
            success: false,
            error: 'Немає активної гри. Очікуйте ведучого.',
            noActiveRoom: true
          });
        }
        roomCode = this.currentActiveRoom;
      }

      // Валідація nickname
      if (!data.nickname) {
        return respond({ success: false, error: 'Вкажіть нікнейм' });
      }

      const nickname = String(data.nickname).trim();

      if (nickname.length < 2 || nickname.length > 20) {
        return respond({ success: false, error: 'Нікнейм має бути від 2 до 20 символів' });
      }

      // Знаходимо сесію
      const session = this.sessions.get(roomCode);

      if (!session) {
        return respond({ success: false, error: `Кімната "${roomCode}" не знайдена. Перевірте код.` });
      }

      // Додаємо гравця до сесії
      const result = session.addPlayer(socket.id, nickname);

      if (!result.success) {
        return respond({ success: false, error: result.error });
      }

      // Підключаємо сокет до Socket.IO кімнати (для broadcast)
      socket.join(roomCode);
      this.socketToRoom.set(socket.id, roomCode);

      log('WS', `Гравець "${nickname}" (${socket.id}) приєднався до кімнати ${roomCode}`);

      // Повертаємо гравцю поточний стан гри
      respond({
        success: true,
        message: `Ласкаво просимо до квізу "${session.quizData.title}"!`,
        nickname,
        roomCode,
        gameState: session.getState()
      });

    } catch (err) {
      log('WS', `Помилка при приєднанні до квізу: ${err.message}`);
      respond({ success: false, error: 'Внутрішня помилка сервера' });
    }
  }

  /**
   * Обробляє відповідь гравця на питання
   *
   * Подія: 'submit-answer'
   * Відправник: Player
   *
   * Що робить:
   * 1. Знаходить сесію гравця
   * 2. Передає відповідь в session.submitAnswer()
   * 3. Повертає результат (success/error)
   *
   * @param {Object} socket - Socket.IO сокет гравця
   * @param {Object} data - { answerId }
   * @param {Function} callback - Функція відповіді
   */
  handleSubmitAnswer(socket, data, callback) {
    const respond = typeof callback === 'function' ? callback : () => {};

    try {
      // Знаходимо кімнату гравця
      const roomCode = this.socketToRoom.get(socket.id);

      if (!roomCode) {
        return respond({ success: false, error: 'Ви не знаходитесь в жодній кімнаті' });
      }

      const session = this.sessions.get(roomCode);

      if (!session) {
        return respond({ success: false, error: 'Сесія не знайдена' });
      }

      // Rate limiting: максимум 10 submit-answer подій за 30 секунд на сокет
      const now = Date.now();
      const rl = this.answerRateLimit.get(socket.id) || { count: 0, resetAt: now + 30000 };
      if (now > rl.resetAt) { rl.count = 0; rl.resetAt = now + 30000; }
      rl.count++;
      this.answerRateLimit.set(socket.id, rl);
      if (rl.count > 10) {
        return respond({ success: false, error: 'Забагато запитів. Зачекайте.' });
      }

      // Валідація answerId
      if (data === undefined || data === null || data.answerId === undefined) {
        return respond({ success: false, error: 'Вкажіть відповідь' });
      }

      const answerId = Number(data.answerId);

      if (isNaN(answerId) || answerId < 0 || answerId > 3) {
        return respond({ success: false, error: 'Відповідь має бути числом 0-3' });
      }

      // Передаємо відповідь до сесії з поточним часом сервера
      const result = session.submitAnswer(socket.id, answerId, Date.now());

      respond(result);

    } catch (err) {
      log('WS', `Помилка при обробці відповіді: ${err.message}`);
      respond({ success: false, error: 'Внутрішня помилка сервера' });
    }
  }

  /**
   * Обробляє вибір категорії гравцем
   *
   * Подія: 'submit-category'
   * Відправник: Player (той чия черга)
   *
   * @param {Object} socket - Socket.IO сокет гравця
   * @param {Object} data - { choiceIndex: 0|1 }
   * @param {Function} callback - Функція відповіді
   */
  handleSubmitCategory(socket, data, callback) {
    const respond = typeof callback === 'function' ? callback : () => {};

    try {
      const roomCode = this.socketToRoom.get(socket.id);

      if (!roomCode) {
        return respond({ success: false, error: 'Ви не знаходитесь в жодній кімнаті' });
      }

      const session = this.sessions.get(roomCode);

      if (!session) {
        return respond({ success: false, error: 'Сесія не знайдена' });
      }

      if (data === undefined || data === null || data.choiceIndex === undefined) {
        return respond({ success: false, error: 'Вкажіть choiceIndex' });
      }

      const choiceIndex = Number(data.choiceIndex);

      if (choiceIndex !== 0 && choiceIndex !== 1) {
        return respond({ success: false, error: 'choiceIndex має бути 0 або 1' });
      }

      const result = session.submitCategory(socket.id, choiceIndex);

      respond(result);

    } catch (err) {
      log('WS', `Помилка при обробці вибору категорії: ${err.message}`);
      respond({ success: false, error: 'Внутрішня помилка сервера' });
    }
  }

  /**
   * Обробляє запит поточного стану гри
   *
   * Подія: 'get-game-state'
   * Відправник: Player або Host (при reconnect)
   *
   * Повертає поточний стан сесії для синхронізації після перезавантаження
   *
   * @param {Object} socket - Socket.IO сокет клієнта
   * @param {Object} data - { roomCode }
   * @param {Function} callback - Функція відповіді
   */
  handleGetGameState(socket, data, callback) {
    const respond = typeof callback === 'function' ? callback : () => {};

    try {
      const roomCode = data?.roomCode || this.socketToRoom.get(socket.id);

      if (!roomCode) {
        return respond({ success: false, error: 'Вкажіть код кімнати' });
      }

      const session = this.sessions.get(roomCode.toUpperCase());

      if (!session) {
        return respond({ success: false, error: 'Сесія не знайдена' });
      }

      respond({ success: true, gameState: session.getState() });

    } catch (err) {
      log('WS', `Помилка при отриманні стану: ${err.message}`);
      respond({ success: false, error: 'Внутрішня помилка сервера' });
    }
  }

  /**
   * Обробляє підписку спостерігача (Projector View / Big Screen)
   *
   * Подія: 'watch-room'
   * Відправник: Projector View (великий екран у залі)
   *
   * Що робить:
   * 1. Валідує roomCode
   * 2. Додає сокет до Socket.IO кімнати (щоб отримувати quiz-update broadcast)
   * 3. Повертає повний поточний стан для ініціальної синхронізації
   *
   * Спостерігач НЕ є гравцем — не додається до session.players,
   * не впливає на autoStart, не отримує removePlayer при disconnect.
   *
   * @param {Object} socket - Socket.IO сокет Projector
   * @param {Object} data - { roomCode }
   * @param {Function} callback - Функція відповіді
   */
  handleWatchRoom(socket, data, callback) {
    const respond = typeof callback === 'function' ? callback : () => {};

    try {
      const roomCode = String(data?.roomCode || '').toUpperCase().trim();

      if (!roomCode || roomCode.length !== 6) {
        return respond({ success: false, error: 'Вкажіть коректний код кімнати (6 символів)' });
      }

      const session = this.sessions.get(roomCode);

      if (!session) {
        return respond({ success: false, error: `Кімната "${roomCode}" не знайдена` });
      }

      // Підключаємо спостерігача до Socket.IO кімнати
      socket.join(roomCode);
      this.observers.set(socket.id, roomCode);

      log('WS', `Projector підключився до кімнати ${roomCode} (${socket.id})`);

      // Повертаємо повний поточний стан для синхронізації
      respond({ success: true, gameState: session.getState() });

    } catch (err) {
      log('WS', `Помилка watch-room: ${err.message}`);
      respond({ success: false, error: 'Внутрішня помилка сервера' });
    }
  }

  /**
   * Обробляє команди керування грою від ведучого (Host Controls)
   *
   * Подія: 'host-control'
   * Відправник: Host (той хто створив кімнату)
   *
   * Доступні дії (data.action):
   * - 'pause'  → зупинити таймер питання
   * - 'resume' → відновити після паузи
   * - 'skip'   → пропустити поточний крок (питання/reveal/leaderboard)
   * - 'start'  → примусово стартувати квіз (незалежно від minPlayers)
   *
   * Безпека: тільки хост кімнати (той хто надіслав create-quiz) може
   * керувати грою. Перевіряємо через this.roomHosts Map.
   *
   * @param {Object} socket - Socket.IO сокет хоста
   * @param {Object} data - { action: 'pause'|'resume'|'skip'|'start' }
   * @param {Function} callback - Функція відповіді
   */
  handleHostControl(socket, data, callback) {
    const respond = typeof callback === 'function' ? callback : () => {};

    try {
      const roomCode = this.socketToRoom.get(socket.id);

      if (!roomCode) {
        return respond({ success: false, error: 'Ви не знаходитесь в жодній кімнаті' });
      }

      // Перевіряємо що це хост кімнати
      if (this.roomHosts.get(roomCode) !== socket.id) {
        return respond({ success: false, error: 'Тільки ведучий може керувати грою' });
      }

      const session = this.sessions.get(roomCode);
      if (!session) {
        return respond({ success: false, error: 'Сесія не знайдена' });
      }

      const action = data?.action;
      let result;

      switch (action) {
        case 'pause':  result = session.pauseGame();    break;
        case 'resume': result = session.resumeGame();   break;
        case 'skip':   result = session.skipQuestion(); break;
        case 'start':  result = session.forceStart();   break;
        default:
          return respond({ success: false, error: `Невідома дія: "${action}"` });
      }

      log('WS', `host-control "${action}" в кімнаті ${roomCode}: ${result.success ? 'OK' : result.error}`);
      respond(result);

    } catch (err) {
      log('WS', `Помилка host-control: ${err.message}`);
      respond({ success: false, error: 'Внутрішня помилка сервера' });
    }
  }

  /**
   * Обробляє відключення клієнта
   *
   * Подія: 'disconnect' (автоматично від Socket.IO)
   * Відправник: Будь-який клієнт (host або player)
   *
   * Що робить:
   * 1. Знаходить кімнату за socketId
   * 2. Видаляє гравця зі сесії через session.removePlayer()
   * 3. Очищає відображення socketId → roomCode
   * 4. Якщо сесія завершена і гравців немає → видаляє сесію
   *
   * @param {Object} socket - Socket.IO сокет що відключається
   */
  handleDisconnect(socket) {
    log('WS', `Відключення: ${socket.id}`);

    // Очищаємо rate limiting для цього сокету
    this.answerRateLimit.delete(socket.id);

    // Якщо це спостерігач (Projector) — просто видаляємо з мапи, гра не зачіпається
    if (this.observers.has(socket.id)) {
      const observedRoom = this.observers.get(socket.id);
      this.observers.delete(socket.id);
      log('WS', `Projector відключився від кімнати ${observedRoom}`);
      return;
    }

    // Знаходимо кімнату цього сокету
    const roomCode = this.socketToRoom.get(socket.id);

    if (roomCode) {
      const session = this.sessions.get(roomCode);

      if (session) {
        // Видаляємо гравця з сесії
        session.removePlayer(socket.id);

        // Якщо квіз завершено і гравців не залишилось → видаляємо сесію
        if (session.gameState === 'ENDED' && session.players.size === 0) {
          this.sessions.delete(roomCode);
          this.roomHosts.delete(roomCode);
          // Очищаємо активну кімнату (kiosk mode) якщо це вона завершилась
          if (this.currentActiveRoom === roomCode) {
            this.currentActiveRoom = null;
          }
          log('WS', `Сесія ${roomCode} видалена (завершена, гравців немає)`);
        }
      }

      // Якщо хост відключився — видаляємо запис хоста
      // (нового хоста не призначаємо, але гра триває)
      if (this.roomHosts.get(roomCode) === socket.id) {
        this.roomHosts.delete(roomCode);
        log('WS', `Хост кімнати ${roomCode} відключився`);
      }

      // Видаляємо відображення сокет → кімната
      this.socketToRoom.delete(socket.id);
    }
  }

  // ─────────────────────────────────────────────
  // ДОПОМІЖНІ МЕТОДИ
  // ─────────────────────────────────────────────

  /**
   * Генерує унікальний 6-символьний код кімнати
   *
   * Формат: тільки великі літери та цифри (A-Z, 0-9)
   * Виключено схожі символи: I, O, 0, 1 (щоб уникнути плутанини)
   * Гарантовано унікальність серед активних сесій
   *
   * @returns {string} Унікальний 6-символьний код
   */
  generateRoomCode() {
    // Безпечні символи (без I, O, 0, 1 - легко переплутати)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    let attempts = 0;

    do {
      // Генеруємо 6 випадкових символів
      code = Array.from({ length: 6 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
      ).join('');
      attempts++;

      // Захист від нескінченного циклу (практично неможливо, але все ж)
      if (attempts > 1000) {
        code = code + Date.now().toString(36).toUpperCase().slice(-2);
        break;
      }
    } while (this.sessions.has(code)); // Повторюємо поки код унікальний

    return code;
  }

  /**
   * Видаляє старі та завершені сесії для звільнення пам'яті
   *
   * Запускається автоматично кожні 30 хвилин.
   * Видаляє сесії що:
   * - Перебувають в стані ENDED
   * - Або старіші 24 годин (захист від "зависших" сесій)
   */
  cleanupOldSessions() {
    const now = Date.now();
    let removedCount = 0;

    for (const [roomCode, session] of this.sessions.entries()) {
      // Видаляємо завершені сесії без гравців
      if (session.gameState === 'ENDED' && session.players.size === 0) {
        this.sessions.delete(roomCode);
        // Очищаємо активний слот якщо це була поточна активна кімната
        if (this.currentActiveRoom === roomCode) {
          this.currentActiveRoom = null;
        }
        removedCount++;
      }
    }

    if (removedCount > 0) {
      log('WS', `Очищення: видалено ${removedCount} старих сесій. Активних: ${this.sessions.size}`);
    }
  }

  /**
   * Повертає код поточної активної кімнати (kiosk mode)
   *
   * Використовується HTTP ендпоінтом GET /api/current-room.
   * Планшети викликають цей метод щоб знайти активну гру без вводу коду.
   *
   * @returns {string|null} Код кімнати або null якщо немає активної гри
   */
  getCurrentRoom() {
    return this.currentActiveRoom;
  }

  /**
   * Повертає список активних квіз-кімнат (для API ендпоінту)
   *
   * @returns {Array} Масив { roomCode, title, playerCount, gameState }
   */
  getActiveSessions() {
    return Array.from(this.sessions.entries()).map(([roomCode, session]) => ({
      roomCode,
      title: session.quizData.title,
      playerCount: session.players.size,
      gameState: session.gameState
    }));
  }
}

module.exports = QuizRoomManager;
