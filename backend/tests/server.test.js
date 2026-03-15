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
// GET /api/stats/session/:id/questions
// ---------------------------------------------------------------------------

describe('GET /api/stats/session/:id/questions', () => {
  test('повертає question_stats для сесії', async () => {
    const db = require('../src/db');
    db.saveSession('QTEST', 'Q Quiz', Date.now() - 1000, Date.now(), 1,
      [{ position: 1, nickname: 'X', score: 100, correctAnswers: 1, avgAnswerTime: 5 }],
      [{ total: 1, notAnswered: 0, correctAnswer: 2, answers: { 0: { count: 0 }, 1: { count: 0 }, 2: { count: 1 }, 3: { count: 0 } } }]
    );
    const sessions = db.getSessions();
    const id = sessions[0].id;

    const res = await request(app).get(`/api/stats/session/${id}/questions`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.questionStats).toHaveLength(1);
    expect(res.body.questionStats[0].correct_answer).toBe(2);
    expect(res.body.questionStats[0].answer_2).toBe(1);
  });

  test('повертає порожній масив для неіснуючої сесії', async () => {
    const res = await request(app).get('/api/stats/session/9999/questions');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.questionStats).toEqual([]);
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
// GET /api/media
// ---------------------------------------------------------------------------

describe('GET /api/media', () => {
  const tmpMediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-media-list-'));

  beforeAll(() => {
    process.env.TEST_MEDIA_DIR = tmpMediaDir;
  });

  afterAll(() => {
    fs.rmSync(tmpMediaDir, { recursive: true, force: true });
    delete process.env.TEST_MEDIA_DIR;
  });

  beforeEach(() => {
    // Очищаємо папку між тестами
    for (const f of fs.readdirSync(tmpMediaDir)) {
      fs.unlinkSync(path.join(tmpMediaDir, f));
    }
  });

  it('returns empty file list when media dir is empty', async () => {
    const res = await request(app).get('/api/media');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('files');
    expect(Array.isArray(res.body.files)).toBe(true);
    expect(res.body.files).toHaveLength(0);
  });

  it('returns image files with filename, url, size', async () => {
    const testFile = path.join(tmpMediaDir, 'test-img.png');
    fs.writeFileSync(testFile, 'fake-png-data');
    const res = await request(app).get('/api/media');
    const file = res.body.files.find(f => f.filename === 'test-img.png');
    expect(file).toBeDefined();
    expect(file.url).toBe('/api/media/test-img.png');
    expect(typeof file.size).toBe('number');
    fs.unlinkSync(testFile);
  });
});

// ---------------------------------------------------------------------------
// POST /api/media/upload
// ---------------------------------------------------------------------------

describe('POST /api/media/upload', () => {
  const testMediaDir = path.join(os.tmpdir(), `quiz-media-test-${Date.now()}`);

  beforeAll(() => fs.mkdirSync(testMediaDir, { recursive: true }));
  afterAll(() => fs.rmSync(testMediaDir, { recursive: true, force: true }));

  beforeEach(() => {
    process.env.TEST_MEDIA_DIR = testMediaDir;
    for (const f of fs.readdirSync(testMediaDir)) {
      fs.unlinkSync(path.join(testMediaDir, f));
    }
  });

  afterEach(() => {
    delete process.env.TEST_MEDIA_DIR;
  });

  test('uploads a valid JPEG and returns filename + url', async () => {
    const jpegBytes = Buffer.from(
      'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda00080101000003f0007fffd9',
      'hex'
    );
    const res = await request(app)
      .post('/api/media/upload')
      .attach('image', jpegBytes, { filename: 'test.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.filename).toMatch(/\.jpg$/);
    expect(res.body.url).toBe(`/api/media/${res.body.filename}`);
  });

  test('rejects non-image file type', async () => {
    const res = await request(app)
      .post('/api/media/upload')
      .attach('image', Buffer.from('hello'), { filename: 'evil.exe', contentType: 'application/octet-stream' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/тип/i);
  });

  test('rejects when no file attached', async () => {
    const res = await request(app)
      .post('/api/media/upload')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('uploads a PNG successfully', async () => {
    const pngBytes = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
      'hex'
    );
    const res = await request(app)
      .post('/api/media/upload')
      .attach('image', pngBytes, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.filename).toMatch(/\.png$/);
  });
});

// ---------------------------------------------------------------------------
// POST /api/media/upload — deduplication
// ---------------------------------------------------------------------------

describe('POST /api/media/upload — deduplication', () => {
  let localMediaDir;
  beforeAll(() => {
    localMediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-dedup-'));
    process.env.TEST_MEDIA_DIR = localMediaDir;
  });
  afterAll(() => {
    fs.rmSync(localMediaDir, { recursive: true, force: true });
    delete process.env.TEST_MEDIA_DIR;
  });
  beforeEach(() => {
    // Очищаємо директорію перед кожним тестом
    for (const f of fs.readdirSync(localMediaDir)) {
      fs.unlinkSync(path.join(localMediaDir, f));
    }
  });

  it('creates one file on first upload', async () => {
    const buf = Buffer.from('fake-image-data-dedup-test');
    const res = await request(app)
      .post('/api/media/upload')
      .attach('image', buf, { filename: 'test.png', contentType: 'image/png' });
    expect(res.body.success).toBe(true);
    expect(fs.readdirSync(localMediaDir)).toHaveLength(1);
  });

  it('returns existing filename when uploading identical file twice', async () => {
    const buf = Buffer.from('fake-image-data-identical');
    const res1 = await request(app)
      .post('/api/media/upload')
      .attach('image', buf, { filename: 'a.png', contentType: 'image/png' });
    expect(res1.body.success).toBe(true);

    const res2 = await request(app)
      .post('/api/media/upload')
      .attach('image', buf, { filename: 'b.png', contentType: 'image/png' });
    expect(res2.body.success).toBe(true);
    expect(res2.body.filename).toBe(res1.body.filename);
    expect(fs.readdirSync(localMediaDir)).toHaveLength(1);
  });

  it('creates new file when content differs', async () => {
    const res1 = await request(app)
      .post('/api/media/upload')
      .attach('image', Buffer.from('image-data-A'), { filename: 'a.png', contentType: 'image/png' });
    const res2 = await request(app)
      .post('/api/media/upload')
      .attach('image', Buffer.from('image-data-B'), { filename: 'b.png', contentType: 'image/png' });
    expect(res1.body.filename).not.toBe(res2.body.filename);
    expect(fs.readdirSync(localMediaDir)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/media/orphans
// ---------------------------------------------------------------------------

describe('DELETE /api/media/orphans', () => {
  let orphanMediaDir;
  beforeAll(() => {
    orphanMediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-orphans-'));
    process.env.TEST_MEDIA_DIR = orphanMediaDir;
  });
  afterAll(() => {
    fs.rmSync(orphanMediaDir, { recursive: true, force: true });
    delete process.env.TEST_MEDIA_DIR;
  });
  beforeEach(() => {
    for (const f of fs.readdirSync(orphanMediaDir)) {
      fs.unlinkSync(path.join(orphanMediaDir, f));
    }
  });

  it('deletes unreferenced image files', async () => {
    fs.writeFileSync(path.join(orphanMediaDir, 'orphan.png'), 'fake');
    const res = await request(app).delete('/api/media/orphans');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.deleted).toContain('orphan.png');
    expect(fs.existsSync(path.join(orphanMediaDir, 'orphan.png'))).toBe(false);
  });

  it('keeps referenced image files', async () => {
    const keepFile = 'keep-me.png';
    fs.writeFileSync(path.join(orphanMediaDir, keepFile), 'fake-keep');
    // Save a quiz that references this file
    await request(app)
      .post('/api/quizzes/save')
      .send({
        title: 'Orphan Ref Quiz',
        categoryMode: true,
        rounds: [{ options: [
          { category: 'A', question: 'Q?', answers: ['a','b','c','d'], correctAnswer: 0, image: keepFile },
          { category: 'B', question: 'Q2?', answers: ['a','b','c','d'], correctAnswer: 1 }
        ]}]
      });
    const res = await request(app).delete('/api/media/orphans');
    expect(res.body.deleted).not.toContain(keepFile);
    expect(fs.existsSync(path.join(orphanMediaDir, keepFile))).toBe(true);
  });

  it('returns empty deleted array when no orphans exist', async () => {
    const res = await request(app).delete('/api/media/orphans');
    expect(res.body.deleted).toHaveLength(0);
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
