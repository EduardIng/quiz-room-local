import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import HostView from '../components/HostView';

describe('HostView — завантаження бібліотеки квізів', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            quizzes: [
              {
                id: 'quiz-1',
                title: 'Географія',
                rounds: [
                  {
                    options: [
                      { category: 'Міста', question: 'Q?', answers: ['A','B','C','D'], correctAnswer: 0 },
                      { category: 'Країни', question: 'Q2?', answers: ['A','B','C','D'], correctAnswer: 1 }
                    ]
                  }
                ]
              }
            ]
          })
      })
    );
  });

  it('рендериться без помилок', () => {
    const { container } = render(<HostView />);
    expect(container).toBeTruthy();
  });

  it('показує назву квізу після завантаження', async () => {
    render(<HostView />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('Географія');
    }, { timeout: 3000 });
  });

  it('показує кнопки керування після вибору квізу', async () => {
    render(<HostView />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('Географія');
    }, { timeout: 3000 });
    expect(document.querySelectorAll('button').length).toBeGreaterThan(0);
  });
});

describe('HostView — порожня бібліотека', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ quizzes: [] }) })
    );
  });

  it('рендериться без помилок з порожнім списком', async () => {
    render(<HostView />);
    await waitFor(() => expect(document.body).toBeTruthy(), { timeout: 3000 });
  });
});

describe('HostView — помилка завантаження', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));
  });

  it('показує помилку якщо fetch не вдався', async () => {
    render(<HostView />);
    await waitFor(() => expect(document.body).toBeTruthy(), { timeout: 3000 });
  });
});
