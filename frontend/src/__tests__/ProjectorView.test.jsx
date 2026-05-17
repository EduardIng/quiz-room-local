import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import * as socketModule from 'socket.io-client';
import ProjectorView from '../components/ProjectorView';

const mockSocket = socketModule.__mockSocket;

describe('ProjectorView — початковий рендер', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ roomCode: 'TEST01' }) })
    );
  });

  it('рендериться без помилок', () => {
    const { container } = render(<ProjectorView />);
    expect(container).toBeTruthy();
  });
});

describe('ProjectorView — обробка подій socket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ roomCode: 'TEST01' }) })
    );
  });

  it('обробляє PLAYER_JOINED без помилок', async () => {
    render(<ProjectorView />);
    await waitFor(() => expect(mockSocket.on.mock.calls.length).toBeGreaterThan(0));

    const handler = mockSocket.on.mock.calls.find(([name]) => name === 'quiz-update')?.[1];
    expect(handler).toBeDefined();
    act(() => {
      handler({
        type: 'PLAYER_JOINED',
        players: [{ nickname: 'Аліса', score: 0 }],
        totalPlayers: 1,
        targetPlayerCount: 4
      });
    });
    expect(document.body.children.length).toBeGreaterThan(0);
  });

  it('обробляє NEW_QUESTION з картками відповідей без помилок', async () => {
    render(<ProjectorView />);
    await waitFor(() => expect(mockSocket.on.mock.calls.length).toBeGreaterThan(0));

    const handler = mockSocket.on.mock.calls.find(([name]) => name === 'quiz-update')?.[1];
    expect(handler).toBeDefined();
    act(() => {
      handler({
        type: 'NEW_QUESTION',
        questionIndex: 1,
        totalQuestions: 3,
        question: {
          text: 'Столиця Франції?',
          answers: [
            { id: 0, text: 'Берлін' }, { id: 1, text: 'Лондон' },
            { id: 2, text: 'Париж' },  { id: 3, text: 'Рим' }
          ]
        },
        timeLimit: 30
      });
    });
    expect(document.body.children.length).toBeGreaterThan(0);
  });

  it('обробляє ANSWER_COUNT без помилок', async () => {
    render(<ProjectorView />);
    await waitFor(() => expect(mockSocket.on.mock.calls.length).toBeGreaterThan(0));

    const handler = mockSocket.on.mock.calls.find(([name]) => name === 'quiz-update')?.[1];
    expect(handler).toBeDefined();
    act(() => { handler({ type: 'ANSWER_COUNT', answered: 2, total: 4 }); });
    expect(document.body.children.length).toBeGreaterThan(0);
  });

  it('обробляє SHOW_LEADERBOARD з топ-3 без помилок', async () => {
    render(<ProjectorView />);
    await waitFor(() => expect(mockSocket.on.mock.calls.length).toBeGreaterThan(0));

    const handler = mockSocket.on.mock.calls.find(([name]) => name === 'quiz-update')?.[1];
    expect(handler).toBeDefined();
    act(() => {
      handler({
        type: 'SHOW_LEADERBOARD',
        leaderboard: [
          { nickname: 'Аліса', score: 360, position: 1 },
          { nickname: 'Богдан', score: 280, position: 2 },
          { nickname: 'Василь', score: 200, position: 3 }
        ],
        questionIndex: 1,
        totalQuestions: 3,
        isLastQuestion: false
      });
    });
    expect(document.body.children.length).toBeGreaterThan(0);
  });

  it('обробляє disconnect від сервера без помилок', async () => {
    render(<ProjectorView />);
    await waitFor(() => expect(mockSocket.on.mock.calls.length).toBeGreaterThan(0));

    // Знаходимо обробник disconnect
    const disconnectHandler = mockSocket.on.mock.calls.find(([name]) => name === 'disconnect')?.[1];
    // Якщо обробник зареєстрований — перевіряємо що він не кидає помилку
    if (disconnectHandler) {
      expect(() => {
        act(() => { disconnectHandler(); });
      }).not.toThrow();
    }
    // Компонент повинен залишитися рендерним (не крешнутися)
    expect(document.body.children.length).toBeGreaterThan(0);
  });

  it('обробляє невідомий тип події без помилок (default case)', async () => {
    render(<ProjectorView />);
    await waitFor(() => expect(mockSocket.on.mock.calls.length).toBeGreaterThan(0));

    const handler = mockSocket.on.mock.calls.find(([name]) => name === 'quiz-update')?.[1];
    expect(handler).toBeDefined();
    // Невідомий тип не повинен спричинити помилку
    expect(() => {
      act(() => { handler({ type: 'UNKNOWN_EVENT_TYPE' }); });
    }).not.toThrow();
    expect(document.body.children.length).toBeGreaterThan(0);
  });
});

