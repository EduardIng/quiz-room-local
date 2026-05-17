/**
 * session.test.js - Автоматичні тести для AutoQuizSession
 *
 * Покриває:
 * - Переходи між станами (state transitions)
 * - Додавання та видалення гравців
 * - Подачу відповідей та валідацію
 * - Підрахунок балів (scoring)
 * - Логіку leaderboard
 * - Граничні випадки (edge cases)
 */

'use strict';

const AutoQuizSession = require('../src/quiz-session-auto');

// ─────────────────────────────────────────────
// ТЕСТОВІ ДАНІ
// ─────────────────────────────────────────────

/** Мінімальний квіз для тестів */
const QUIZ_DATA = {
  title: 'Тестовий квіз',
  questions: [
    {
      question: 'Скільки буде 2+2?',
      answers: ['3', '4', '5', '22'],
      correctAnswer: 1
    },
    {
      question: 'Якого кольору небо?',
      answers: ['Червоне', 'Зелене', 'Блакитне', 'Жовте'],
      correctAnswer: 2
    },
    {
      question: 'Столиця України?',
      answers: ['Львів', 'Харків', 'Одеса', 'Київ'],
      correctAnswer: 3
    }
  ]
};

/** Налаштування з короткими таймерами для швидких тестів */
const SETTINGS = {
  questionTime: 30,
  answerRevealTime: 2,
  leaderboardTime: 2,
  autoStart: false,     // Вимкнено для ручного керування в тестах
  waitForAllPlayers: true,
  minPlayers: 1,
  maxPlayers: 8
};

// ─────────────────────────────────────────────
// ХЕЛПЕРИ
// ─────────────────────────────────────────────

/**
 * Створює мок Socket.IO для перехоплення broadcast повідомлень
 * Повертає { mockIo, broadcasts } — масив де зберігаються всі відправлені події
 */
function createMockIO() {
  const broadcasts = [];
  const mockIo = {
    to: (room) => ({
      emit: (event, data) => {
        broadcasts.push({ room, event, data });
      }
    })
  };
  return { mockIo, broadcasts };
}

/**
 * Створює сесію з мок IO та повертає корисні об'єкти для тестів
 */
function createSession(quizData = QUIZ_DATA, settings = SETTINGS, db = null) {
  const { mockIo, broadcasts } = createMockIO();
  // Deep clone щоб тести не мутували спільний QUIZ_DATA
  const clonedQuiz = JSON.parse(JSON.stringify(quizData));
  const session = new AutoQuizSession(clonedQuiz, settings, db);
  session.init(mockIo, 'TEST01');
  return { session, mockIo, broadcasts };
}

/**
 * Очищає всі таймери сесії (щоб Jest не "завис")
 */
function clearSessionTimers(session) {
  clearTimeout(session.questionTimer);
  clearTimeout(session.transitionTimer);
  clearTimeout(session.categorySelectTimer);
  clearTimeout(session.autoStartTimer);
  clearTimeout(session.categoryResolveTimer);
  session.questionTimer = null;
  session.transitionTimer = null;
  session.categorySelectTimer = null;
  session.autoStartTimer = null;
  session.categoryResolveTimer = null;
}

// ─────────────────────────────────────────────
// ТЕСТИ: Ініціалізація
// ─────────────────────────────────────────────

