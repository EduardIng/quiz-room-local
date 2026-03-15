/**
 * quiz-storage.test.js — Тести для quiz-storage.js
 *
 * Перевіряє завантаження, збереження та видалення квізів з диску.
 * Використовує тимчасову директорію щоб не торкатись реального quizzes/
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Тимчасова директорія — ізолює тести від реального quizzes/
let tmpDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-test-'));
  process.env.TEST_QUIZZES_DIR = tmpDir;
});

afterAll(() => {
  // Прибираємо тимчасову директорію
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.TEST_QUIZZES_DIR;
});

beforeEach(() => {
  // Очищаємо директорію між тестами
  for (const f of fs.readdirSync(tmpDir)) {
    fs.unlinkSync(path.join(tmpDir, f));
  }
  // Перезавантажуємо модуль щоб він підхопив новий TEST_QUIZZES_DIR
  jest.resetModules();
});

function getStorage() {
  return require('../src/quiz-storage');
}

// ---------------------------------------------------------------------------
// Тестові дані
// ---------------------------------------------------------------------------

const STANDARD_QUIZ = {
  title: 'Test Quiz',
  questions: [
    { question: 'Q1?', answers: ['A', 'B', 'C', 'D'], correctAnswer: 0 }
  ]
};

const CATEGORY_QUIZ = {
  title: 'Category Quiz',
  categoryMode: true,
  rounds: [
    {
      options: [
        { category: 'Geo', question: 'Q?', answers: ['A', 'B', 'C', 'D'], correctAnswer: 1 },
        { category: 'History', question: 'Q2?', answers: ['A', 'B', 'C', 'D'], correctAnswer: 2 }
      ]
    }
  ]
};

// ---------------------------------------------------------------------------
// loadAllQuizzes
// ---------------------------------------------------------------------------

describe('loadAllQuizzes', () => {
  test('повертає порожній масив якщо директорія порожня', () => {
    const { loadAllQuizzes } = getStorage();
    expect(loadAllQuizzes()).toEqual([]);
  });

  test('завантажує стандартний квіз', () => {
    fs.writeFileSync(path.join(tmpDir, 'my-quiz.json'), JSON.stringify(STANDARD_QUIZ));
    const { loadAllQuizzes } = getStorage();
    const quizzes = loadAllQuizzes();
    expect(quizzes).toHaveLength(1);
    expect(quizzes[0].title).toBe('Test Quiz');
    expect(quizzes[0].id).toBe('my-quiz');
  });

  test('завантажує category mode квіз', () => {
    fs.writeFileSync(path.join(tmpDir, 'cat-quiz.json'), JSON.stringify(CATEGORY_QUIZ));
    const { loadAllQuizzes } = getStorage();
    const quizzes = loadAllQuizzes();
    expect(quizzes).toHaveLength(1);
    expect(quizzes[0].categoryMode).toBe(true);
    expect(quizzes[0].rounds).toHaveLength(1);
  });

  test('пропускає файл без title', () => {
    fs.writeFileSync(path.join(tmpDir, 'bad.json'), JSON.stringify({ questions: [{}] }));
    const { loadAllQuizzes } = getStorage();
    expect(loadAllQuizzes()).toHaveLength(0);
  });

  test('пропускає файл без questions або rounds', () => {
    fs.writeFileSync(path.join(tmpDir, 'bad.json'), JSON.stringify({ title: 'No questions' }));
    const { loadAllQuizzes } = getStorage();
    expect(loadAllQuizzes()).toHaveLength(0);
  });

  test('пропускає невалідний JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'broken.json'), 'not json {{{');
    const { loadAllQuizzes } = getStorage();
    expect(loadAllQuizzes()).toHaveLength(0);
  });

  test('не завантажує README.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'README.json'), JSON.stringify(STANDARD_QUIZ));
    const { loadAllQuizzes } = getStorage();
    expect(loadAllQuizzes()).toHaveLength(0);
  });

  test('не перезаписує існуючий id в квізі', () => {
    const quizWithId = { ...STANDARD_QUIZ, id: 'custom-id' };
    fs.writeFileSync(path.join(tmpDir, 'filename.json'), JSON.stringify(quizWithId));
    const { loadAllQuizzes } = getStorage();
    const quizzes = loadAllQuizzes();
    expect(quizzes[0].id).toBe('custom-id');
  });

  test('завантажує кілька квізів', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.json'), JSON.stringify(STANDARD_QUIZ));
    fs.writeFileSync(path.join(tmpDir, 'b.json'), JSON.stringify(CATEGORY_QUIZ));
    const { loadAllQuizzes } = getStorage();
    expect(loadAllQuizzes()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// saveQuiz
// ---------------------------------------------------------------------------

describe('saveQuiz', () => {
  test('зберігає стандартний квіз і повертає id та filename', () => {
    const { saveQuiz } = getStorage();
    const result = saveQuiz(STANDARD_QUIZ);
    expect(result.filename).toBe('test-quiz.json');
    expect(result.id).toBe('test-quiz');
    expect(fs.existsSync(path.join(tmpDir, 'test-quiz.json'))).toBe(true);
  });

  test('зберігає category mode квіз', () => {
    const { saveQuiz } = getStorage();
    const result = saveQuiz(CATEGORY_QUIZ);
    expect(result.filename).toBe('category-quiz.json');
    const saved = JSON.parse(fs.readFileSync(path.join(tmpDir, result.filename), 'utf8'));
    expect(saved.categoryMode).toBe(true);
    expect(saved.rounds).toHaveLength(1);
  });

  test('додає суфікс -2 при колізії імен', () => {
    const { saveQuiz } = getStorage();
    saveQuiz(STANDARD_QUIZ);
    const result2 = saveQuiz(STANDARD_QUIZ);
    expect(result2.filename).toBe('test-quiz-2.json');
    expect(result2.id).toBe('test-quiz-2');
  });

  test('додає суфікс -3 при другій колізії', () => {
    const { saveQuiz } = getStorage();
    saveQuiz(STANDARD_QUIZ);
    saveQuiz(STANDARD_QUIZ);
    const result3 = saveQuiz(STANDARD_QUIZ);
    expect(result3.filename).toBe('test-quiz-3.json');
  });

  test('зберігає id всередині файлу', () => {
    const { saveQuiz } = getStorage();
    const result = saveQuiz(STANDARD_QUIZ);
    const saved = JSON.parse(fs.readFileSync(path.join(tmpDir, result.filename), 'utf8'));
    expect(saved.id).toBe(result.id);
  });

  test('кидає помилку якщо title відсутній', () => {
    const { saveQuiz } = getStorage();
    expect(() => saveQuiz({ questions: [{}] })).toThrow();
  });

  test('кидає помилку якщо questions порожній масив', () => {
    const { saveQuiz } = getStorage();
    expect(() => saveQuiz({ title: 'Empty', questions: [] })).toThrow();
  });

  test('кидає помилку якщо categoryMode але rounds порожній', () => {
    const { saveQuiz } = getStorage();
    expect(() => saveQuiz({ title: 'Bad', categoryMode: true, rounds: [] })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// deleteQuiz
// ---------------------------------------------------------------------------

describe('deleteQuiz', () => {
  test('видаляє існуючий квіз і повертає true', () => {
    const { saveQuiz, deleteQuiz } = getStorage();
    const { id } = saveQuiz(STANDARD_QUIZ);
    expect(deleteQuiz(id)).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'test-quiz.json'))).toBe(false);
  });

  test('повертає false якщо квіз не знайдено', () => {
    const { deleteQuiz } = getStorage();
    expect(deleteQuiz('does-not-exist')).toBe(false);
  });

  test('захист від path traversal — не виходить за межі директорії', () => {
    const { deleteQuiz } = getStorage();
    // path.basename('../../etc/passwd') = 'passwd' — файл не існує в tmpDir, тому false
    expect(deleteQuiz('../../etc/passwd')).toBe(false);
  });

  test('захист від path traversal — не видаляє файли поза quizzes/', () => {
    // Створюємо файл поза tmpDir і переконуємось що він не видалений
    const outsideFile = path.join(os.tmpdir(), 'should-not-delete.json');
    fs.writeFileSync(outsideFile, '{}');
    const { deleteQuiz } = getStorage();
    deleteQuiz('../should-not-delete');
    expect(fs.existsSync(outsideFile)).toBe(true);
    fs.unlinkSync(outsideFile);
  });
});

// ---------------------------------------------------------------------------
// validateNoCategoryRepeat
// ---------------------------------------------------------------------------

describe('validateNoCategoryRepeat', () => {
  test('повертає valid для раундів без спільних категорій', () => {
    const { validateNoCategoryRepeat } = getStorage();
    const rounds = [
      { options: [{ category: 'Історія' }, { category: 'Наука' }] },
      { options: [{ category: 'Географія' }, { category: 'Логотипи' }] },
    ];
    expect(validateNoCategoryRepeat(rounds)).toEqual({ valid: true });
  });

  test('повертає invalid коли перша категорія раунду N+1 збігається з раундом N', () => {
    const { validateNoCategoryRepeat } = getStorage();
    const rounds = [
      { options: [{ category: 'Логотипи' }, { category: 'Загальні' }] },
      { options: [{ category: 'Логотипи' }, { category: 'Наука' }] },
    ];
    const result = validateNoCategoryRepeat(rounds);
    expect(result.valid).toBe(false);
    expect(result.round).toBe(1);
    expect(result.category).toBe('Логотипи');
  });

  test('повертає invalid коли друга категорія раунду N+1 збігається з раундом N', () => {
    const { validateNoCategoryRepeat } = getStorage();
    const rounds = [
      { options: [{ category: 'Логотипи' }, { category: 'Загальні' }] },
      { options: [{ category: 'Наука' }, { category: 'Загальні' }] },
    ];
    const result = validateNoCategoryRepeat(rounds);
    expect(result.valid).toBe(false);
    expect(result.round).toBe(1);
    expect(result.category).toBe('Загальні');
  });

  test('повертає valid для одного раунду', () => {
    const { validateNoCategoryRepeat } = getStorage();
    const rounds = [
      { options: [{ category: 'Логотипи' }, { category: 'Загальні' }] },
    ];
    expect(validateNoCategoryRepeat(rounds)).toEqual({ valid: true });
  });

  test('повертає invalid для порушення посередині масиву', () => {
    const { validateNoCategoryRepeat } = getStorage();
    const rounds = [
      { options: [{ category: 'A' }, { category: 'B' }] },
      { options: [{ category: 'C' }, { category: 'D' }] },
      { options: [{ category: 'D' }, { category: 'E' }] }, // D повторюється з раунду 1
    ];
    const result = validateNoCategoryRepeat(rounds);
    expect(result.valid).toBe(false);
    expect(result.round).toBe(2);
    expect(result.category).toBe('D');
  });
});

// ---------------------------------------------------------------------------
// saveQuiz — no-repeat category enforcement
// ---------------------------------------------------------------------------

describe('saveQuiz — категорії не повторюються', () => {
  test('кидає помилку якщо категорія повторюється у двох поспіль раундах', () => {
    const { saveQuiz } = getStorage();
    const quiz = {
      title: 'Bad Category Quiz',
      categoryMode: true,
      rounds: [
        { options: [
          { category: 'Логотипи', question: 'Q?', answers: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
          { category: 'Загальні', question: 'Q?', answers: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
        ]},
        { options: [
          { category: 'Логотипи', question: 'Q?', answers: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
          { category: 'Наука', question: 'Q?', answers: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
        ]},
      ],
    };
    expect(() => saveQuiz(quiz)).toThrow(/Раунд 2.*Логотипи/);
  });

  test('зберігає квіз якщо категорії не повторюються', () => {
    const { saveQuiz } = getStorage();
    const quiz = {
      title: 'Good Category Quiz',
      categoryMode: true,
      rounds: [
        { options: [
          { category: 'Логотипи', question: 'Q?', answers: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
          { category: 'Загальні', question: 'Q?', answers: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
        ]},
        { options: [
          { category: 'Наука', question: 'Q?', answers: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
          { category: 'Історія', question: 'Q?', answers: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
        ]},
      ],
    };
    expect(() => saveQuiz(quiz)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// saveQuiz — upsert
// ---------------------------------------------------------------------------

describe('saveQuiz — upsert', () => {
  it('перезаписує існуючий файл коли id збігається', () => {
    const { saveQuiz } = getStorage();
    const q1 = { title: 'Upsert Quiz', categoryMode: true, rounds: [{ options: [
      { category: 'A', question: 'Q?', answers: ['a','b','c','d'], correctAnswer: 0 },
      { category: 'B', question: 'Q2?', answers: ['a','b','c','d'], correctAnswer: 1 }
    ]}]};
    const r1 = saveQuiz(q1);
    // Save again with same id — should overwrite, not create -2
    const q2 = { ...q1, title: 'Upsert Quiz Updated', id: r1.id };
    const r2 = saveQuiz(q2);
    expect(r2.id).toBe(r1.id);
    expect(r2.filename).toBe(r1.filename);
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.json'));
    expect(files).toHaveLength(1);
    const saved = JSON.parse(fs.readFileSync(path.join(tmpDir, r2.filename), 'utf8'));
    expect(saved.title).toBe('Upsert Quiz Updated');
  });

  it('створює новий файл коли id не передано', () => {
    const { saveQuiz } = getStorage();
    const q = { title: 'No ID Quiz', categoryMode: true, rounds: [{ options: [
      { category: 'A', question: 'Q?', answers: ['a','b','c','d'], correctAnswer: 0 },
      { category: 'B', question: 'Q2?', answers: ['a','b','c','d'], correctAnswer: 1 }
    ]}]};
    const r1 = saveQuiz(q);
    const r2 = saveQuiz(q); // no id — should make second file
    expect(r2.id).not.toBe(r1.id);
  });

  it('створює новий файл коли id передано але файл не існує', () => {
    const { saveQuiz } = getStorage();
    const q = { title: 'Стале ID', id: 'non-existent-id', categoryMode: true, rounds: [{ options: [
      { category: 'A', question: 'Q?', answers: ['a','b','c','d'], correctAnswer: 0 },
      { category: 'B', question: 'Q2?', answers: ['a','b','c','d'], correctAnswer: 1 }
    ]}]};
    const r = saveQuiz(q);
    // id не збігається з існуючим файлом — має створитись новий
    expect(r.filename).not.toBe('non-existent-id.json');
    expect(fs.existsSync(path.join(tmpDir, r.filename))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// loadQuizById
// ---------------------------------------------------------------------------

describe('loadQuizById', () => {
  test('завантажує квіз за id', () => {
    const { saveQuiz, loadQuizById } = getStorage();
    const { id } = saveQuiz(STANDARD_QUIZ);
    const quiz = loadQuizById(id);
    expect(quiz).not.toBeNull();
    expect(quiz.title).toBe('Test Quiz');
  });

  test('повертає null якщо квіз не знайдено', () => {
    const { loadQuizById } = getStorage();
    expect(loadQuizById('non-existent')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listReferencedMedia
// ---------------------------------------------------------------------------

describe('listReferencedMedia', () => {
  it('returns empty set when no quizzes', () => {
    const { listReferencedMedia } = getStorage();
    const refs = listReferencedMedia();
    expect(refs.size).toBe(0);
  });

  it('returns all image references from quizzes', () => {
    const { saveQuiz, listReferencedMedia } = getStorage();
    saveQuiz({ title: 'Media Quiz', categoryMode: true, rounds: [{ options: [
      { category: 'A', question: 'Q?', answers: ['a','b','c','d'], correctAnswer: 0, image: 'apple.jpg' },
      { category: 'B', question: 'Q2?', answers: ['a','b','c','d'], correctAnswer: 1, image: 'banana.png' }
    ]}]});
    const refs = listReferencedMedia();
    expect(refs.has('apple.jpg')).toBe(true);
    expect(refs.has('banana.png')).toBe(true);
  });
});