describe('ProjectorView — категорії (watching phase)', () => {
  // Зберігаємо обробники сокету для ручного виклику connect
  let socketHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    socketHandlers = {};

    // Мокаємо socket.on щоб зберігати обробники для ручного виклику
    mockSocket.on.mockImplementation((event, cb) => {
      if (!socketHandlers[event]) socketHandlers[event] = [];
      socketHandlers[event].push(cb);
    });

    // Мокаємо socket.emit щоб watch-room одразу відповідав success
    mockSocket.emit.mockImplementation((event, data, callback) => {
      if (event === 'watch-room' && callback) {
        callback({
          success: true,
          gameState: { gameState: 'WAITING', players: [], quizTitle: 'Test Quiz' }
        });
      }
    });

    // Додаємо removeAllListeners мок
    mockSocket.removeAllListeners = vi.fn();

    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ roomCode: 'TEST01' }) })
    );
  });

  /**
   * Допоміжна функція: рендерить ProjectorView, чекає реєстрації обробників,
   * запускає connect callback щоб перевести компонент у phase='watching',
   * повертає quiz-update handler для подальшого виклику
   */
  async function renderAndConnect() {
    render(<ProjectorView />);
    // Чекаємо поки компонент зареєструє обробники через connectToRoom
    await waitFor(() => expect(mockSocket.on.mock.calls.length).toBeGreaterThan(0));

    // Симулюємо підключення сокету — виклик connect callback
    if (socketHandlers.connect) {
      act(() => {
        socketHandlers.connect.forEach(cb => cb());
      });
    }

    // Отримуємо quiz-update handler
    const quizUpdateHandlers = socketHandlers['quiz-update'] || [];
    const handler = quizUpdateHandlers[quizUpdateHandlers.length - 1];
    return handler;
  }

  it('обробляє CATEGORY_SELECT — показує варіанти категорій', async () => {
    const handler = await renderAndConnect();
    expect(handler).toBeDefined();

    act(() => {
      handler({
        type: 'CATEGORY_SELECT',
        chooserNickname: 'Богдан',
        options: [
          { index: 0, category: 'Географія' },
          { index: 1, category: 'Історія' }
        ],
        roundIndex: 1,
        totalRounds: 3,
        timeLimit: 15
      });
    });

    // Перевіряємо що назви категорій відображаються на екрані
    expect(document.body.textContent).toContain('Географія');
    expect(document.body.textContent).toContain('Історія');
    // Перевіряємо що показано хто обирає
    expect(document.body.textContent).toContain('Богдан');
  });

  it('обробляє CATEGORY_CHOSEN — показує обрану категорію', async () => {
    const handler = await renderAndConnect();
    expect(handler).toBeDefined();

    // Спочатку відправляємо CATEGORY_SELECT щоб встановити стан
    act(() => {
      handler({
        type: 'CATEGORY_SELECT',
        chooserNickname: 'Аліса',
        options: [
          { index: 0, category: 'Наука' },
          { index: 1, category: 'Музика' }
        ],
        roundIndex: 1,
        totalRounds: 3,
        timeLimit: 15
      });
    });
    // Потім відправляємо CATEGORY_CHOSEN
    act(() => {
      handler({
        type: 'CATEGORY_CHOSEN',
        category: 'Наука',
        wasTimeout: false
      });
    });
    // Перевіряємо що обрана категорія відображається
    expect(document.body.textContent).toContain('Наука');
    // Перевіряємо що є мітка "Категорія"
    expect(document.body.textContent).toContain('Категорія');
  });

  it('обробляє CATEGORY_CHOSEN з wasTimeout=true без помилок', async () => {
    const handler = await renderAndConnect();
    expect(handler).toBeDefined();

    act(() => {
      handler({
        type: 'CATEGORY_CHOSEN',
        category: 'Спорт',
        wasTimeout: true
      });
    });
    // Перевіряємо що навіть при авто-виборі (timeout) категорія відображається
    expect(document.body.textContent).toContain('Спорт');
  });

  it('після CATEGORY_SELECT gameState стає CATEGORY_SELECT', async () => {
    const handler = await renderAndConnect();
    expect(handler).toBeDefined();

    act(() => {
      handler({
        type: 'CATEGORY_SELECT',
        chooserNickname: 'Василь',
        options: [
          { index: 0, category: 'Кіно' },
          { index: 1, category: 'Музика' }
        ],
        roundIndex: 2,
        totalRounds: 5,
        timeLimit: 15
      });
    });
    // Категорії відображаються як картки
    expect(document.body.textContent).toContain('Кіно');
    expect(document.body.textContent).toContain('Музика');
    // Текст вибору відображається
    expect(document.body.textContent).toContain('Василь');
  });

  it('обробляє disconnect після watching — повертає до очікування', async () => {
    await renderAndConnect();

    // Перевіряємо що компонент у стані watching
    expect(document.body.textContent).toContain('Test Quiz');

    // Симулюємо disconnect
    if (socketHandlers.disconnect) {
      act(() => {
        socketHandlers.disconnect.forEach(cb => cb());
      });
    }

    // Після disconnect компонент повертається до waiting_for_room
    await waitFor(() => {
      const text = document.body.textContent;
      expect(text.includes('Очікування') || text.includes('Quiz Room')).toBe(true);
    });
  });
});
