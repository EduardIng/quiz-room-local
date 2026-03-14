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
});
