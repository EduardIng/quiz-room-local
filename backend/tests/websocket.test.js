/**
 * websocket.test.js - Тести для QuizRoomManager
 *
 * Покриває:
 * - Генерацію кодів кімнат
 * - Створення квіз-кімнат (handleCreateQuiz)
 * - Приєднання гравців (handleJoinQuiz)
 * - Обробку відповідей (handleSubmitAnswer)
 * - Обробку відключень (handleDisconnect)
 * - Очищення старих сесій (cleanupOldSessions)
 * - Валідацію вхідних даних
 */

'use strict';

const QuizRoomManager = require('../src/websocket-handler-auto');

// ─────────────────────────────────────────────
// ТЕСТОВІ ДАНІ
// ─────────────────────────────────────────────

const QUIZ_DATA = {
  title: 'WS Тестовий квіз',
  categoryMode: true,
  rounds: [
    {
      options: [
        { category: 'Cat A', question: 'Q1', answers: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
        { category: 'Cat B', question: 'Q2', answers: ['W', 'X', 'Y', 'Z'], correctAnswer: 2 }
      ]
    }
  ]
};

const DEFAULT_CONFIG = {
  quiz: {
    questionTime: 30,
    answerRevealTime: 2,
    leaderboardTime: 2,
    autoStart: false,
    waitForAllPlayers: true,
    minPlayers: 1,
    maxPlayers: 8
  }
};

// ─────────────────────────────────────────────
// ХЕЛПЕРИ
// ─────────────────────────────────────────────

/**
 * Створює мок Socket.IO сервер та мок сокет для тестів
 */
function createMocks() {
  const roomEmits = [];

  // Мок io (сервер)
  const mockIo = {
    on: jest.fn(),
    to: (room) => ({
      emit: (event, data) => roomEmits.push({ room, event, data })
    })
  };

  // Фабрика мок-сокетів (для кожного підключення)
  function createSocket(id = 'socket-test') {
    const joinedRooms = [];
    return {
      id,
      join: jest.fn((room) => joinedRooms.push(room)),
      joinedRooms,
      emit: jest.fn()
    };
  }

  return { mockIo, roomEmits, createSocket };
}

/**
 * Створює QuizRoomManager та виконує create-quiz через handleCreateQuiz
 * Повертає { manager, roomCode, socket }
 */
function setupRoomWithQuiz(config = DEFAULT_CONFIG) {
  const { mockIo, roomEmits, createSocket } = createMocks();
  const manager = new QuizRoomManager(mockIo, config);

  const hostSocket = createSocket('host-socket');
  let roomCode = null;

  manager.handleCreateQuiz(hostSocket, { quizData: QUIZ_DATA }, (resp) => {
    roomCode = resp.roomCode;
  });

  return { manager, roomCode, hostSocket, mockIo, roomEmits, createSocket };
}

/**
 * Очищає таймери всіх активних сесій
 */
function clearAllTimers(manager) {
  for (const session of manager.sessions.values()) {
    clearTimeout(session.questionTimer);
    clearTimeout(session.transitionTimer);
  }
}

// ─────────────────────────────────────────────
// ТЕСТИ: Генерація кодів кімнат
// ─────────────────────────────────────────────

describe('QuizRoomManager — generateRoomCode', () => {
  test('генерує 6-символьний код', () => {
    const manager = new QuizRoomManager({}, DEFAULT_CONFIG);
    const code = manager.generateRoomCode();
    expect(code).toHaveLength(6);
  });

  test('код містить тільки допустимі символи (A-Z, 2-9, без I/O/0/1)', () => {
    const manager = new QuizRoomManager({}, DEFAULT_CONFIG);
    const forbidden = /[IO01]/;

    for (let i = 0; i < 50; i++) {
      const code = manager.generateRoomCode();
      expect(code).toMatch(/^[A-Z2-9]{6}$/);
      expect(code).not.toMatch(forbidden);
    }
  });

  test('генерує унікальні коди', () => {
    const manager = new QuizRoomManager({}, DEFAULT_CONFIG);
    const codes = new Set();

    for (let i = 0; i < 100; i++) {
      codes.add(manager.generateRoomCode());
    }

    // З 100 згенерованих кодів дублікати вкрай малоймовірні
    expect(codes.size).toBeGreaterThanOrEqual(99);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: handleCreateQuiz
// ─────────────────────────────────────────────

describe('QuizRoomManager — handleCreateQuiz', () => {
  test('успішно створює кімнату та повертає roomCode', () => {
    const { manager, roomCode } = setupRoomWithQuiz();

    expect(roomCode).toBeDefined();
    expect(roomCode).toHaveLength(6);
    expect(manager.sessions.has(roomCode)).toBe(true);
  });

  test('хост-сокет реєструється в кімнаті', () => {
    const { hostSocket, roomCode } = setupRoomWithQuiz();

    expect(hostSocket.join).toHaveBeenCalledWith(roomCode);
  });

  test('відхиляє запит без quizData', () => {
    const { mockIo } = createMocks();
    const manager = new QuizRoomManager(mockIo, DEFAULT_CONFIG);
    const socket = { id: 's1', join: jest.fn() };
    let response;

    manager.handleCreateQuiz(socket, {}, (r) => { response = r; });

    expect(response.success).toBe(false);
    expect(response.error).toBeTruthy();
  });

  test('відхиляє квіз без питань', () => {
    const { mockIo } = createMocks();
    const manager = new QuizRoomManager(mockIo, DEFAULT_CONFIG);
    const socket = { id: 's1', join: jest.fn() };
    let response;

    manager.handleCreateQuiz(socket, { quizData: { title: 'Empty', questions: [] } }, (r) => { response = r; });

    expect(response.success).toBe(false);
  });

  test('відхиляє питання з неправильним форматом (не 4 відповіді)', () => {
    const { mockIo } = createMocks();
    const manager = new QuizRoomManager(mockIo, DEFAULT_CONFIG);
    const socket = { id: 's1', join: jest.fn() };
    let response;

    // Категорійний квіз з неправильним форматом опції (тільки 2 відповіді замість 4)
    const badQuiz = {
      title: 'Bad quiz',
      categoryMode: true,
      rounds: [
        {
          options: [
            { category: 'Cat A', question: 'Q?', answers: ['A', 'B'], correctAnswer: 0 },
            { category: 'Cat B', question: 'Q2', answers: ['W', 'X', 'Y', 'Z'], correctAnswer: 2 }
          ]
        }
      ]
    };

    manager.handleCreateQuiz(socket, { quizData: badQuiz }, (r) => { response = r; });

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/формат/i);
  });

  test('відхиляє невалідний correctAnswer', () => {
    const { mockIo } = createMocks();
    const manager = new QuizRoomManager(mockIo, DEFAULT_CONFIG);
    const socket = { id: 's1', join: jest.fn() };
    let response;

    const badQuiz = {
      title: 'Bad quiz',
      categoryMode: true,
      rounds: [{
        options: [
          { category: 'Science', question: 'Q?', answers: ['A','B','C','D'], correctAnswer: 5 },
          { category: 'History', question: 'Q2?', answers: ['A','B','C','D'], correctAnswer: 0 }
        ]
      }]
    };

    manager.handleCreateQuiz(socket, { quizData: badQuiz }, (r) => { response = r; });

    expect(response.success).toBe(false);
  });

  test('встановлює currentActiveRoom після успішного створення', () => {
    const { manager, roomCode } = setupRoomWithQuiz();
    expect(manager.currentActiveRoom).toBe(roomCode);
  });

  test('нова create-quiz замінює попередню currentActiveRoom', () => {
    const { manager, roomCode: firstRoom, createSocket } = setupRoomWithQuiz();

    const secondHostSocket = createSocket('host-2');
    let secondRoomCode;
    manager.handleCreateQuiz(secondHostSocket, { quizData: QUIZ_DATA }, (r) => { secondRoomCode = r.roomCode; });

    expect(manager.currentActiveRoom).toBe(secondRoomCode);
    expect(manager.currentActiveRoom).not.toBe(firstRoom);
  });

  it('rejects create-quiz when quizData does not have categoryMode: true', (done) => {
    const { mockIo } = createMocks();
    const manager = new QuizRoomManager(mockIo, DEFAULT_CONFIG);
    const socket = { id: 's1', join: jest.fn() };
    const standardQuiz = { title: 'Test', questions: [
      { question: 'Q1', answers: ['A','B','C','D'], correctAnswer: 0 }
    ]};
    manager.handleCreateQuiz(socket, { quizData: standardQuiz, settings: {} }, (response) => {
      expect(response.success).toBe(false);
      expect(response.error).toMatch(/category mode/i);
      done();
    });
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: handleJoinQuiz
// ─────────────────────────────────────────────

describe('QuizRoomManager — handleJoinQuiz', () => {
  test('успішно приєднує гравця до існуючої кімнати', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');
    let response;

    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'Петро' }, (r) => { response = r; });

    expect(response.success).toBe(true);
    expect(response.nickname).toBe('Петро');
    expect(response.roomCode).toBe(roomCode);
    expect(response.gameState).toBeDefined();
  });

  test('сокет гравця реєструється в кімнаті', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');

    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'Марія' }, () => {});

    expect(playerSocket.join).toHaveBeenCalledWith(roomCode);
    expect(manager.socketToRoom.get('player-1')).toBe(roomCode);
  });

  test('відхиляє неіснуючий код кімнати', () => {
    const { manager, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');
    let response;

    manager.handleJoinQuiz(playerSocket, { roomCode: 'XXXXXX', nickname: 'Петро' }, (r) => { response = r; });

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/не знайдена/i);
  });

  test('відхиляє нікнейм коротший 2 символів', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');
    let response;

    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'А' }, (r) => { response = r; });

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/символів/i);
  });

  test('відхиляє нікнейм довший 20 символів', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');
    let response;

    manager.handleJoinQuiz(playerSocket, {
      roomCode,
      nickname: 'ДужеДовгийНікнеймЩоПеревищує20Символів'
    }, (r) => { response = r; });

    expect(response.success).toBe(false);
  });

  test('відхиляє код кімнати не 6 символів', () => {
    const { manager, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');
    let response;

    manager.handleJoinQuiz(playerSocket, { roomCode: 'ABC', nickname: 'Петро' }, (r) => { response = r; });

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/6 символів/i);
  });

  test('код кімнати автоматично переводиться у верхній регістр', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');
    let response;

    // Передаємо у нижньому регістрі
    manager.handleJoinQuiz(playerSocket, {
      roomCode: roomCode.toLowerCase(),
      nickname: 'Петро'
    }, (r) => { response = r; });

    expect(response.success).toBe(true);
  });

  test('приєднується без roomCode якщо є поточна активна кімната (kiosk mode)', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('kiosk-player');
    let response;

    // Kiosk mode: не передаємо roomCode — сервер використовує currentActiveRoom
    manager.handleJoinQuiz(playerSocket, { nickname: 'Kiosk' }, (r) => { response = r; });

    expect(response.success).toBe(true);
    expect(response.roomCode).toBe(roomCode);
    expect(response.nickname).toBe('Kiosk');
  });

  test('відхиляє join без roomCode якщо немає активної кімнати', () => {
    const { mockIo } = createMocks();
    const manager = new QuizRoomManager(mockIo, DEFAULT_CONFIG);
    const playerSocket = { id: 'kiosk-1', join: jest.fn() };
    let response;

    manager.handleJoinQuiz(playerSocket, { nickname: 'Kiosk' }, (r) => { response = r; });

    expect(response.success).toBe(false);
    expect(response.noActiveRoom).toBe(true);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: handleSubmitAnswer
// ─────────────────────────────────────────────

describe('QuizRoomManager — handleSubmitAnswer', () => {
  test('успішно приймає відповідь від зареєстрованого гравця', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');

    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'Петро' }, () => {});

    // Симулюємо стан QUESTION (в категорійному режимі питання додається до quizData.questions)
    const session = manager.sessions.get(roomCode);
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 5000;
    // Додаємо поточне питання щоб endQuestion() знайшов його через getCurrentQuestion()
    session.quizData.questions = [{ question: 'Q1', answers: ['A', 'B', 'C', 'D'], correctAnswer: 0 }];

    let response;
    manager.handleSubmitAnswer(playerSocket, { answerId: 0 }, (r) => { response = r; });
    clearAllTimers(manager);

    expect(response.success).toBe(true);
  });

  test('відхиляє відповідь від гравця не в кімнаті', () => {
    const { manager, createSocket } = setupRoomWithQuiz();
    const unknownSocket = createSocket('unknown');
    let response;

    manager.handleSubmitAnswer(unknownSocket, { answerId: 0 }, (r) => { response = r; });

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/не знаходитесь/i);
  });

  test('відхиляє answerId < 0', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');

    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'Петро' }, () => {});

    const session = manager.sessions.get(roomCode);
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now();

    let response;
    manager.handleSubmitAnswer(playerSocket, { answerId: -1 }, (r) => { response = r; });

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/0-3/i);
  });

  test('відхиляє answerId > 3', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');

    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'Петро' }, () => {});

    const session = manager.sessions.get(roomCode);
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now();

    let response;
    manager.handleSubmitAnswer(playerSocket, { answerId: 4 }, (r) => { response = r; });

    expect(response.success).toBe(false);
  });

  test('відхиляє відсутній answerId', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');

    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'Петро' }, () => {});

    let response;
    manager.handleSubmitAnswer(playerSocket, {}, (r) => { response = r; });

    expect(response.success).toBe(false);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: handleDisconnect
