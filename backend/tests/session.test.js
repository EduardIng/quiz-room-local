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
function createSession(quizData = QUIZ_DATA, settings = SETTINGS) {
  const { mockIo, broadcasts } = createMockIO();
  const session = new AutoQuizSession(quizData, settings);
  session.init(mockIo, 'TEST01');
  return { session, mockIo, broadcasts };
}

/**
 * Очищає всі таймери сесії (щоб Jest не "завис")
 */
function clearSessionTimers(session) {
  clearTimeout(session.questionTimer);
  clearTimeout(session.transitionTimer);
  session.questionTimer = null;
  session.transitionTimer = null;
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
  test('submitAnswer: приймає правильну відповідь', () => {
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
    const { session, broadcasts } = createSession(CATEGORY_QUIZ);
    session.addPlayer('s1', 'Петро');
    session.addPlayer('s2', 'Марія');
    session.gameState = 'STARTING';
    session.startCategorySelect();
    clearSessionTimers(session);

    // Chooser socket is stored directly on session
    const chooserId = session.currentChooserSocketId;

    broadcasts.length = 0;
    const result = session.submitCategory(chooserId, 0);
    clearSessionTimers(session);

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
    expect(result.error).toBeTruthy();
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

  it('auto-starts when playerCount players have joined', async () => {
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
    await new Promise(r => setTimeout(r, 600));

    expect(broadcasts.find(m => m.type === 'QUIZ_STARTING')).toBeDefined();
    clearTimeout(session.transitionTimer);
    session.transitionTimer = null;
  });

  it('delays nextQuestion by categoryChosenTime (4s) after CATEGORY_CHOSEN', async () => {
    const settings = { ...SETTINGS, categoryChosenTime: 4, questionTime: 30,
      answerRevealTime: 5, leaderboardTime: 5, waitForAllPlayers: true, autoStart: false };
    const session = new AutoQuizSession(CATEGORY_QUIZ, settings);
    const { mockIo } = createMockIO();
    session.init(mockIo, 'ROOM1');

    const broadcasts = [];
    session.io = {
      to: () => ({ emit: (_, msg) => broadcasts.push(msg) })
    };

    session._resolveCategory(0, 0, false);

    const chosen = broadcasts.find(m => m.type === 'CATEGORY_CHOSEN');
    expect(chosen).toBeDefined();
    expect(broadcasts.find(m => m.type === 'NEW_QUESTION')).toBeUndefined();

    // After 1.5 seconds, NEW_QUESTION must NOT have fired yet (categoryChosenTime=4s)
    await new Promise(r => setTimeout(r, 1500));
    expect(broadcasts.find(m => m.type === 'NEW_QUESTION')).toBeUndefined();

    // After 4+ seconds total, NEW_QUESTION must have fired
    await new Promise(r => setTimeout(r, 2700));
    expect(broadcasts.find(m => m.type === 'NEW_QUESTION')).toBeDefined();
  }, 6000);
});
