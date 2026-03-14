import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import * as socketModule from 'socket.io-client';
import PlayerView from '../components/PlayerView';

// Спільний мок-сокет з setup.js
const mockSocket = socketModule.__mockSocket;

describe('PlayerView — початковий стан', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ roomCode: null }) })
    );
  });

  it('рендериться без помилок', () => {
    const { container } = render(<PlayerView />);
    expect(container).toBeTruthy();
  });
});

describe('PlayerView — join flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ roomCode: 'ABC123' }) })
    );
  });

  it('показує поле для нікнейму після знаходження кімнати', async () => {
    render(<PlayerView />);
    await waitFor(() => {
      expect(document.querySelector('input')).not.toBeNull();
    }, { timeout: 5000 });
  });
});

describe('PlayerView — обробка подій quiz-update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ roomCode: 'ABC123' }) })
    );
  });

  it('обробляє QUIZ_STARTING без помилок', async () => {
    render(<PlayerView />);
    await waitFor(() => expect(mockSocket.on.mock.calls.length).toBeGreaterThan(0));

    const handler = mockSocket.on.mock.calls.find(([name]) => name === 'quiz-update')?.[1];
    expect(handler).toBeDefined();
    act(() => {
      handler({ type: 'QUIZ_STARTING', countdown: 3, quizTitle: 'Test Quiz', totalQuestions: 3 });
    });
    expect(document.body.children.length).toBeGreaterThan(0);
  });

  it('обробляє NEW_QUESTION без помилок', async () => {
    render(<PlayerView />);
    await waitFor(() => expect(mockSocket.on.mock.calls.length).toBeGreaterThan(0));

    const handler = mockSocket.on.mock.calls.find(([name]) => name === 'quiz-update')?.[1];
    expect(handler).toBeDefined();
    act(() => {
      handler({
        type: 'NEW_QUESTION',
        questionIndex: 1,
        totalQuestions: 3,
        question: {
          text: 'Скільки буде 2+2?',
          answers: [{ id: 0, text: '3' }, { id: 1, text: '4' }, { id: 2, text: '5' }, { id: 3, text: '22' }]
        },
        timeLimit: 30
      });
    });
    expect(document.body.children.length).toBeGreaterThan(0);
  });

  it('обробляє REVEAL_ANSWER без помилок', async () => {
    render(<PlayerView />);
    await waitFor(() => expect(mockSocket.on.mock.calls.length).toBeGreaterThan(0));

    const handler = mockSocket.on.mock.calls.find(([name]) => name === 'quiz-update')?.[1];
    expect(handler).toBeDefined();
    act(() => {
      handler({
        type: 'REVEAL_ANSWER',
        correctAnswer: 1,
        statistics: {
          total: 1, notAnswered: 0, correctAnswer: 1,
          answers: { 0: { count: 0, percentage: 0 }, 1: { count: 1, percentage: 100 }, 2: { count: 0, percentage: 0 }, 3: { count: 0, percentage: 0 } }
        },
        playerResults: [{ playerId: 'test-socket-id', nickname: 'TestPlayer', answerId: 1, isCorrect: true, pointsEarned: 160 }]
      });
    });
    expect(document.body.children.length).toBeGreaterThan(0);
  });

  it('обробляє SHOW_LEADERBOARD без помилок', async () => {
    render(<PlayerView />);
    await waitFor(() => expect(mockSocket.on.mock.calls.length).toBeGreaterThan(0));

    const handler = mockSocket.on.mock.calls.find(([name]) => name === 'quiz-update')?.[1];
    expect(handler).toBeDefined();
    act(() => {
      handler({
        type: 'SHOW_LEADERBOARD',
        leaderboard: [{ playerId: 'test-socket-id', nickname: 'TestPlayer', score: 160, position: 1 }],
        questionIndex: 1,
        totalQuestions: 3,
        isLastQuestion: false
      });
    });
    expect(document.body.children.length).toBeGreaterThan(0);
  });

  it('обробляє CATEGORY_SELECT без помилок', async () => {
    render(<PlayerView />);
    await waitFor(() => expect(mockSocket.on.mock.calls.length).toBeGreaterThan(0));

    const handler = mockSocket.on.mock.calls.find(([name]) => name === 'quiz-update')?.[1];
    expect(handler).toBeDefined();
    act(() => {
      handler({
        type: 'CATEGORY_SELECT',
        chooserNickname: 'TestPlayer',
        options: [{ index: 0, category: 'Географія' }, { index: 1, category: 'Наука' }],
        roundIndex: 1,
        totalRounds: 3,
        timeLimit: 15
      });
    });
    expect(document.body.children.length).toBeGreaterThan(0);
  });

  it('обробляє QUIZ_ENDED без помилок', async () => {
    render(<PlayerView />);
    await waitFor(() => expect(mockSocket.on.mock.calls.length).toBeGreaterThan(0));

    const handler = mockSocket.on.mock.calls.find(([name]) => name === 'quiz-update')?.[1];
    expect(handler).toBeDefined();
    act(() => {
      handler({
        type: 'QUIZ_ENDED',
        finalLeaderboard: [{ playerId: 'test-socket-id', nickname: 'TestPlayer', score: 320, position: 1 }],
        totalQuestions: 3
      });
    });
    expect(document.body.children.length).toBeGreaterThan(0);
  });
});