describe('AutoQuizSession — Ініціалізація', () => {
  test('створює сесію з правильним початковим станом', () => {
    const { session } = createSession();

    expect(session.gameState).toBe('WAITING');
    expect(session.currentQuestionIndex).toBe(-1);
    expect(session.players.size).toBe(0);
    expect(session.currentAnswers.size).toBe(0);
    expect(session.roomCode).toBe('TEST01');
  });

  test('зберігає дані квізу та налаштування', () => {
    const { session } = createSession();

    expect(session.quizData.title).toBe('Тестовий квіз');
    expect(session.quizData.questions).toHaveLength(3);
    expect(session.settings.questionTime).toBe(30);
    expect(session.settings.autoStart).toBe(false);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: Управління гравцями
// ─────────────────────────────────────────────

describe('AutoQuizSession — Управління гравцями', () => {
  test('addPlayer: успішно додає гравця', () => {
    const { session } = createSession();

    const result = session.addPlayer('socket1', 'Петро');

    expect(result.success).toBe(true);
    expect(session.players.size).toBe(1);
    expect(session.players.get('socket1').nickname).toBe('Петро');
    expect(session.players.get('socket1').score).toBe(0);
  });

  test('addPlayer: відхиляє дублікат нікнейму (регістронезалежно)', () => {
    const { session } = createSession();

    session.addPlayer('socket1', 'Петро');
    const result = session.addPlayer('socket2', 'петро');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/вже зайнятий/i);
    expect(session.players.size).toBe(1);
  });

  test('addPlayer: відхиляє якщо гра вже почалась', () => {
    const { session } = createSession();

    session.addPlayer('socket1', 'Петро');
    session.gameState = 'QUESTION'; // Симулюємо запущену гру

    const result = session.addPlayer('socket2', 'Марія');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/вже почалась/i);
    expect(session.players.size).toBe(1);
  });

  test('addPlayer: відхиляє при перевищенні maxPlayers', () => {
    const { session } = createSession(QUIZ_DATA, { ...SETTINGS, maxPlayers: 2 });

    session.addPlayer('s1', 'Гравець1');
    session.addPlayer('s2', 'Гравець2');
    const result = session.addPlayer('s3', 'Гравець3');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/повна/i);
    expect(session.players.size).toBe(2);
  });

  test('removePlayer: видаляє гравця та повідомляє інших', () => {
    const { session, broadcasts } = createSession();

    session.addPlayer('socket1', 'Петро');
    session.addPlayer('socket2', 'Марія');

    // Скидаємо попередні broadcasts від addPlayer
    broadcasts.length = 0;

    session.removePlayer('socket1');

    expect(session.players.size).toBe(1);
    expect(session.players.has('socket1')).toBe(false);
    expect(session.players.has('socket2')).toBe(true);

    // Перевіряємо broadcast PLAYER_LEFT
    const playerLeftEvent = broadcasts.find(b => b.data.type === 'PLAYER_LEFT');
    expect(playerLeftEvent).toBeDefined();
    expect(playerLeftEvent.data.nickname).toBe('Петро');
  });

  test('removePlayer: ігнорує неіснуючого гравця', () => {
    const { session } = createSession();
    // Не повинно кидати помилку
    expect(() => session.removePlayer('unknown-socket')).not.toThrow();
  });

  test('allPlayersAnswered: повертає true коли всі відповіли', () => {
    const { session } = createSession();

    session.addPlayer('s1', 'Петро');
    session.addPlayer('s2', 'Марія');
    session.gameState = 'QUESTION';
    session.currentAnswers.set('s1', { answerId: 0, timestamp: Date.now(), timeSpent: 5 });
    session.currentAnswers.set('s2', { answerId: 1, timestamp: Date.now(), timeSpent: 7 });

    expect(session.allPlayersAnswered()).toBe(true);
  });

  test('allPlayersAnswered: повертає false якщо є хто не відповів', () => {
    const { session } = createSession();

    session.addPlayer('s1', 'Петро');
    session.addPlayer('s2', 'Марія');
    session.currentAnswers.set('s1', { answerId: 0, timestamp: Date.now(), timeSpent: 5 });

    expect(session.allPlayersAnswered()).toBe(false);
  });

  test('allPlayersAnswered: повертає false якщо немає гравців', () => {
    const { session } = createSession();
    expect(session.allPlayersAnswered()).toBe(false);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: Переходи між станами
// ─────────────────────────────────────────────

describe('AutoQuizSession — Переходи між станами', () => {
  test('startQuiz: переводить в STARTING та broadcast QUIZ_STARTING', () => {
    const { session, broadcasts } = createSession();
    session.addPlayer('s1', 'Петро');

    session.startQuiz();
    clearSessionTimers(session);

    expect(session.gameState).toBe('STARTING');

    const startEvent = broadcasts.find(b => b.data.type === 'QUIZ_STARTING');
    expect(startEvent).toBeDefined();
    expect(startEvent.data.countdown).toBe(3);
    expect(startEvent.data.totalQuestions).toBe(3);
  });

  test('startQuiz: ігнорується якщо стан не WAITING', () => {
    const { session } = createSession();
    session.gameState = 'QUESTION';

    session.startQuiz();
    // Стан не змінився
    expect(session.gameState).toBe('QUESTION');
  });

  test('nextQuestion: переводить в QUESTION та broadcast NEW_QUESTION', () => {
    const { session, broadcasts } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'STARTING';

    session.nextQuestion();
    clearSessionTimers(session);

    expect(session.gameState).toBe('QUESTION');
    expect(session.currentQuestionIndex).toBe(0);

    const questionEvent = broadcasts.find(b => b.data.type === 'NEW_QUESTION');
    expect(questionEvent).toBeDefined();
    expect(questionEvent.data.questionIndex).toBe(1); // 1-based
    expect(questionEvent.data.totalQuestions).toBe(3);
    expect(questionEvent.data.question.text).toBe('Скільки буде 2+2?');
    expect(questionEvent.data.question.answers).toHaveLength(4);

    // ВАЖЛИВО: правильна відповідь НЕ повинна передаватись клієнту!
    expect(questionEvent.data.correctAnswer).toBeUndefined();
  });

  test('nextQuestion: очищає відповіді попереднього питання', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'STARTING';
    session.currentAnswers.set('s1', { answerId: 0, timestamp: Date.now(), timeSpent: 5 });

    session.nextQuestion();
    clearSessionTimers(session);

    expect(session.currentAnswers.size).toBe(0);
  });

  test('nextQuestion: викликає endQuiz коли питання закінчились', () => {
    const { session, broadcasts } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'LEADERBOARD';
    // Симулюємо що всі 3 питання пройдено
    session.currentQuestionIndex = 2;

    session.nextQuestion();
    clearSessionTimers(session);

    expect(session.gameState).toBe('ENDED');
    const endEvent = broadcasts.find(b => b.data.type === 'QUIZ_ENDED');
    expect(endEvent).toBeDefined();
  });

  test('endQuestion: переводить в ANSWER_REVEAL та broadcast REVEAL_ANSWER', () => {
    const { session, broadcasts } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 10000; // 10 секунд тому

    session.endQuestion();
    clearSessionTimers(session);

    expect(session.gameState).toBe('ANSWER_REVEAL');

    const revealEvent = broadcasts.find(b => b.data.type === 'REVEAL_ANSWER');
    expect(revealEvent).toBeDefined();
    expect(revealEvent.data.correctAnswer).toBe(1); // Правильна відповідь першого питання
    expect(revealEvent.data.statistics).toBeDefined();
    expect(revealEvent.data.playerResults).toHaveLength(1);
  });

  test('endQuestion: ігнорується якщо стан не QUESTION', () => {
    const { session, broadcasts } = createSession();
    session.gameState = 'ANSWER_REVEAL'; // Вже в REVEAL

    broadcasts.length = 0;
    session.endQuestion();

    // Жодного нового broadcast не повинно бути
    const revealEvents = broadcasts.filter(b => b.data.type === 'REVEAL_ANSWER');
    expect(revealEvents).toHaveLength(0);
  });

  test('showLeaderboard: broadcast SHOW_LEADERBOARD з відсортованим рейтингом', () => {
    const { session, broadcasts } = createSession();
    session.addPlayer('s1', 'Петро');
    session.addPlayer('s2', 'Марія');
    session.players.get('s1').score = 250;
    session.players.get('s2').score = 150;
    session.gameState = 'ANSWER_REVEAL';
    session.currentQuestionIndex = 1;

    session.showLeaderboard();
    clearSessionTimers(session);

    expect(session.gameState).toBe('LEADERBOARD');

    const lbEvent = broadcasts.find(b => b.data.type === 'SHOW_LEADERBOARD');
    expect(lbEvent).toBeDefined();
    expect(lbEvent.data.leaderboard[0].nickname).toBe('Петро'); // Більше балів
    expect(lbEvent.data.leaderboard[0].position).toBe(1);
    expect(lbEvent.data.leaderboard[1].nickname).toBe('Марія');
    expect(lbEvent.data.leaderboard[1].position).toBe(2);
    expect(lbEvent.data.isLastQuestion).toBe(false);
  });

  test('endQuiz: переводить в ENDED та broadcast QUIZ_ENDED', () => {
    const { session, broadcasts } = createSession();
    session.addPlayer('s1', 'Петро');
    session.players.get('s1').score = 300;
    session.gameState = 'LEADERBOARD';
    session.currentQuestionIndex = 2;

    session.endQuiz();

    expect(session.gameState).toBe('ENDED');

    const endEvent = broadcasts.find(b => b.data.type === 'QUIZ_ENDED');
    expect(endEvent).toBeDefined();
    expect(endEvent.data.finalLeaderboard).toHaveLength(1);
    expect(endEvent.data.finalLeaderboard[0].nickname).toBe('Петро');
    expect(endEvent.data.totalQuestions).toBe(3);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: Подача відповідей
// ─────────────────────────────────────────────

describe('AutoQuizSession — Подача відповідей', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('submitAnswer: приймає правильну відповідь', () => {
    jest.useFakeTimers();
    const { session } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 5000;

    const result = session.submitAnswer('s1', 1, Date.now());

    expect(result.success).toBe(true);
    expect(session.currentAnswers.has('s1')).toBe(true);
    expect(session.currentAnswers.get('s1').answerId).toBe(1);
  });

  test('submitAnswer: відхиляє якщо стан не QUESTION', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'WAITING';

    const result = session.submitAnswer('s1', 0, Date.now());

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/не час/i);
  });

  test('submitAnswer: відхиляє невідомого гравця', () => {
    const { session } = createSession();
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now();

    const result = session.submitAnswer('unknown', 0, Date.now());

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/не знайдений/i);
  });

  test('submitAnswer: відхиляє повторну відповідь від того самого гравця', () => {
    const { session } = createSession();
    // Два гравці — щоб перша відповідь не завершила питання достроково
    session.addPlayer('s1', 'Петро');
    session.addPlayer('s2', 'Марія');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 5000;

    session.submitAnswer('s1', 1, Date.now());
    const result = session.submitAnswer('s1', 2, Date.now());

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/вже відповіли/i);
    // Перша відповідь залишилась
    expect(session.currentAnswers.get('s1').answerId).toBe(1);
  });

  test('submitAnswer: broadcast ANSWER_COUNT після відповіді', () => {
    const { session, broadcasts } = createSession();
    session.addPlayer('s1', 'Петро');
    session.addPlayer('s2', 'Марія');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 3000;

    broadcasts.length = 0;
    session.submitAnswer('s1', 1, Date.now());

    const countEvent = broadcasts.find(b => b.data.type === 'ANSWER_COUNT');
    expect(countEvent).toBeDefined();
    expect(countEvent.data.answered).toBe(1);
    expect(countEvent.data.total).toBe(2);
  });

  test('submitAnswer: завершує питання достроково якщо всі відповіли', () => {
    const { session, broadcasts } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 5000;

    session.submitAnswer('s1', 1, Date.now());
    clearSessionTimers(session);

    // waitForAllPlayers=true + всі відповіли → endQuestion() автоматично
    expect(session.gameState).toBe('ANSWER_REVEAL');
    const revealEvent = broadcasts.find(b => b.data.type === 'REVEAL_ANSWER');
    expect(revealEvent).toBeDefined();
  });

  test('submitAnswer: НЕ завершує питання якщо waitForAllPlayers=false', () => {
    const settings = { ...SETTINGS, waitForAllPlayers: false };
    const { session } = createSession(QUIZ_DATA, settings);
    session.addPlayer('s1', 'Петро');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 5000;

    session.submitAnswer('s1', 1, Date.now());
    clearSessionTimers(session);

    // Питання має залишатись активним (таймер завершить його сам)
    expect(session.gameState).toBe('QUESTION');
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: Підрахунок балів
// ─────────────────────────────────────────────

describe('AutoQuizSession — Підрахунок балів', () => {
  test('правильна відповідь дає 100+ балів', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 5000; // 5 секунд тому

    // Відповідь через 5 секунд, правильна (answerId=1)
    session.currentAnswers.set('s1', {
      answerId: 1,
      timestamp: Date.now(),
      timeSpent: 5
    });

    const results = session.updatePlayerScores(1); // correctAnswerId = 1

    const player = session.players.get('s1');
    // 100 базових + (30-5)*2 = 100+50 = 150
    expect(player.score).toBe(150);
    expect(player.correctAnswers).toBe(1);
    expect(results[0].isCorrect).toBe(true);
    expect(results[0].pointsEarned).toBe(150);
  });

  test('неправильна відповідь дає 0 балів', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 5000;

    // Неправильна відповідь (answerId=0, правильна=1)
    session.currentAnswers.set('s1', {
      answerId: 0,
      timestamp: Date.now(),
      timeSpent: 5
    });

    const results = session.updatePlayerScores(1);

    expect(session.players.get('s1').score).toBe(0);
    expect(session.players.get('s1').correctAnswers).toBe(0);
    expect(results[0].isCorrect).toBe(false);
    expect(results[0].pointsEarned).toBe(0);
  });

  test('відсутня відповідь (час вийшов) дає 0 балів', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 31000;
    // Немає відповіді в currentAnswers

    const results = session.updatePlayerScores(1);

    expect(session.players.get('s1').score).toBe(0);
    expect(results[0].didNotAnswer).toBe(true);
    expect(results[0].pointsEarned).toBe(0);
  });

  test('швидша відповідь дає більше балів', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'Швидкий');
    session.addPlayer('s2', 'Повільний');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 20000;

    // Швидкий відповів за 3 секунди, повільний за 25
    session.currentAnswers.set('s1', { answerId: 1, timestamp: Date.now(), timeSpent: 3 });
    session.currentAnswers.set('s2', { answerId: 1, timestamp: Date.now(), timeSpent: 25 });

    session.updatePlayerScores(1);

    const fastScore = session.players.get('s1').score;
    const slowScore = session.players.get('s2').score;

    expect(fastScore).toBeGreaterThan(slowScore);
    // Швидкий: 100 + (30-3)*2 = 154
    expect(fastScore).toBe(154);
    // Повільний: 100 + (30-25)*2 = 110
    expect(slowScore).toBe(110);
  });

  test('calculateLeaderboard: сортує за балами (більше = перший)', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'Третій');
    session.addPlayer('s2', 'Перший');
    session.addPlayer('s3', 'Другий');
    session.players.get('s1').score = 100;
    session.players.get('s2').score = 300;
    session.players.get('s3').score = 200;
    session.currentQuestionIndex = 0;

    const leaderboard = session.calculateLeaderboard();

    expect(leaderboard[0].nickname).toBe('Перший');
    expect(leaderboard[0].position).toBe(1);
    expect(leaderboard[1].nickname).toBe('Другий');
    expect(leaderboard[1].position).toBe(2);
    expect(leaderboard[2].nickname).toBe('Третій');
    expect(leaderboard[2].position).toBe(3);
  });

  test('calculateLeaderboard: тай-брейкер за середнім часом відповіді', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'Повільний');
    session.addPlayer('s2', 'Швидкий');
    // Однакові бали
    session.players.get('s1').score = 100;
    session.players.get('s2').score = 100;
    // Але швидший середній час
    session.players.get('s1').correctAnswers = 1;
    session.players.get('s1').totalAnswerTime = 20; // 20 сек
    session.players.get('s2').correctAnswers = 1;
    session.players.get('s2').totalAnswerTime = 5;  // 5 сек
    session.currentQuestionIndex = 0;

    const leaderboard = session.calculateLeaderboard();

    // Швидший при однакових балах отримує вищу позицію
    expect(leaderboard[0].nickname).toBe('Швидкий');
    expect(leaderboard[1].nickname).toBe('Повільний');
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: getState
// ─────────────────────────────────────────────

describe('AutoQuizSession — getState', () => {
  test('повертає правильний стан для синхронізації клієнта', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'Петро');

    const state = session.getState();

    expect(state.gameState).toBe('WAITING');
    expect(state.players).toHaveLength(1);
    expect(state.players[0].nickname).toBe('Петро');
    expect(state.totalQuestions).toBe(3);
    expect(state.quizTitle).toBe('Тестовий квіз');
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: removePlayer під час гри
// ─────────────────────────────────────────────

describe('AutoQuizSession — Відключення під час гри', () => {
  test('видаляє відповідь гравця при відключенні', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'Петро');
    session.addPlayer('s2', 'Марія');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now();
    session.currentAnswers.set('s1', { answerId: 1, timestamp: Date.now(), timeSpent: 5 });

    session.removePlayer('s1');

    expect(session.currentAnswers.has('s1')).toBe(false);
    expect(session.players.size).toBe(1);
  });

  test('завершує питання якщо всі що залишились вже відповіли', () => {
    const { session, broadcasts } = createSession();
    session.addPlayer('s1', 'Петро');
    session.addPlayer('s2', 'Марія');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 5000;
    // Марія вже відповіла, Петро ні
    session.currentAnswers.set('s2', { answerId: 2, timestamp: Date.now(), timeSpent: 5 });

    broadcasts.length = 0;
    // Петро відключається → залишається тільки Марія яка вже відповіла
    session.removePlayer('s1');
    clearSessionTimers(session);

    // Питання завершилось автоматично
    expect(session.gameState).toBe('ANSWER_REVEAL');
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: Phase 9 — Host Controls (pause/resume/skip/forceStart)
// ─────────────────────────────────────────────

describe('AutoQuizSession — Host Controls', () => {
  test('pauseGame: встановлює isPaused=true та broadcast GAME_PAUSED', () => {
    const { session, broadcasts } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 10000;
    session.currentTimerLimit = 30;

    broadcasts.length = 0;
    session.pauseGame();
    clearSessionTimers(session);

    expect(session.isPaused).toBe(true);
    const pauseEvent = broadcasts.find(b => b.data.type === 'GAME_PAUSED');
    expect(pauseEvent).toBeDefined();
    expect(pauseEvent.data.timeRemaining).toBeGreaterThan(0);
    expect(pauseEvent.data.timeRemaining).toBeLessThanOrEqual(30);
  });

  test('pauseGame: ігнорується якщо вже на паузі', () => {
    const { session, broadcasts } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 5000;
    session.currentTimerLimit = 30;
    session.isPaused = true; // вже на паузі

    broadcasts.length = 0;
    session.pauseGame();

    const pauseEvents = broadcasts.filter(b => b.data.type === 'GAME_PAUSED');
    expect(pauseEvents).toHaveLength(0);
  });

  test('pauseGame: ігнорується якщо стан не QUESTION', () => {
    const { session, broadcasts } = createSession();
    session.gameState = 'WAITING';

    broadcasts.length = 0;
    session.pauseGame();

    const pauseEvents = broadcasts.filter(b => b.data.type === 'GAME_PAUSED');
    expect(pauseEvents).toHaveLength(0);
  });

  test('resumeGame: встановлює isPaused=false та broadcast GAME_RESUMED', () => {
    const { session, broadcasts } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 5000;
    session.currentTimerLimit = 30;
    session.isPaused = true;
    session.questionTimeRemaining = 20;
    session.pausedAt = Date.now();

    broadcasts.length = 0;
    session.resumeGame();
    clearSessionTimers(session);

    expect(session.isPaused).toBe(false);
    const resumeEvent = broadcasts.find(b => b.data.type === 'GAME_RESUMED');
    expect(resumeEvent).toBeDefined();
    expect(resumeEvent.data.timeRemaining).toBeGreaterThan(0);
  });

  test('resumeGame: ігнорується якщо не на паузі', () => {
    const { session, broadcasts } = createSession();
    session.gameState = 'QUESTION';
    session.isPaused = false;

    broadcasts.length = 0;
    session.resumeGame();

    const resumeEvents = broadcasts.filter(b => b.data.type === 'GAME_RESUMED');
    expect(resumeEvents).toHaveLength(0);
  });

  test('forceStart: запускає гру зі стану WAITING', () => {
    const { session, broadcasts } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'WAITING';

    broadcasts.length = 0;
    session.forceStart();
    clearSessionTimers(session);

    // Гра стартує (STARTING або одразу QUESTION)
    expect(['STARTING', 'QUESTION']).toContain(session.gameState);
    const startEvent = broadcasts.find(b =>
      b.data.type === 'QUIZ_STARTING' || b.data.type === 'NEW_QUESTION'
    );
    expect(startEvent).toBeDefined();
  });

  test('forceStart: ігнорується якщо стан не WAITING', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;

    // Не повинно кидати помилку і не змінювати стан
    expect(() => session.forceStart()).not.toThrow();
    expect(session.gameState).toBe('QUESTION');
  });

  test('skipQuestion: з QUESTION переходить в ANSWER_REVEAL', () => {
    const { session, broadcasts } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 5000;

    broadcasts.length = 0;
    session.skipQuestion();
    clearSessionTimers(session);

    expect(session.gameState).toBe('ANSWER_REVEAL');
    const revealEvent = broadcasts.find(b => b.data.type === 'REVEAL_ANSWER');
    expect(revealEvent).toBeDefined();
  });

  test('skipQuestion: з ANSWER_REVEAL переходить до LEADERBOARD', () => {
    const { session, broadcasts } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'ANSWER_REVEAL';
    session.currentQuestionIndex = 0;

    broadcasts.length = 0;
    session.skipQuestion();
    clearSessionTimers(session);

    expect(session.gameState).toBe('LEADERBOARD');
    const lbEvent = broadcasts.find(b => b.data.type === 'SHOW_LEADERBOARD');
    expect(lbEvent).toBeDefined();
  });

  test('skipQuestion: з LEADERBOARD переходить до наступного питання', () => {
    const { session, broadcasts } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'LEADERBOARD';
    session.currentQuestionIndex = 0; // є ще питання

    broadcasts.length = 0;
    session.skipQuestion();
    clearSessionTimers(session);

    expect(session.gameState).toBe('QUESTION');
    const questionEvent = broadcasts.find(b => b.data.type === 'NEW_QUESTION');
    expect(questionEvent).toBeDefined();
  });

  test('skipQuestion: з LEADERBOARD при останньому питанні переходить в ENDED', () => {
    const { session, broadcasts } = createSession();
    session.addPlayer('s1', 'Петро');
    session.gameState = 'LEADERBOARD';
    session.currentQuestionIndex = 2; // останнє (всього 3 питання, індекси 0-2)

    broadcasts.length = 0;
    session.skipQuestion();
    clearSessionTimers(session);

    expect(session.gameState).toBe('ENDED');
    const endEvent = broadcasts.find(b => b.data.type === 'QUIZ_ENDED');
    expect(endEvent).toBeDefined();
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: Phase 8 — Category Mode
// ─────────────────────────────────────────────

const CATEGORY_QUIZ = {
  title: 'Категорійний квіз',
  categoryMode: true,
  rounds: [
    {
      options: [
        { category: 'Географія', question: 'Столиця Франції?', answers: ['Берлін', 'Рим', 'Париж', 'Мадрид'], correctAnswer: 2 },
        { category: 'Спорт', question: 'Гра з м\'ячем?', answers: ['Шахи', 'Футбол', 'Теніс', 'Плавання'], correctAnswer: 1 }
      ]
    },
    {
      options: [
        { category: 'Наука', question: 'H2O = ?', answers: ['Сіль', 'Вода', 'Кисень', 'Вуглець'], correctAnswer: 1 },
        { category: 'Мистецтво', question: 'Автор "Мони Лізи"?', answers: ['Пікассо', 'Ван Гог', 'Да Вінчі', 'Рафаель'], correctAnswer: 2 }
      ]
    }
  ]
};

describe('AutoQuizSession — Category Mode', () => {
  test('startCategorySelect: broadcast CATEGORY_SELECT у categoryMode', () => {
    const { session, broadcasts } = createSession(CATEGORY_QUIZ);
    session.addPlayer('s1', 'Петро');
    session.addPlayer('s2', 'Марія');
    // In category mode, startQuiz calls startCategorySelect (not nextQuestion)
    session.gameState = 'STARTING';

    broadcasts.length = 0;
    session.startCategorySelect(); // starts selection for round 0
    clearSessionTimers(session);

    expect(session.gameState).toBe('CATEGORY_SELECT');
    const catEvent = broadcasts.find(b => b.data.type === 'CATEGORY_SELECT');
    expect(catEvent).toBeDefined();
    expect(catEvent.data.options).toHaveLength(2);
    expect(catEvent.data.options[0].category).toBe('Географія');
    expect(catEvent.data.options[1].category).toBe('Спорт');
    expect(catEvent.data.chooserNickname).toBeDefined();
  });

  test('submitCategory: гравець-chooser може обрати категорію', () => {
    jest.useFakeTimers();
    const { session, broadcasts } = createSession(CATEGORY_QUIZ);
    session.addPlayer('s1', 'Петро');
    session.addPlayer('s2', 'Марія');
    session.gameState = 'STARTING';
    session.startCategorySelect();

    // Chooser socket is stored directly on session
    const chooserId = session.currentChooserSocketId;

    broadcasts.length = 0;
    const result = session.submitCategory(chooserId, 0);
    jest.clearAllTimers();

    expect(result.success).toBe(true);
    // Має broadcast CATEGORY_CHOSEN
    const chosenEvent = broadcasts.find(b => b.data.type === 'CATEGORY_CHOSEN');
    expect(chosenEvent).toBeDefined();
    expect(chosenEvent.data.category).toBe('Географія');
  });

  test('submitCategory: відхиляє якщо не chooser', () => {
    const { session, broadcasts } = createSession(CATEGORY_QUIZ);
    session.addPlayer('s1', 'Петро');
    session.addPlayer('s2', 'Марія');
    session.gameState = 'STARTING';
    session.startCategorySelect();
    clearSessionTimers(session);

    // Find who is NOT the chooser
    const chooserId = session.currentChooserSocketId;
    const nonChooserId = chooserId === 's1' ? 's2' : 's1';

    const result = session.submitCategory(nonChooserId, 0);
    expect(result.success).toBe(false);
    // Error says it's not their turn
    expect(result.error).toMatch(/черга|ваша черга|не ваш|не твоя/i);
  });

  test('submitCategory: відхиляє якщо стан не CATEGORY_SELECT', () => {
    const { session } = createSession(CATEGORY_QUIZ);
    session.addPlayer('s1', 'Петро');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;

    const result = session.submitCategory('s1', 0);
    expect(result.success).toBe(false);
  });

  test('submitCategory: відхиляє невалідний optionIndex', () => {
    const { session, broadcasts } = createSession(CATEGORY_QUIZ);
    session.addPlayer('s1', 'Петро');
    session.gameState = 'STARTING';
    session.startCategorySelect();
    clearSessionTimers(session);

    const chooserId = session.currentChooserSocketId;

    const result = session.submitCategory(chooserId, 5); // invalid index (not 0 or 1)
    expect(result.success).toBe(false);
  });

  test('autoStart запускає гру коли playerCount гравців приєдналось', () => {
    jest.useFakeTimers();
    const settings = { ...SETTINGS, playerCount: 2, autoStart: true,
      categoryChosenTime: 4, questionTime: 30, answerRevealTime: 5, leaderboardTime: 5 };
    const { mockIo } = createMockIO();
    const session = new AutoQuizSession(CATEGORY_QUIZ, settings);
    session.init(mockIo, 'ROOM1');

    const broadcasts = [];
    session.io = {
      to: () => ({ emit: (_, msg) => broadcasts.push(msg) })
    };

    session.addPlayer('socket1', 'Alice');
    expect(broadcasts.find(m => m.type === 'QUIZ_STARTING')).toBeUndefined();

    session.addPlayer('socket2', 'Bob');
    jest.advanceTimersByTime(600);

    expect(broadcasts.find(m => m.type === 'QUIZ_STARTING')).toBeDefined();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('_resolveCategory затримує nextQuestion на categoryChosenTime секунд', (done) => {
    jest.useFakeTimers();
    const { session, broadcasts } = createCategorySession();
    session.addPlayer('s1', 'Аліса');
    session.gameState = 'STARTING';
    session.currentQuestionIndex = -1;

    session.startCategorySelect();
    jest.clearAllTimers(); // clear the categorySelectTimer

    session._resolveCategory(0, 0, false); // broadcasts CATEGORY_CHOSEN, sets transitionTimer
    // CATEGORY_SETTINGS.categoryChosenTime=0, після фікса це дійсно 0мс,
    // але advanceTimersByTime(4000) все одно проходить таймер
    jest.advanceTimersByTime(4000); // fires transitionTimer → nextQuestion → sets 30s questionTimer
    jest.clearAllTimers(); // clear the questionTimer to avoid cascading

    const newQEvt = broadcasts.find(b => b.data.type === 'NEW_QUESTION');
    expect(newQEvt).toBeDefined();
    expect(session.gameState).toBe('QUESTION');
    jest.useRealTimers();
    done();
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: Category Mode — startCategorySelect / submitCategory
// ─────────────────────────────────────────────

const CATEGORY_QUIZ_3R = {
  title: 'Категорійний квіз',
  categoryMode: true,
  rounds: [
    {
      options: [
        { category: 'Географія', question: 'Столиця Франції?', answers: ['Берлін','Лондон','Париж','Рим'], correctAnswer: 2 },
        { category: 'Наука',     question: 'H2O — це?',        answers: ['Вода','Кисень','Залізо','Вуглець'], correctAnswer: 0 }
      ]
    },
    {
      options: [
        { category: 'Спорт', question: 'Скільки гравців у хокейній команді на льоду?', answers: ['4','5','6','7'], correctAnswer: 2 },
        { category: 'Кіно',  question: 'Режисер «Titanic»?', answers: ['Спілберг','Кемерон','Нолан','Скорсезе'], correctAnswer: 1 }
      ]
    },
    {
      options: [
        { category: 'Музика', question: 'Скільки нот?', answers: ['5','6','7','8'], correctAnswer: 2 },
        { category: 'Техніка', question: 'CPU — це?', answers: ['Відеокарта','Процесор','Диск','Мережа'], correctAnswer: 1 }
      ]
    }
  ]
};

const CATEGORY_SETTINGS = {
  questionTime: 30,
  answerRevealTime: 1,
  leaderboardTime: 1,
  categoryChosenTime: 0,   // 0 = instant transition for tests
  autoStart: false,
  waitForAllPlayers: true,
  minPlayers: 1,
  maxPlayers: 8
};

function createCategorySession() {
  const { mockIo, broadcasts } = createMockIO();
  const session = new AutoQuizSession(CATEGORY_QUIZ_3R, CATEGORY_SETTINGS);
  session.init(mockIo, 'CAT01');
  return { session, mockIo, broadcasts };
}

describe('AutoQuizSession — Category Mode: startCategorySelect', () => {
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  test('стан переходить у CATEGORY_SELECT', () => {
    const { session } = createCategorySession();
    session.addPlayer('s1', 'Аліса');
    session.gameState = 'STARTING';
    session.currentQuestionIndex = -1;

    session.startCategorySelect();

    expect(session.gameState).toBe('CATEGORY_SELECT');
    clearTimeout(session.categorySelectTimer);
  });

  test('broadcast CATEGORY_SELECT містить options і chooserNickname', () => {
    const { session, broadcasts } = createCategorySession();
    session.addPlayer('s1', 'Аліса');
    session.gameState = 'STARTING';
    session.currentQuestionIndex = -1;

    session.startCategorySelect();

    const evt = broadcasts.find(b => b.data.type === 'CATEGORY_SELECT');
    expect(evt).toBeDefined();
    expect(evt.data.chooserNickname).toBe('Аліса');
    expect(evt.data.options).toHaveLength(2);
    expect(evt.data.options[0].category).toBe('Географія');
    expect(evt.data.options[1].category).toBe('Наука');
    clearTimeout(session.categorySelectTimer);
  });

  test('з кількома гравцями chooser обирається по черзі', () => {
    jest.useFakeTimers();
    const { session, broadcasts } = createCategorySession();
    session.addPlayer('s1', 'Аліса');
    session.addPlayer('s2', 'Богдан');
    session.gameState = 'STARTING';
    session.currentQuestionIndex = -1;

    // Round 1 — chooser: Аліса (index 0)
    session.startCategorySelect();
    const evt1 = broadcasts.filter(b => b.data.type === 'CATEGORY_SELECT').at(-1);
    expect(evt1.data.chooserNickname).toBe('Аліса');
    jest.clearAllTimers();

    // Simulate choosing and advancing to next round (categoryChosenTime=0 → instant)
    session._resolveCategory(0, 0, false);
    jest.clearAllTimers(); // clear the 0ms transitionTimer before it fires nextQuestion

    // Manually advance to round 2 category select
    session.currentQuestionIndex = 0; // finished Q1
    session.gameState = 'LEADERBOARD';
    session.startCategorySelect();
    const evt2 = broadcasts.filter(b => b.data.type === 'CATEGORY_SELECT').at(-1);
    expect(evt2.data.chooserNickname).toBe('Богдан');
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('якщо немає гравців — endQuiz() викликається', () => {
    const { session, broadcasts } = createCategorySession();
    session.gameState = 'STARTING';
    session.currentQuestionIndex = -1;

    session.startCategorySelect();

    const evt = broadcasts.find(b => b.data.type === 'QUIZ_ENDED');
    expect(evt).toBeDefined();
    expect(session.gameState).toBe('ENDED');
  });
});

describe('AutoQuizSession — Category Mode: submitCategory', () => {
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  test('chooser може обрати категорію', () => {
    jest.useFakeTimers();
    const { session, broadcasts } = createCategorySession();
    session.addPlayer('s1', 'Аліса');
    session.gameState = 'STARTING';
    session.currentQuestionIndex = -1;
    session.startCategorySelect();

    const result = session.submitCategory('s1', 0);

    expect(result.success).toBe(true);
    const chosenEvt = broadcasts.find(b => b.data.type === 'CATEGORY_CHOSEN');
    expect(chosenEvt).toBeDefined();
    expect(chosenEvt.data.choiceIndex).toBe(0);
    expect(chosenEvt.data.category).toBe('Географія');
    expect(chosenEvt.data.wasTimeout).toBe(false);
    jest.clearAllTimers();
  });

  test('не-chooser не може обрати категорію', () => {
    const { session } = createCategorySession();
    session.addPlayer('s1', 'Аліса');
    session.addPlayer('s2', 'Богдан');
    session.gameState = 'STARTING';
    session.currentQuestionIndex = -1;
    session.startCategorySelect();

    // s2 is not the chooser (s1 is)
    const result = session.submitCategory('s2', 0);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/черга/i);
    clearTimeout(session.categorySelectTimer);
  });

  test('submitCategory поза фазою CATEGORY_SELECT → помилка', () => {
    const { session } = createCategorySession();
    session.addPlayer('s1', 'Аліса');
    session.gameState = 'QUESTION';

    const result = session.submitCategory('s1', 0);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/не час/i);
  });

  test('таймер авто-вибору скасовується після ручного вибору', () => {
    jest.useFakeTimers();
    const { session } = createCategorySession();
    session.addPlayer('s1', 'Аліса');
    session.gameState = 'STARTING';
    session.currentQuestionIndex = -1;
    session.startCategorySelect();

    session.submitCategory('s1', 1);
    // categorySelectTimer should be null after submitCategory clears it
    expect(session.categorySelectTimer).toBeNull();
    jest.clearAllTimers();
  });

  test('_resolveCategory додає питання до quizData.questions', () => {
    jest.useFakeTimers();
    const { session } = createCategorySession();
    session.addPlayer('s1', 'Аліса');
    session.gameState = 'STARTING';
    session.currentQuestionIndex = -1;
    session.startCategorySelect();

    session.submitCategory('s1', 1); // вибираємо 'Наука'
    jest.clearAllTimers();

    expect(session.quizData.questions).toHaveLength(1);
    expect(session.quizData.questions[0].category).toBe('Наука');
    expect(session.quizData.questions[0].correctAnswer).toBe(0);
  });
});

describe('AutoQuizSession — Category Mode: chooser disconnects during CATEGORY_SELECT', () => {
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  test('chooser відключається → авто-вибір випадкової категорії', () => {
    jest.useFakeTimers();
    const { session, broadcasts } = createCategorySession();
    session.addPlayer('s1', 'Аліса');
    session.addPlayer('s2', 'Богдан');
    session.gameState = 'STARTING';
    session.currentQuestionIndex = -1;
    session.startCategorySelect();

    // Аліса — chooser, відключається
    session.removePlayer('s1');

    // Should auto-resolve
    const chosenEvt = broadcasts.find(b => b.data.type === 'CATEGORY_CHOSEN');
    expect(chosenEvt).toBeDefined();
    expect(chosenEvt.data.wasTimeout).toBe(true);
    jest.clearAllTimers();
  });
});

describe('AutoQuizSession — Category Mode: getState() in CATEGORY_SELECT', () => {
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  test('getState() в CATEGORY_SELECT містить isCategoryMode та gameState', () => {
    const { session } = createCategorySession();
    session.addPlayer('s1', 'Аліса');
    session.gameState = 'STARTING';
    session.currentQuestionIndex = -1;
    session.startCategorySelect();

    const state = session.getState();

    expect(state.gameState).toBe('CATEGORY_SELECT');
    expect(state.isCategoryMode).toBe(true);
    expect(state.targetPlayerCount).toBe(1); // minPlayers default
    clearTimeout(session.categorySelectTimer);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: AutoStart тригер
// ─────────────────────────────────────────────

describe('AutoQuizSession — autoStart trigger via addPlayer', () => {
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  test('autoStart запускає квіз коли players.size >= playerCount', () => {
    jest.useFakeTimers();
    const { session, broadcasts } = createCategorySession();
    // Override settings: autoStart=true, playerCount=2
    session.settings.autoStart = true;
    session.playerCount = 2;

    session.addPlayer('s1', 'Аліса');
    expect(session.gameState).toBe('WAITING'); // 1 player, not yet

    session.addPlayer('s2', 'Богдан');
    // autoStart fires after 500ms setTimeout in addPlayer
    jest.advanceTimersByTime(600);

    expect(session.gameState).toBe('STARTING');
    const startEvt = broadcasts.find(b => b.data.type === 'QUIZ_STARTING');
    expect(startEvt).toBeDefined();
    jest.clearAllTimers();
  });

  test('autoStart НЕ запускає квіз якщо players < playerCount', () => {
    jest.useFakeTimers();
    const { session } = createCategorySession();
    session.settings.autoStart = true;
    session.playerCount = 3;

    session.addPlayer('s1', 'Аліса');
    session.addPlayer('s2', 'Богдан');
    jest.advanceTimersByTime(1000);

    expect(session.gameState).toBe('WAITING');
    jest.clearAllTimers();
  });

  test('autoStart вимкнено — гра не стартує автоматично', () => {
    jest.useFakeTimers();
    const { session } = createCategorySession();
    session.settings.autoStart = false;
    session.playerCount = 1;

    session.addPlayer('s1', 'Аліса');
    jest.advanceTimersByTime(1000);

    expect(session.gameState).toBe('WAITING');
    jest.clearAllTimers();
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: Повний цикл категорійної гри
// ─────────────────────────────────────────────

describe('AutoQuizSession — Full category game flow (1 round)', () => {
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  test('повний цикл: WAITING → CATEGORY_SELECT → QUESTION → ANSWER_REVEAL → LEADERBOARD → ENDED', () => {
    jest.useFakeTimers();

    // Квіз з одним раундом для перевірки повного циклу
    const oneRoundQuiz = {
      title: 'Один раунд',
      categoryMode: true,
      rounds: [
        {
          options: [
            { category: 'Географія', question: 'Столиця Франції?', answers: ['Берлін','Лондон','Париж','Рим'], correctAnswer: 2 },
            { category: 'Наука',     question: 'H2O — це?',        answers: ['Вода','Кисень','Залізо','Вуглець'], correctAnswer: 0 }
          ]
        }
      ]
    };
    const { mockIo, broadcasts } = createMockIO();
    const session = new AutoQuizSession(oneRoundQuiz, CATEGORY_SETTINGS);
    session.init(mockIo, 'FLOW01');
    session.addPlayer('s1', 'Петро');

    // startQuiz → STARTING
    session.startQuiz();
    expect(session.gameState).toBe('STARTING');

    // 3s countdown → startCategorySelect → CATEGORY_SELECT
    jest.advanceTimersByTime(3100);
    expect(session.gameState).toBe('CATEGORY_SELECT');

    // Гравець вибирає категорію 0 (Географія, correctAnswer=2)
    session.submitCategory('s1', 0);
    // CATEGORY_SETTINGS.categoryChosenTime=0, після фікса це дійсно 0мс,
    // але advanceTimersByTime(4100) все одно проходить таймер
    jest.advanceTimersByTime(4100);
    expect(session.gameState).toBe('QUESTION');

    // Подаємо правильну відповідь (2 = Париж)
    session.submitAnswer('s1', 2, Date.now());
    // waitForAllPlayers=true, 1 гравець → endQuestion негайно
    expect(session.gameState).toBe('ANSWER_REVEAL');

    // answerRevealTime=1s → LEADERBOARD
    jest.advanceTimersByTime(1100);
    expect(session.gameState).toBe('LEADERBOARD');

    // leaderboardTime=1s → ENDED (останній раунд)
    jest.advanceTimersByTime(1100);
    expect(session.gameState).toBe('ENDED');

    const endEvt = broadcasts.find(b => b.data.type === 'QUIZ_ENDED');
    expect(endEvt).toBeDefined();
    expect(endEvt.data.finalLeaderboard[0].nickname).toBe('Петро');
    // Правильна відповідь → score > 0
    expect(endEvt.data.finalLeaderboard[0].score).toBeGreaterThan(0);

    jest.clearAllTimers();
  });

  test('два гравці: chooser ротується між раундами', () => {
    jest.useFakeTimers();

    // Квіз з двома раундами для перевірки ротації chooser
    const twoRoundQuiz = {
      title: 'Два раунди',
      categoryMode: true,
      rounds: [
        {
          options: [
            { category: 'Р1-А', question: 'Q1?', answers: ['A','B','C','D'], correctAnswer: 0 },
            { category: 'Р1-Б', question: 'Q2?', answers: ['A','B','C','D'], correctAnswer: 1 }
          ]
        },
        {
          options: [
            { category: 'Р2-А', question: 'Q3?', answers: ['A','B','C','D'], correctAnswer: 2 },
            { category: 'Р2-Б', question: 'Q4?', answers: ['A','B','C','D'], correctAnswer: 3 }
          ]
        }
      ]
    };
    const { mockIo, broadcasts } = createMockIO();
    const session = new AutoQuizSession(twoRoundQuiz, CATEGORY_SETTINGS);
    session.init(mockIo, 'ROT01');
    session.addPlayer('s1', 'Аліса');
    session.addPlayer('s2', 'Богдан');

    session.startQuiz();
    jest.advanceTimersByTime(3100); // → CATEGORY_SELECT раунд 1

    // Раунд 1: Аліса — chooser
    let catEvts = broadcasts.filter(b => b.data.type === 'CATEGORY_SELECT');
    expect(catEvts.at(-1).data.chooserNickname).toBe('Аліса');

    session.submitCategory('s1', 0); // Аліса вибирає Р1-А
    jest.advanceTimersByTime(4100); // → QUESTION
    expect(session.gameState).toBe('QUESTION');

    // Обидва гравці відповідають
    session.submitAnswer('s1', 0, Date.now());
    session.submitAnswer('s2', 0, Date.now());
    // waitForAllPlayers → endQuestion негайно → ANSWER_REVEAL
    expect(session.gameState).toBe('ANSWER_REVEAL');

    jest.advanceTimersByTime(1100); // → LEADERBOARD
    jest.advanceTimersByTime(1100); // → CATEGORY_SELECT раунд 2

    // Раунд 2: Богдан — chooser
    catEvts = broadcasts.filter(b => b.data.type === 'CATEGORY_SELECT');
    expect(catEvts.at(-1).data.chooserNickname).toBe('Богдан');

    jest.clearAllTimers();
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: додаткові edge cases
// ─────────────────────────────────────────────

describe('AutoQuizSession — edge cases', () => {
  afterEach(() => { jest.clearAllTimers(); });

  test('removePlayer не крашить для неіснуючого socketId', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'Player');
    // Не повинен крашити
    session.removePlayer('nonexistent');
    expect(session.players.size).toBe(1);
    clearSessionTimers(session);
  });

  test('submitAnswer повертає помилку якщо гравець не в кімнаті', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'Player');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now();

    const result = session.submitAnswer('unknown', 0, Date.now());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/не знайдений/i);
    clearSessionTimers(session);
  });

  test('submitAnswer повертає помилку при повторній відповіді', () => {
    // Потрібно 2+ гравці щоб waitForAllPlayers не завершив питання після першої відповіді
    const { session } = createSession();
    session.addPlayer('s1', 'Player1');
    session.addPlayer('s2', 'Player2');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now();

    session.submitAnswer('s1', 0, Date.now());
    // Стан все ще QUESTION бо s2 ще не відповів
    expect(session.gameState).toBe('QUESTION');
    const result = session.submitAnswer('s1', 1, Date.now());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/вже відповіли/i);
    clearSessionTimers(session);
  });

  test('pauseGame не працює в стані WAITING', () => {
    const { session } = createSession();
    const result = session.pauseGame();
    expect(result.success).toBe(false);
    clearSessionTimers(session);
  });

  test('resumeGame не працює без попереднього pause', () => {
    const { session } = createSession();
    const result = session.resumeGame();
    expect(result.success).toBe(false);
    clearSessionTimers(session);
  });

  test('forceStart не працює якщо гра вже почалась', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'P');
    session.gameState = 'QUESTION';

    const result = session.forceStart();
    expect(result.success).toBe(false);
    clearSessionTimers(session);
  });

  test('endQuestion ігнорується якщо стан не QUESTION', () => {
    const { session, broadcasts } = createSession();
    session.gameState = 'WAITING';
    const beforeLen = broadcasts.length;

    session.endQuestion();
    // Жодних broadcast — метод повернувся одразу
    expect(broadcasts.length).toBe(beforeLen);
    clearSessionTimers(session);
  });

  test('showLeaderboard ігнорується якщо стан ENDED', () => {
    const { session, broadcasts } = createSession();
    session.gameState = 'ENDED';
    const beforeLen = broadcasts.length;

    session.showLeaderboard();
    expect(broadcasts.length).toBe(beforeLen);
    clearSessionTimers(session);
  });

  test('allPlayersAnswered повертає false з 0 гравців', () => {
    const { session } = createSession();
    expect(session.allPlayersAnswered()).toBe(false);
    clearSessionTimers(session);
  });

  test('getState повертає CATEGORY_SELECT інфо', () => {
    const { session } = createSession(CATEGORY_QUIZ);
    session.addPlayer('s1', 'Player');
    session.gameState = 'CATEGORY_SELECT';

    const state = session.getState();
    expect(state.gameState).toBe('CATEGORY_SELECT');
    expect(state.isCategoryMode).toBe(true);
    clearSessionTimers(session);
  });

  test('calculateLeaderboard сортує за балами, потім за avgAnswerTime', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'Fast');
    session.addPlayer('s2', 'Slow');

    const fast = session.players.get('s1');
    fast.score = 200;
    fast.correctAnswers = 2;
    fast.totalAnswerTime = 4; // avg = 2

    const slow = session.players.get('s2');
    slow.score = 200;
    slow.correctAnswers = 2;
    slow.totalAnswerTime = 10; // avg = 5

    const lb = session.calculateLeaderboard();
    expect(lb[0].nickname).toBe('Fast');
    expect(lb[1].nickname).toBe('Slow');
    clearSessionTimers(session);
  });

  test('endQuiz зберігає сесію в БД', () => {
    const mockDb = { saveSession: jest.fn() };
    const { session } = createSession(undefined, undefined, mockDb);
    session.addPlayer('s1', 'Player');
    session.startedAt = Date.now();
    session.gameState = 'LEADERBOARD'; // мінуючи startQuiz
    session.currentQuestionIndex = 0;
    session.quizData.questions = [{ question: 'Q?', answers: ['A','B','C','D'], correctAnswer: 0 }];

    session.endQuiz();
    expect(mockDb.saveSession).toHaveBeenCalledTimes(1);
    expect(session.gameState).toBe('ENDED');
    clearSessionTimers(session);
  });

  test('broadcast не крашить без init()', () => {
    const AutoQuizSession = require('../src/quiz-session-auto');
    const session = new AutoQuizSession(
      { title: 'T', categoryMode: true, rounds: CATEGORY_QUIZ.rounds },
      CATEGORY_SETTINGS
    );
    // io та roomCode не встановлені — broadcast має логувати помилку, не крашити
    expect(() => session.broadcast({ type: 'TEST' })).not.toThrow();
  });

  test('skipQuestion пропускає ANSWER_REVEAL → LEADERBOARD', () => {
    jest.useFakeTimers();
    const { session } = createSession(CATEGORY_QUIZ);
    session.addPlayer('s1', 'P');
    session.gameState = 'ANSWER_REVEAL';
    session.currentQuestionIndex = 0;
    session.quizData.questions = [{ question: 'Q?', answers: ['A','B','C','D'], correctAnswer: 0 }];

    const result = session.skipQuestion();
    expect(result.success).toBe(true);
    expect(session.gameState).toBe('LEADERBOARD');
    jest.clearAllTimers();
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: _calculateAnswerStatistics
// ─────────────────────────────────────────────

describe('AutoQuizSession — _calculateAnswerStatistics', () => {
  test('рахує розподіл відповідей та відсотки', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'P1');
    session.addPlayer('s2', 'P2');
    session.addPlayer('s3', 'P3');
    session.addPlayer('s4', 'P4');

    // P1 та P2 обрали відповідь 0, P3 — відповідь 2, P4 не відповів
    session.currentAnswers.set('s1', { answerId: 0, timestamp: Date.now(), timeSpent: 5 });
    session.currentAnswers.set('s2', { answerId: 0, timestamp: Date.now(), timeSpent: 8 });
    session.currentAnswers.set('s3', { answerId: 2, timestamp: Date.now(), timeSpent: 3 });

    const stats = session._calculateAnswerStatistics(0);

    expect(stats.total).toBe(3);          // 3 відповіли
    expect(stats.notAnswered).toBe(1);    // 1 не відповів
    expect(stats.correctAnswer).toBe(0);  // правильна відповідь 0
    expect(stats.answers[0].count).toBe(2);
    expect(stats.answers[1].count).toBe(0);
    expect(stats.answers[2].count).toBe(1);
    expect(stats.answers[3].count).toBe(0);
    // Відсотки від загальної кількості гравців (4), не тільки хто відповів
    expect(stats.answers[0].percentage).toBe(50); // 2/4 = 50%
    expect(stats.answers[2].percentage).toBe(25); // 1/4 = 25%
    clearSessionTimers(session);
  });

  test('повертає нулі коли ніхто не відповів', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'P1');

    const stats = session._calculateAnswerStatistics(1);
    expect(stats.total).toBe(0);
    expect(stats.notAnswered).toBe(1);
    for (let i = 0; i < 4; i++) {
      expect(stats.answers[i].count).toBe(0);
      expect(stats.answers[i].percentage).toBe(0);
    }
    clearSessionTimers(session);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: _shuffleArray
// ─────────────────────────────────────────────

describe('AutoQuizSession — _shuffleArray', () => {
  test('зберігає всі елементи', () => {
    const { session } = createSession();
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = session._shuffleArray([...original]);

    expect(shuffled).toHaveLength(original.length);
    expect(shuffled.sort()).toEqual(original.sort());
    clearSessionTimers(session);
  });

  test('повертає той самий масив (in-place)', () => {
    const { session } = createSession();
    const arr = [1, 2, 3];
    const result = session._shuffleArray(arr);
    expect(result).toBe(arr);
    clearSessionTimers(session);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: Баг-фікси — _resolveCategory встановлює CATEGORY_CHOSEN
// ─────────────────────────────────────────────

describe('AutoQuizSession — _resolveCategory gameState transition', () => {
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  test('_resolveCategory переводить gameState у CATEGORY_CHOSEN', () => {
    jest.useFakeTimers();
    const { session } = createCategorySession();
    session.addPlayer('s1', 'Аліса');
    session.gameState = 'STARTING';
    session.currentQuestionIndex = -1;
    session.startCategorySelect();

    // Вибираємо категорію — _resolveCategory має встановити gameState = 'CATEGORY_CHOSEN'
    session.submitCategory('s1', 0);

    expect(session.gameState).toBe('CATEGORY_CHOSEN');
    jest.clearAllTimers();
  });

  test('submitCategory відхиляється під час CATEGORY_CHOSEN (вже не CATEGORY_SELECT)', () => {
    jest.useFakeTimers();
    const { session } = createCategorySession();
    session.addPlayer('s1', 'Аліса');
    session.addPlayer('s2', 'Богдан');
    session.gameState = 'STARTING';
    session.currentQuestionIndex = -1;
    session.startCategorySelect();

    // Chooser обирає категорію — стан переходить у CATEGORY_CHOSEN
    const chooserId = session.currentChooserSocketId;
    session.submitCategory(chooserId, 0);
    expect(session.gameState).toBe('CATEGORY_CHOSEN');

    // Спроба іншого гравця надіслати submitCategory під час CATEGORY_CHOSEN має бути відхилена
    const nonChooserId = chooserId === 's1' ? 's2' : 's1';
    const result = session.submitCategory(nonChooserId, 1);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/не час/i);
    jest.clearAllTimers();
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: Баг-фікс — autoStartTimer очищається перед новим
// ─────────────────────────────────────────────

describe('AutoQuizSession — autoStartTimer clears before new one', () => {
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  test('при одночасному приєднанні гравців autoStartTimer скидається, startQuiz викликається тільки раз', () => {
    jest.useFakeTimers();
    const { session, broadcasts } = createCategorySession();
    session.settings.autoStart = true;
    session.playerCount = 2;

    // Перший гравець — ще не досягнуто playerCount
    session.addPlayer('s1', 'Аліса');
    expect(session.autoStartTimer).toBeNull();

    // Другий гравець — досягнуто playerCount, autoStartTimer створюється
    session.addPlayer('s2', 'Богдан');
    const firstTimer = session.autoStartTimer;
    expect(firstTimer).not.toBeNull();

    // Третій гравець — перевищує playerCount, таймер має бути замінений
    session.addPlayer('s3', 'Василь');
    const secondTimer = session.autoStartTimer;
    expect(secondTimer).not.toBeNull();

    // Просуваємо час — startQuiz має спрацювати тільки раз
    jest.advanceTimersByTime(600);

    // Тільки один QUIZ_STARTING broadcast
    const startEvents = broadcasts.filter(b => b.data.type === 'QUIZ_STARTING');
    expect(startEvents).toHaveLength(1);
    expect(session.gameState).toBe('STARTING');
    jest.clearAllTimers();
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: Баг-фікс — _calculateAnswerStatistics з 0 гравцями
// ─────────────────────────────────────────────

describe('AutoQuizSession — _calculateAnswerStatistics з 0 гравцями', () => {
  test('percentage = 0 якщо players.size === 0, але є відповіді', () => {
    const { session } = createSession();
    // Додаємо гравця, він відповідає, потім відключається
    session.addPlayer('s1', 'Аліса');
    session.currentAnswers.set('s1', { answerId: 0, timestamp: Date.now(), timeSpent: 5 });
    // Гравець відключився — видаляємо з players, але відповідь залишилась
    session.players.delete('s1');

    expect(session.players.size).toBe(0);

    const stats = session._calculateAnswerStatistics(0);

    // Відповіді записані, але players.size = 0 — відсотки мають бути від totalAnswered
    expect(stats.total).toBe(1);
    // Перевіряємо що percentage не Infinity і не NaN
    expect(Number.isFinite(stats.answers[0].percentage)).toBe(true);
    expect(stats.answers[0].percentage).toBe(100); // 1/1 = 100% (fallback to totalAnswered)
    clearSessionTimers(session);
  });

  test('percentage = 0 якщо 0 гравців і 0 відповідей', () => {
    const { session } = createSession();
    // Жодних гравців і відповідей

    const stats = session._calculateAnswerStatistics(1);

    for (let i = 0; i < 4; i++) {
      expect(stats.answers[i].percentage).toBe(0);
      expect(Number.isFinite(stats.answers[i].percentage)).toBe(true);
    }
    clearSessionTimers(session);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: Баг-фікс — endQuiz totalQuestions = rounds.length
// ─────────────────────────────────────────────

describe('AutoQuizSession — endQuiz totalQuestions в category mode', () => {
  test('QUIZ_ENDED.totalQuestions === rounds.length, а не quizData.questions.length', () => {
    jest.useFakeTimers();
    const { session, broadcasts } = createCategorySession();
    session.addPlayer('s1', 'Аліса');

    // Граємо тільки 1 раунд з 3 (quizData.questions матиме 1 елемент)
    session.gameState = 'STARTING';
    session.currentQuestionIndex = -1;
    session.startCategorySelect();
    session.submitCategory('s1', 0);
    jest.advanceTimersByTime(4100); // → QUESTION

    session.submitAnswer('s1', 2, Date.now()); // → ANSWER_REVEAL
    jest.advanceTimersByTime(1100); // → LEADERBOARD
    jest.advanceTimersByTime(1100); // → CATEGORY_SELECT round 2

    // Примусово завершуємо квіз
    session.endQuiz();

    const endEvt = broadcasts.find(b => b.data.type === 'QUIZ_ENDED');
    expect(endEvt).toBeDefined();

    // totalQuestions має дорівнювати кількості раундів (3), не quizData.questions.length (1)
    expect(endEvt.data.totalQuestions).toBe(3);
    jest.clearAllTimers();
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: Баг-фікс — createdAt timestamp
// ─────────────────────────────────────────────

describe('AutoQuizSession — createdAt timestamp', () => {
  test('нова сесія має createdAt встановлений на поточний час', () => {
    const before = Date.now();
    const { session } = createSession();
    const after = Date.now();

    expect(session.createdAt).toBeDefined();
    expect(session.createdAt).toBeGreaterThanOrEqual(before);
    expect(session.createdAt).toBeLessThanOrEqual(after);
    clearSessionTimers(session);
  });

  test('createdAt не змінюється при додаванні гравців', () => {
    const { session } = createSession();
    const originalCreatedAt = session.createdAt;

    session.addPlayer('s1', 'Аліса');
    session.addPlayer('s2', 'Богдан');

    expect(session.createdAt).toBe(originalCreatedAt);
    clearSessionTimers(session);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: getState в різних фазах
// ─────────────────────────────────────────────

describe('AutoQuizSession — getState phases', () => {
  afterEach(() => { jest.clearAllTimers(); });

  test('getState в QUESTION включає timeRemaining та timeLimit', () => {
    jest.useFakeTimers();
    const { session } = createSession();
    session.addPlayer('s1', 'P');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.questionStartTime = Date.now() - 10000; // 10с тому
    session.currentTimerLimit = 30;
    session.isPaused = false;

    const state = session.getState();
    expect(state.timeRemaining).toBeDefined();
    expect(state.timeLimit).toBe(30);
    expect(state.timeRemaining).toBeLessThanOrEqual(20);
    jest.clearAllTimers();
  });

  test('getState в QUESTION на паузі — timeRemaining з questionTimeRemaining', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'P');
    session.gameState = 'QUESTION';
    session.currentQuestionIndex = 0;
    session.currentTimerLimit = 30;
    session.isPaused = true;
    session.questionTimeRemaining = 15.5;

    const state = session.getState();
    expect(state.isPaused).toBe(true);
    expect(state.timeRemaining).toBe(16); // Math.ceil(15.5)
    clearSessionTimers(session);
  });

  test('getState в ANSWER_REVEAL включає correctAnswer', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'P');
    session.gameState = 'ANSWER_REVEAL';
    session.currentQuestionIndex = 0;

    const state = session.getState();
    expect(state.correctAnswer).toBe(1); // QUIZ_DATA.questions[0].correctAnswer
    expect(state.currentQuestion).toBeDefined();
    expect(state.currentQuestion.text).toBe('Скільки буде 2+2?');
    clearSessionTimers(session);
  });

  test('getState в LEADERBOARD включає leaderboard', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'P1');
    session.addPlayer('s2', 'P2');
    session.players.get('s1').score = 300;
    session.gameState = 'LEADERBOARD';

    const state = session.getState();
    expect(state.leaderboard).toBeDefined();
    expect(state.leaderboard).toHaveLength(2);
    expect(state.leaderboard[0].nickname).toBe('P1');
    clearSessionTimers(session);
  });

  test('getState в ENDED включає leaderboard', () => {
    const { session } = createSession();
    session.addPlayer('s1', 'P');
    session.gameState = 'ENDED';

    const state = session.getState();
    expect(state.leaderboard).toBeDefined();
    clearSessionTimers(session);
  });

  test('getState включає targetPlayerCount', () => {
    const settings = { ...SETTINGS, playerCount: 4 };
    const { session } = createSession(undefined, settings);
    const state = session.getState();
    expect(state.targetPlayerCount).toBe(4);
    clearSessionTimers(session);
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: питання з image/audio
// ─────────────────────────────────────────────

describe('AutoQuizSession — media fields in broadcasts', () => {
  afterEach(() => { jest.clearAllTimers(); });

  test('NEW_QUESTION broadcast включає image якщо є', () => {
    jest.useFakeTimers();
    const quizWithImage = {
      title: 'Image Quiz',
      categoryMode: true,
      rounds: [{
        options: [
          { category: 'A', question: 'Q?', answers: ['1','2','3','4'], correctAnswer: 0, image: 'test.jpg' },
          { category: 'B', question: 'Q?', answers: ['1','2','3','4'], correctAnswer: 1 }
        ]
      }]
    };

    const { session, broadcasts } = createSession(quizWithImage, CATEGORY_SETTINGS);
    session.addPlayer('s1', 'P');

    session.startQuiz();
    jest.advanceTimersByTime(3100); // STARTING → CATEGORY_SELECT
    session.submitCategory('s1', 0); // вибираємо option з image
    jest.advanceTimersByTime(4100); // CATEGORY_CHOSEN → QUESTION

    const newQ = broadcasts.find(b => b.data.type === 'NEW_QUESTION');
    expect(newQ).toBeDefined();
    expect(newQ.data.question.image).toBe('test.jpg');
    jest.clearAllTimers();
  });
});

// ─────────────────────────────────────────────
// ТЕСТИ: питання з custom timeLimit
// ─────────────────────────────────────────────

describe('AutoQuizSession — custom question timeLimit', () => {
  afterEach(() => { jest.clearAllTimers(); });

  test('питання з timeLimit override використовує його замість settings', () => {
    jest.useFakeTimers();
    const quizWithTimeLimit = {
      title: 'TimeLimited Quiz',
      categoryMode: true,
      rounds: [{
        options: [
          { category: 'A', question: 'Q?', answers: ['1','2','3','4'], correctAnswer: 0, timeLimit: 10 },
          { category: 'B', question: 'Q?', answers: ['1','2','3','4'], correctAnswer: 1 }
        ]
      }]
    };

    const { session, broadcasts } = createSession(quizWithTimeLimit, CATEGORY_SETTINGS);
    session.addPlayer('s1', 'P');

    session.startQuiz();
    jest.advanceTimersByTime(3100);
    session.submitCategory('s1', 0);
    jest.advanceTimersByTime(4100);

    const newQ = broadcasts.find(b => b.data.type === 'NEW_QUESTION');
    expect(newQ).toBeDefined();
    expect(newQ.data.timeLimit).toBe(10); // custom, не 30 з settings
    expect(session.currentTimerLimit).toBe(10);
    jest.clearAllTimers();
  });
});
