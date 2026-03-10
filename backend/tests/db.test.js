/**
 * db.test.js — Тести для db.js (SQLite persistence)
 *
 * Перевіряє збереження сесій, отримання результатів та автоочищення.
 * Використовує тимчасовий файл БД щоб не торкатись реального sessions.db
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

// Встановлюємо тимчасовий шлях ДО require db — singleton читає змінну при ініціалізації
const tmpDb = path.join(os.tmpdir(), `quiz-test-${Date.now()}.db`);
process.env.TEST_DB_PATH = tmpDb;

// ---------------------------------------------------------------------------
// Тестові дані
// ---------------------------------------------------------------------------

const LEADERBOARD = [
  { position: 1, nickname: 'Alice', score: 300, correctAnswers: 3, avgAnswerTime: 5.2 },
  { position: 2, nickname: 'Bob',   score: 200, correctAnswers: 2, avgAnswerTime: 8.1 },
];

const QUESTION_STATS = [
  { total: 2, notAnswered: 0, answers: { 0: { count: 1 }, 1: { count: 1 }, 2: { count: 0 }, 3: { count: 0 } } },
  { total: 1, notAnswered: 1, answers: { 0: { count: 0 }, 1: { count: 1 }, 2: { count: 0 }, 3: { count: 0 } } },
];

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let db;

beforeAll(() => {
  jest.resetModules();
  db = require('../src/db');
});

afterAll(() => {
  // Закриваємо БД і видаляємо тимчасовий файл
  try { db.db.close(); } catch (_) {}
  fs.rmSync(tmpDb, { force: true });
  delete process.env.TEST_DB_PATH;
});

beforeEach(() => {
  // Очищаємо всі таблиці між тестами
  db.db.exec('DELETE FROM question_stats; DELETE FROM results; DELETE FROM sessions;');
});

// ---------------------------------------------------------------------------
// saveSession
// ---------------------------------------------------------------------------

describe('saveSession', () => {
  test('зберігає сесію і вона з\'являється в getSessions', () => {
    db.saveSession('ABCDEF', 'Test Quiz', Date.now() - 1000, Date.now(), 2, LEADERBOARD, QUESTION_STATS);
    const sessions = db.getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].room_code).toBe('ABCDEF');
    expect(sessions[0].title).toBe('Test Quiz');
    expect(sessions[0].player_count).toBe(2);
  });

  test('зберігає leaderboard у таблицю results', () => {
    db.saveSession('ABCDEF', 'Test Quiz', Date.now() - 1000, Date.now(), 2, LEADERBOARD, QUESTION_STATS);
    const sessions = db.getSessions();
    const results = db.getSessionResults(sessions[0].id);
    expect(results).toHaveLength(2);
    expect(results[0].nickname).toBe('Alice');
    expect(results[0].score).toBe(300);
    expect(results[0].position).toBe(1);
    expect(results[1].nickname).toBe('Bob');
  });

  test('зберігає question_stats', () => {
    db.saveSession('ABCDEF', 'Test Quiz', Date.now() - 1000, Date.now(), 2, LEADERBOARD, QUESTION_STATS);
    const stats = db.db.prepare('SELECT * FROM question_stats').all();
    expect(stats).toHaveLength(2);
    expect(stats[0].total_answered).toBe(2);
    expect(stats[1].not_answered).toBe(1);
  });

  test('зберігає кілька сесій незалежно', () => {
    db.saveSession('AAA', 'Quiz 1', Date.now() - 2000, Date.now() - 1000, 1, [LEADERBOARD[0]], [QUESTION_STATS[0]]);
    db.saveSession('BBB', 'Quiz 2', Date.now() - 1000, Date.now(), 1, [LEADERBOARD[1]], [QUESTION_STATS[1]]);
    expect(db.getSessions()).toHaveLength(2);
  });

  test('не падає при порожньому leaderboard', () => {
    expect(() => {
      db.saveSession('EMPTY', 'Empty Quiz', Date.now() - 500, Date.now(), 0, [], []);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getSessions
// ---------------------------------------------------------------------------

describe('getSessions', () => {
  test('повертає порожній масив якщо немає сесій', () => {
    expect(db.getSessions()).toEqual([]);
  });

  test('сортує сесії від новіших до старіших', () => {
    const now = Date.now();
    db.saveSession('OLD', 'Old Quiz', now - 5000, now - 4000, 1, [LEADERBOARD[0]], []);
    db.saveSession('NEW', 'New Quiz', now - 1000, now,        1, [LEADERBOARD[0]], []);
    const sessions = db.getSessions();
    expect(sessions[0].room_code).toBe('NEW');
    expect(sessions[1].room_code).toBe('OLD');
  });

  test('додає topScorer до кожної сесії', () => {
    db.saveSession('ABCDEF', 'Quiz', Date.now() - 1000, Date.now(), 2, LEADERBOARD, []);
    const sessions = db.getSessions();
    expect(sessions[0].topScorer).not.toBeNull();
    expect(sessions[0].topScorer.nickname).toBe('Alice');
    expect(sessions[0].topScorer.score).toBe(300);
  });

  test('topScorer є null якщо немає гравців', () => {
    db.saveSession('EMPTY', 'Empty', Date.now() - 500, Date.now(), 0, [], []);
    const sessions = db.getSessions();
    expect(sessions[0].topScorer).toBeNull();
  });

  test('повертає максимум limit сесій', () => {
    for (let i = 0; i < 5; i++) {
      db.saveSession(`R${i}`, `Quiz ${i}`, Date.now() - i * 1000, Date.now() - i * 500, 1, [LEADERBOARD[0]], []);
    }
    expect(db.getSessions(3)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// getSessionResults
// ---------------------------------------------------------------------------

describe('getSessionResults', () => {
  test('повертає відсортований leaderboard для сесії', () => {
    db.saveSession('ABCDEF', 'Quiz', Date.now() - 1000, Date.now(), 2, LEADERBOARD, []);
    const sessions = db.getSessions();
    const results = db.getSessionResults(sessions[0].id);
    expect(results).toHaveLength(2);
    expect(results[0].position).toBe(1);
    expect(results[1].position).toBe(2);
  });

  test('повертає порожній масив для неіснуючої сесії', () => {
    expect(db.getSessionResults(99999)).toEqual([]);
  });

  test('містить avg_answer_time', () => {
    db.saveSession('ABCDEF', 'Quiz', Date.now() - 1000, Date.now(), 2, LEADERBOARD, []);
    const sessions = db.getSessions();
    const results = db.getSessionResults(sessions[0].id);
    expect(results[0].avg_answer_time).toBeCloseTo(5.2, 1);
  });
});

// ---------------------------------------------------------------------------
// getStats
// ---------------------------------------------------------------------------

describe('getStats', () => {
  test('повертає нулі якщо немає сесій', () => {
    const { totals } = db.getStats();
    expect(totals.total_sessions).toBe(0);
  });

  test('рахує загальну кількість сесій і гравців', () => {
    db.saveSession('A', 'Q1', Date.now() - 2000, Date.now() - 1000, 2, LEADERBOARD, []);
    db.saveSession('B', 'Q2', Date.now() - 1000, Date.now(),        1, [LEADERBOARD[0]], []);
    const { totals } = db.getStats();
    expect(totals.total_sessions).toBe(2);
    expect(totals.total_players).toBe(3);
    expect(totals.avg_players).toBeCloseTo(1.5, 1);
  });

  test('включає список сесій', () => {
    db.saveSession('A', 'Q', Date.now() - 1000, Date.now(), 1, [LEADERBOARD[0]], []);
    const { sessions } = db.getStats();
    expect(sessions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// cleanupOldSessions
// ---------------------------------------------------------------------------

describe('cleanupOldSessions', () => {
  test('повертає 0 якщо немає старих сесій', () => {
    db.saveSession('NEW', 'New', Date.now() - 1000, Date.now(), 1, [LEADERBOARD[0]], []);
    expect(db.cleanupOldSessions(90)).toBe(0);
  });

  test('видаляє сесії старіші вказаного ліміту', () => {
    const oldTime = Date.now() - 100 * 24 * 60 * 60 * 1000; // 100 днів тому
    db.saveSession('OLD', 'Old Quiz', oldTime - 1000, oldTime, 1, [LEADERBOARD[0]], [QUESTION_STATS[0]]);
    const removed = db.cleanupOldSessions(90);
    expect(removed).toBe(1);
    expect(db.getSessions()).toHaveLength(0);
  });

  test('не видаляє нові сесії', () => {
    const oldTime = Date.now() - 100 * 24 * 60 * 60 * 1000;
    db.saveSession('OLD', 'Old', oldTime - 1000, oldTime, 1, [LEADERBOARD[0]], []);
    db.saveSession('NEW', 'New', Date.now() - 1000, Date.now(), 1, [LEADERBOARD[0]], []);
    db.cleanupOldSessions(90);
    const remaining = db.getSessions();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].room_code).toBe('NEW');
  });

  test('каскадно видаляє results і question_stats', () => {
    const oldTime = Date.now() - 100 * 24 * 60 * 60 * 1000;
    db.saveSession('OLD', 'Old', oldTime - 1000, oldTime, 2, LEADERBOARD, QUESTION_STATS);
    db.cleanupOldSessions(90);
    const results = db.db.prepare('SELECT * FROM results').all();
    const stats   = db.db.prepare('SELECT * FROM question_stats').all();
    expect(results).toHaveLength(0);
    expect(stats).toHaveLength(0);
  });

  test('видаляє кілька старих сесій за раз', () => {
    const oldTime = Date.now() - 100 * 24 * 60 * 60 * 1000;
    db.saveSession('O1', 'Old1', oldTime - 2000, oldTime - 1000, 1, [LEADERBOARD[0]], []);
    db.saveSession('O2', 'Old2', oldTime - 1000, oldTime,        1, [LEADERBOARD[0]], []);
    expect(db.cleanupOldSessions(90)).toBe(2);
  });
});
