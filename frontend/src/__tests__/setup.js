import '@testing-library/jest-dom';

// Мок AudioContext — jsdom не реалізує Web Audio API
window.AudioContext = class MockAudioContext {
  createOscillator() {
    return {
      connect: vi.fn(), start: vi.fn(), stop: vi.fn(),
      frequency: { setValueAtTime: vi.fn() }
    };
  }
  createGain() {
    return {
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
    };
  }
  get destination() { return {}; }
  get currentTime() { return 0; }
};
window.webkitAudioContext = window.AudioContext;

// Спільний мок-сокет — доступний через socketModule.__mockSocket в тестах
const __mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
  id: 'test-socket-id',
};

// Мок socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => __mockSocket),
  __mockSocket,
}));

// Мок fetch
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ roomCode: null }),
  })
);