// ─────────────────────────────────────────────

describe('QuizRoomManager — handleDisconnect', () => {
  test('видаляє гравця зі сесії при відключенні', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');

    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'Петро' }, () => {});

    expect(manager.sessions.get(roomCode).players.size).toBe(1);

    manager.handleDisconnect(playerSocket);

    expect(manager.sessions.get(roomCode).players.size).toBe(0);
    expect(manager.socketToRoom.has('player-1')).toBe(false);
  });

  test('не кидає помилку при відключенні невідомого сокету', () => {
    const { manager, createSocket } = setupRoomWithQuiz();
    const unknownSocket = createSocket('unknown');

    expect(() => manager.handleDisconnect(unknownSocket)).not.toThrow();
  });

  test('видаляє завершену сесію без гравців', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');

    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'Петро' }, () => {});

    // Симулюємо завершену гру
    manager.sessions.get(roomCode).gameState = 'ENDED';
    manager.handleDisconnect(playerSocket);

    // Сесія має бути видалена
    expect(manager.sessions.has(roomCode)).toBe(false);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: handleGetGameState
// ─────────────────────────────────────────────

describe('QuizRoomManager — handleGetGameState', () => {
  test('повертає стан гри за кодом кімнати', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');

    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'Петро' }, () => {});

    let response;
    manager.handleGetGameState(playerSocket, { roomCode }, (r) => { response = r; });

    expect(response.success).toBe(true);
    expect(response.gameState).toBeDefined();
    expect(response.gameState.gameState).toBe('WAITING');
  });

  test('повертає помилку для неіснуючої кімнати', () => {
    const { manager, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');
    let response;

    manager.handleGetGameState(playerSocket, { roomCode: 'XXXXXX' }, (r) => { response = r; });

    expect(response.success).toBe(false);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: cleanupOldSessions
// ─────────────────────────────────────────────

describe('QuizRoomManager — cleanupOldSessions', () => {
  test('видаляє завершені сесії без гравців', () => {
    const { manager, roomCode } = setupRoomWithQuiz();

    // Симулюємо завершену сесію без гравців
    manager.sessions.get(roomCode).gameState = 'ENDED';
    // Гравців вже немає (нікого не приєднували)

    manager.cleanupOldSessions();

    expect(manager.sessions.has(roomCode)).toBe(false);
  });

  test('зберігає активні сесії', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');
    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'Петро' }, () => {});

    manager.cleanupOldSessions();

    // Сесія активна (є гравець і стан не ENDED) — не видаляти
    expect(manager.sessions.has(roomCode)).toBe(true);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: getActiveSessions
// ─────────────────────────────────────────────

describe('QuizRoomManager — getActiveSessions', () => {
  test('повертає список активних сесій', () => {
    const { manager, createSocket, roomCode } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');
    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'Петро' }, () => {});

    const sessions = manager.getActiveSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].roomCode).toBe(roomCode);
    expect(sessions[0].title).toBe('WS Тестовий квіз');
    expect(sessions[0].playerCount).toBe(1);
    expect(sessions[0].gameState).toBe('WAITING');
  });

  test('повертає порожній масив якщо немає сесій', () => {
    const { mockIo } = createMocks();
    const manager = new QuizRoomManager(mockIo, DEFAULT_CONFIG);

    expect(manager.getActiveSessions()).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: Phase 9 — handleWatchRoom (Projector)
// ─────────────────────────────────────────────

describe('QuizRoomManager — handleWatchRoom', () => {
  test('спостерігач підключається та отримує gameState', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const projectorSocket = createSocket('projector-1');
    let response;

    manager.handleWatchRoom(projectorSocket, { roomCode }, (r) => { response = r; });

    expect(response.success).toBe(true);
    expect(response.gameState).toBeDefined();
    expect(response.gameState.gameState).toBe('WAITING');
    // Projector socket joined the room
    expect(projectorSocket.join).toHaveBeenCalledWith(roomCode);
    // Зберігається в observers Map
    expect(manager.observers.get('projector-1')).toBe(roomCode);
  });

  test('відхиляє неіснуючий код кімнати', () => {
    const { manager, createSocket } = setupRoomWithQuiz();
    const projectorSocket = createSocket('projector-1');
    let response;

    manager.handleWatchRoom(projectorSocket, { roomCode: 'XXXXXX' }, (r) => { response = r; });

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/не знайдена/i);
  });

  test('відхиляє відсутній roomCode', () => {
    const { manager, createSocket } = setupRoomWithQuiz();
    const projectorSocket = createSocket('projector-1');
    let response;

    manager.handleWatchRoom(projectorSocket, {}, (r) => { response = r; });

    expect(response.success).toBe(false);
  });

  test('спостерігач НЕ є гравцем сесії', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const projectorSocket = createSocket('projector-1');

    manager.handleWatchRoom(projectorSocket, { roomCode }, () => {});

    const session = manager.sessions.get(roomCode);
    // Спостерігач не добавлений до players
    expect(session.players.has('projector-1')).toBe(false);
    // І не в socketToRoom (тільки в observers)
    expect(manager.socketToRoom.has('projector-1')).toBe(false);
  });

  test('handleDisconnect очищає observers при відключенні спостерігача', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const projectorSocket = createSocket('projector-1');

    manager.handleWatchRoom(projectorSocket, { roomCode }, () => {});
    expect(manager.observers.has('projector-1')).toBe(true);

    manager.handleDisconnect(projectorSocket);
    expect(manager.observers.has('projector-1')).toBe(false);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: Phase 9 — handleHostControl
// ─────────────────────────────────────────────

describe('QuizRoomManager — handleHostControl', () => {
  test('хост може поставити гру на паузу', () => {
    const { manager, roomCode, hostSocket, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');
    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'Петро' }, () => {});

    const session = manager.sessions.get(roomCode);
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 5000;
    session.currentTimerLimit = 30;

    let response;
    manager.handleHostControl(hostSocket, { roomCode, action: 'pause' }, (r) => { response = r; });
    clearAllTimers(manager);

    expect(response.success).toBe(true);
    expect(session.isPaused).toBe(true);
  });

  test('хост може відновити гру', () => {
    const { manager, roomCode, hostSocket, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');
    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'Петро' }, () => {});

    const session = manager.sessions.get(roomCode);
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 5000;
    session.currentTimerLimit = 30;
    session.isPaused = true;
    session.questionTimeRemaining = 20;
    session.pausedAt = Date.now();

    let response;
    manager.handleHostControl(hostSocket, { roomCode, action: 'resume' }, (r) => { response = r; });
    clearAllTimers(manager);

    expect(response.success).toBe(true);
    expect(session.isPaused).toBe(false);
  });

  test('хост може форсувати старт', () => {
    const { manager, roomCode, hostSocket, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');
    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'Петро' }, () => {});

    let response;
    manager.handleHostControl(hostSocket, { roomCode, action: 'start' }, (r) => { response = r; });
    clearAllTimers(manager);

    expect(response.success).toBe(true);
    const session = manager.sessions.get(roomCode);
    expect(['STARTING', 'QUESTION']).toContain(session.gameState);
  });

  test('хост може пропустити поточний стан', () => {
    const { manager, roomCode, hostSocket, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');
    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'Петро' }, () => {});

    const session = manager.sessions.get(roomCode);
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 5000;
    // Додаємо питання щоб endQuestion() знайшов його через getCurrentQuestion()
    session.quizData.questions = [{ question: 'Q1', answers: ['A', 'B', 'C', 'D'], correctAnswer: 0 }];

    let response;
    manager.handleHostControl(hostSocket, { roomCode, action: 'skip' }, (r) => { response = r; });
    clearAllTimers(manager);

    expect(response.success).toBe(true);
    expect(session.gameState).toBe('ANSWER_REVEAL');
  });

  test('не-хост не може відправити host-control', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');
    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'Петро' }, () => {});

    let response;
    // playerSocket не є хостом (хост — hostSocket)
    manager.handleHostControl(playerSocket, { roomCode, action: 'pause' }, (r) => { response = r; });

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/ведучий|хост|прав/i);
  });

  test('відхиляє неіснуючий код кімнати', () => {
    const { manager, hostSocket } = setupRoomWithQuiz();
    let response;

    manager.handleHostControl(hostSocket, { roomCode: 'XXXXXX', action: 'pause' }, (r) => { response = r; });

    expect(response.success).toBe(false);
  });

  test('відхиляє невалідну дію', () => {
    const { manager, roomCode, hostSocket } = setupRoomWithQuiz();
    let response;

    manager.handleHostControl(hostSocket, { roomCode, action: 'explode' }, (r) => { response = r; });

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/невідома дія/i);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: Phase 1 (local) — getCurrentRoom / currentActiveRoom
// ─────────────────────────────────────────────

describe('QuizRoomManager — getCurrentRoom / currentActiveRoom', () => {
  test('getCurrentRoom повертає null якщо немає активної кімнати', () => {
    const { mockIo } = createMocks();
    const manager = new QuizRoomManager(mockIo, DEFAULT_CONFIG);
    expect(manager.getCurrentRoom()).toBeNull();
  });

  test('getCurrentRoom повертає roomCode після create-quiz', () => {
    const { manager, roomCode } = setupRoomWithQuiz();
    expect(manager.getCurrentRoom()).toBe(roomCode);
  });

  test('currentActiveRoom очищається коли завершена сесія видаляється через disconnect', () => {
    const { manager, roomCode, createSocket } = setupRoomWithQuiz();
    const playerSocket = createSocket('player-1');
    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'Петро' }, () => {});

    // Симулюємо завершену гру без гравців
    manager.sessions.get(roomCode).gameState = 'ENDED';
    manager.handleDisconnect(playerSocket);

    // Сесія видалена — currentActiveRoom теж має очиститись
    expect(manager.sessions.has(roomCode)).toBe(false);
    expect(manager.getCurrentRoom()).toBeNull();
  });

  test('currentActiveRoom очищається через cleanupOldSessions', () => {
    const { manager, roomCode } = setupRoomWithQuiz();

    // Симулюємо завершену сесію без гравців
    manager.sessions.get(roomCode).gameState = 'ENDED';
    manager.cleanupOldSessions();

    expect(manager.getCurrentRoom()).toBeNull();
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: Phase 8 — quiz-storage (saveQuiz / deleteQuiz)
// ─────────────────────────────────────────────

describe('quiz-storage — saveQuiz / deleteQuiz', () => {
  const { saveQuiz, deleteQuiz, loadAllQuizzes } = require('../src/quiz-storage');
  const fs = require('fs');
  const path = require('path');

  const QUIZZES_DIR = path.join(__dirname, '..', '..', 'quizzes');
  const savedIds = [];

  afterEach(() => {
    // Очищаємо тестові файли після кожного тесту
    for (const id of savedIds) {
      try { deleteQuiz(id); } catch {}
    }
    savedIds.length = 0;
  });

  test('saveQuiz: зберігає квіз та повертає id і filename', () => {
    const quiz = {
      title: 'Тест saveQuiz',
      questions: [
        { question: 'Q?', answers: ['A', 'B', 'C', 'D'], correctAnswer: 0 }
      ]
    };

    const result = saveQuiz(quiz);
    savedIds.push(result.id);

    expect(result.id).toBeDefined();
    expect(result.filename).toBeDefined();
    expect(result.filename.endsWith('.json')).toBe(true);

    // Файл справді існує на диску
    const filePath = path.join(QUIZZES_DIR, result.filename);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('saveQuiz: збережений файл містить правильні дані', () => {
    const quiz = {
      title: 'Тест даних',
      questions: [
        { question: 'Питання?', answers: ['A', 'B', 'C', 'D'], correctAnswer: 2 }
      ]
    };

    const result = saveQuiz(quiz);
    savedIds.push(result.id);

    const filePath = path.join(QUIZZES_DIR, result.filename);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    expect(content.title).toBe('Тест даних');
    expect(content.questions).toHaveLength(1);
    expect(content.questions[0].correctAnswer).toBe(2);
  });

  test('deleteQuiz: видаляє існуючий квіз та повертає true', () => {
    const quiz = { title: 'Для видалення', questions: [{ question: 'Q?', answers: ['A','B','C','D'], correctAnswer: 0 }] };
    const result = saveQuiz(quiz);

    const deleted = deleteQuiz(result.id);
    expect(deleted).toBe(true);

    const filePath = path.join(QUIZZES_DIR, result.filename);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  test('deleteQuiz: повертає false для неіснуючого id', () => {
    const deleted = deleteQuiz('nonexistent-id-xyz');
    expect(deleted).toBe(false);
  });

  test('loadAllQuizzes: повертає масив збережених квізів', () => {
    const quiz1 = { title: 'Квіз 1', questions: [{ question: 'Q1?', answers: ['A','B','C','D'], correctAnswer: 0 }] };
    const quiz2 = { title: 'Квіз 2', questions: [{ question: 'Q2?', answers: ['A','B','C','D'], correctAnswer: 1 }] };

    const r1 = saveQuiz(quiz1);
    const r2 = saveQuiz(quiz2);
    savedIds.push(r1.id, r2.id);

    const quizzes = loadAllQuizzes();

    expect(Array.isArray(quizzes)).toBe(true);
    const titles = quizzes.map(q => q.title);
    expect(titles).toContain('Квіз 1');
    expect(titles).toContain('Квіз 2');
  });

  test('loadAllQuizzes: кожен квіз має поле id', () => {
    const quiz = { title: 'З id', questions: [{ question: 'Q?', answers: ['A','B','C','D'], correctAnswer: 0 }] };
    const result = saveQuiz(quiz);
    savedIds.push(result.id);

    const quizzes = loadAllQuizzes();
    const found = quizzes.find(q => q.id === result.id);

    expect(found).toBeDefined();
    expect(found.id).toBe(result.id);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: Podium IP registry та GPIO button-press
// ─────────────────────────────────────────────

describe('QuizRoomManager — podiumRegistry і podium-button-press', () => {
  /**
   * Хелпер: створює мок-сокет з handshake.address (як справжній Socket.IO сокет)
   */
  function createSocketWithIP(id, ip = '192.168.1.10') {
    const { mockIo } = createMocks();
    const s = {
      id,
      join: jest.fn(),
      emit: jest.fn(),
      handshake: { address: ip }
    };
    return s;
  }

  test('IP гравця реєструється в podiumRegistry після join-quiz', () => {
    const { manager, roomCode } = setupRoomWithQuiz();
    const playerSocket = createSocketWithIP('player-gpio-1', '192.168.1.10');

    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'GpioPlayer' }, () => {});

    expect(manager.podiumRegistry.get('192.168.1.10')).toBe('player-gpio-1');
  });

  test('IP гравця видаляється з podiumRegistry після disconnect', () => {
    const { manager, roomCode } = setupRoomWithQuiz();
    const playerSocket = createSocketWithIP('player-gpio-2', '192.168.1.20');

    manager.handleJoinQuiz(playerSocket, { roomCode, nickname: 'GpioPlayer2' }, () => {});
    expect(manager.podiumRegistry.has('192.168.1.20')).toBe(true);

    manager.handleDisconnect(playerSocket);
    expect(manager.podiumRegistry.has('192.168.1.20')).toBe(false);
  });

  test('podiumRegistry не містить незареєстрований IP', () => {
    const { manager } = setupRoomWithQuiz();

    // Жоден гравець не приєднався — podiumRegistry порожній
    expect(manager.podiumRegistry.get('10.0.0.99')).toBeUndefined();
  });

  test('новий join з тим самим IP перезаписує попередній socketId', () => {
    const { manager, roomCode } = setupRoomWithQuiz();
    const socket1 = createSocketWithIP('socket-old', '192.168.1.50');
    const socket2 = createSocketWithIP('socket-new', '192.168.1.50');

    manager.handleJoinQuiz(socket1, { roomCode, nickname: 'First' }, () => {});
    expect(manager.podiumRegistry.get('192.168.1.50')).toBe('socket-old');

    // Реєструємо другого гравця з тим самим IP (наприклад, планшет перезавантажився)
    manager.handleJoinQuiz(socket2, { roomCode, nickname: 'Second' }, () => {});
    expect(manager.podiumRegistry.get('192.168.1.50')).toBe('socket-new');
  });

  // Інтеграційний тест потребує справжнього Socket.IO сервера (real HTTP + io-client).
  // Цей файл використовує тільки мок-сокети, тому повноцінний e2e тест тут неможливий.
  //
  // РУЧНА ПЕРЕВІРКА:
  // 1. Запустити сервер: npm start
  // 2. Відкрити PlayerView у браузері — підключитись як гравець (nickname: 'GpioPlayer')
  // 3. Хост створює квіз та запускає гру (квіз стартує автоматично при playerCount=1)
  // 4. Коли з'являється питання — підключити другий Socket.IO клієнт з того ж хосту:
  //      const io = require('socket.io-client')('http://localhost:8080')
  //      io.emit('podium-button-press', { buttonIndex: 0 })
  // 5. Переконатись що відповідь зарахована (ANSWER_COUNT answered: 1 в PlayerView)
  it.skip('podium-button-press submits answer on behalf of player with matching IP (requires real server)', () => {
    // Цей тест пропущено — потребує реального Socket.IO сервера та io-client.
    // Архітектура тестового файлу базується на мок-сокетах без HTTP сервера.
  });
});
