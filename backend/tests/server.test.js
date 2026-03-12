/**
 * server.test.js — Тести HTTP ендпоінтів сервера
 *
 * Перевіряє всі REST API маршрути через supertest.
 * Використовує тимчасові БД та quizzes/ для ізоляції.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const request = require('supertest');

// Встановлюємо тимчасові шляхи ДО require будь-яких модулів проєкту
const tmpDb = path.join(os.tmpdir(), `quiz-server-test-${Date.now()}.db`);
const tmpQuizDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-server-quizzes-'));
process.env.TEST_DB_PATH = tmpDb;
process.env.TEST_QUIZZES_DIR = tmpQuizDir;

const STANDARD_QUIZ = {
  title: 'Server Test Quiz',
  questions: [
    { question: 'Q1?', answers: ['A', 'B', 'C', 'D'], correctAnswer: 0 }
  ]
};

const CATEGORY_QUIZ = {
  title: 'Cat Quiz',
  categoryMode: true,
  rounds: [
    {
      options: [
        { category: 'Geo', question: 'Q?', answers: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
        { category: 'His', question: 'Q2?', answers: ['A', 'B', 'C', 'D'], correctAnswer: 1 }
      ]
    }
  ]
};

let app;
let db;
let server; // зберігаємо посилання для маніпуляцій у тестах (currentActiveRoom тощо)

beforeAll(() => {
  jest.resetModules();
  const QuizServer = require('../src/server');
  server = new QuizServer();
  server.setupMiddleware();
  server.setupRoutes();
  // Не викликаємо server.start() — supertest сам підключається до express app
  app = server.app;
  db = require('../src/db');
});

afterAll(() => {
  try { db.db.close(); } catch (_) {}
  fs.rmSync(tmpDb, { force: true });
  fs.rmSync(tmpQuizDir, { recursive: true, force: true });
  delete process.env.TEST_DB_PATH;
  delete process.env.TEST_QUIZZES_DIR;
});

beforeEach(() => {
  // Очищаємо БД між тестами
  try {
    db.db.exec('DELETE FROM question_stats; DELETE FROM results; DELETE FROM sessions;');
  } catch (_) {}
  // Очищаємо quizzes між тестами
  for (const f of fs.readdirSync(tmpQuizDir)) {
    fs.unlinkSync(path.join(tmpQuizDir, f));
  }
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  test('повертає status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('містить uptime і timestamp', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('activeSessions');
  });
});

// ---------------------------------------------------------------------------
// GET /api/active-quizzes
// ---------------------------------------------------------------------------

describe('GET /api/active-quizzes', () => {
  test('повертає порожній список якщо немає активних кімнат', async () => {
    const res = await request(app).get('/api/active-quizzes');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(res.body.sessions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GET /api/quizzes
// ---------------------------------------------------------------------------

describe('GET /api/quizzes', () => {
  test('повертає порожній масив якщо quizzes/ порожня', async () => {
    const res = await request(app).get('/api/quizzes');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.quizzes).toHaveLength(0);
  });

  test('повертає стандартний квіз з директорії', async () => {
    fs.writeFileSync(path.join(tmpQuizDir, 'test.json'), JSON.stringify(STANDARD_QUIZ));
    const res = await request(app).get('/api/quizzes');
    expect(res.body.quizzes).toHaveLength(1);
    expect(res.body.quizzes[0].title).toBe('Server Test Quiz');
  });

  test('повертає category mode квіз', async () => {
    fs.writeFileSync(path.join(tmpQuizDir, 'cat.json'), JSON.stringify(CATEGORY_QUIZ));
    const res = await request(app).get('/api/quizzes');
    expect(res.body.quizzes[0].categoryMode).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /api/quizzes/save
// ---------------------------------------------------------------------------

describe('POST /api/quizzes/save', () => {
  test('зберігає стандартний квіз і повертає id та filename', async () => {
    const res = await request(app).post('/api/quizzes/save').send(STANDARD_QUIZ);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBe('server-test-quiz');
    expect(res.body.filename).toBe('server-test-quiz.json');
    expect(fs.existsSync(path.join(tmpQuizDir, 'server-test-quiz.json'))).toBe(true);
  });

  test('зберігає category mode квіз', async () => {
    const res = await request(app).post('/api/quizzes/save').send(CATEGORY_QUIZ);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.filename).toBe('cat-quiz.json');
  });

  test('повертає 400 якщо відсутній title', async () => {
    const res = await request(app).post('/api/quizzes/save').send({ questions: [] });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('повертає 400 якщо тіло запиту порожнє', async () => {
    const res = await request(app).post('/api/quizzes/save').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('повертає 500 якщо квіз невалідний (немає questions/rounds)', async () => {
    const res = await request(app).post('/api/quizzes/save').send({ title: 'No questions' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  test('автоматично додає суфікс при колізії', async () => {
    await request(app).post('/api/quizzes/save').send(STANDARD_QUIZ);
    const res = await request(app).post('/api/quizzes/save').send(STANDARD_QUIZ);
    expect(res.body.filename).toBe('server-test-quiz-2.json');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/quizzes/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/quizzes/:id', () => {
  test('видаляє існуючий квіз і повертає success', async () => {
    const saveRes = await request(app).post('/api/quizzes/save').send(STANDARD_QUIZ);
    const { id } = saveRes.body;
    const res = await request(app).delete(`/api/quizzes/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(fs.existsSync(path.join(tmpQuizDir, `${id}.json`))).toBe(false);
  });

  test('повертає 404 якщо квіз не знайдено', async () => {
    const res = await request(app).delete('/api/quizzes/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /api/stats
// ---------------------------------------------------------------------------

describe('GET /api/stats', () => {
  test('повертає структуру з totals і sessions', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('totals');
    expect(res.body).toHaveProperty('sessions');
  });

  test('totals.total_sessions дорівнює 0 для порожньої БД', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.body.totals.total_sessions).toBe(0);
  });

  test('відображає збережені сесії', async () => {
    db.saveSession('ABCDEF', 'Test', Date.now() - 1000, Date.now(), 2, [
      { position: 1, nickname: 'Alice', score: 200, correctAnswers: 2, avgAnswerTime: 5 }
    ], []);
    const res = await request(app).get('/api/stats');
    expect(res.body.totals.total_sessions).toBe(1);
    expect(res.body.sessions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// GET /api/stats/session/:id
// ---------------------------------------------------------------------------

describe('GET /api/stats/session/:id', () => {
  test('повертає leaderboard для існуючої сесії', async () => {
    db.saveSession('ABCDEF', 'Test', Date.now() - 1000, Date.now(), 2, [
      { position: 1, nickname: 'Alice', score: 300, correctAnswers: 3, avgAnswerTime: 4.0 },
      { position: 2, nickname: 'Bob',   score: 100, correctAnswers: 1, avgAnswerTime: 9.0 }
    ], []);
    const statsRes = await request(app).get('/api/stats');
    const sessionId = statsRes.body.sessions[0].id;

    const res = await request(app).get(`/api/stats/session/${sessionId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0].nickname).toBe('Alice');
  });

  test('повертає порожній масив для неіснуючого id', async () => {
    const res = await request(app).get('/api/stats/session/99999');
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GET /api/current-room
// ---------------------------------------------------------------------------

describe('GET /api/current-room', () => {
  afterEach(() => {
    // Скидаємо activeRoom після кожного тесту
    server.roomManager.currentActiveRoom = null;
  });

  test('повертає roomCode: null якщо немає активної кімнати', async () => {
    const res = await request(app).get('/api/current-room');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.roomCode).toBeNull();
  });

  test('повертає roomCode коли активна кімната існує', async () => {
    server.roomManager.currentActiveRoom = 'TESTCD';
    const res = await request(app).get('/api/current-room');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.roomCode).toBe('TESTCD');
  });
});

// ---------------------------------------------------------------------------
// GET /api/podium/status
// ---------------------------------------------------------------------------

describe('GET /api/podium/status', () => {
  afterEach(() => {
    server.roomManager.currentActiveRoom = null;
    server.roomManager.sessions.clear();
    server.roomManager.podiumRegistry.clear();
  });

  test('GET /api/podium/status returns null nickname when no active room', async () => {
    const res = await request(app).get('/api/podium/status');
    expect(res.status).toBe(200);
    expect(res.body.nickname).toBeNull();
    expect(res.body.phase).toBe('WAITING');
  });

  test('returns null nickname when room exists but IP not in podiumRegistry', async () => {
    // Створюємо активну сесію через roomManager напряму
    server.roomManager.currentActiveRoom = 'TESTXY';
    // Мок-сесія з мінімальним інтерфейсом який читає /api/podium/status
    server.roomManager.sessions.set('TESTXY', {
      gameState: 'WAITING',
      players: new Map(),
    });
    // podiumRegistry порожній — 127.0.0.1 не зареєстрований
    const res = await request(app).get('/api/podium/status');
    expect(res.status).toBe(200);
    expect(res.body.nickname).toBeNull();
    // Фаза повинна відповідати gameState сесії
    expect(res.body.phase).toBe('WAITING');
  });

  test('returns nickname when IP is in podiumRegistry', async () => {
    // Створюємо активну сесію та реєструємо IP 127.0.0.1 в podiumRegistry
    server.roomManager.currentActiveRoom = 'TESTXY';
    const socketId = 'socket-abc-123';
    const players = new Map();
    players.set(socketId, { nickname: 'TestPlayer' });
    server.roomManager.sessions.set('TESTXY', {
      gameState: 'QUESTION',
      players,
    });
    // Запит з supertest іде з 127.0.0.1; сервер strip ::ffff: → '127.0.0.1'
    server.roomManager.podiumRegistry.set('127.0.0.1', socketId);

    const res = await request(app).get('/api/podium/status');
    expect(res.status).toBe(200);
    expect(res.body.nickname).toBe('TestPlayer');
    expect(res.body.phase).toBe('QUESTION');
  });
});

// ---------------------------------------------------------------------------
// GET /api/media/:filename
// ---------------------------------------------------------------------------

describe('GET /api/media/:filename', () => {
  test('повертає 404 для неіснуючого файлу', async () => {
    const res = await request(app).get('/api/media/nonexistent-image.jpg');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /api/qr/:roomCode
// ---------------------------------------------------------------------------

describe('GET /api/qr/:roomCode', () => {
  test('повертає PNG зображення', async () => {
    const res = await request(app).get('/api/qr/ABCDEF');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.length).toBeGreaterThan(100);
  });

  test('код кімнати в uppercase в QR', async () => {
    // Просто перевіряємо що lowercase roomCode теж дає PNG без помилок
    const res = await request(app).get('/api/qr/abcdef');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
  });
});
