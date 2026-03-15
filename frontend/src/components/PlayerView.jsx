/**
 * PlayerView.jsx - Kiosk інтерфейс гравця для Quiz Room Local
 *
 * Kiosk режим:
 * - Планшет завжди показує цей компонент (немає навігації)
 * - При завантаженні: опитує /api/current-room кожні 3с поки хост не запустить гру
 * - При знаходженні гри: показує тільки поле нікнейму (без коду кімнати)
 * - Після гри: повертається на екран очікування ведучого
 * - Auto-reconnect: підключається автоматично при втраті зв'язку
 * - Navigation lock: блокує F5, Backspace, Alt+F4
 * - Fullscreen: запитує повноекранний режим при першому дотику
 *
 * Екрани:
 * waiting_for_host → join → waiting → starting → question →
 * answer_sent → reveal → leaderboard → ended
 * (+ category_select, category_chosen для category mode)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import './PlayerView.css';
import Timebar from './Timebar.jsx';
import { playCorrect, playWrong, playTimeout, playTick, playCountdown, playFinish } from '../utils/sound.js';

// ─────────────────────────────────────────────
// КОНСТАНТИ
// ─────────────────────────────────────────────

// URL бекенду (у dev режимі - через Vite proxy, у prod - той самий origin)
const SERVER_URL = import.meta.env.DEV ? 'http://localhost:8080' : window.location.origin;

// Літери відповідей для відображення (A, B, C, D)
const ANSWER_LETTERS = ['A', 'B', 'C', 'D'];

// Kiosk налаштування (відповідають config.json → kiosk)
const RECONNECT_BASE_DELAY = 2000;   // мс між першою спробою перепідключення
const RECONNECT_MAX_DELAY  = 30000;  // максимальна затримка між спробами
const ROOM_POLL_INTERVAL   = 3000;   // мс між опитуваннями /api/current-room

// ─────────────────────────────────────────────
// ГОЛОВНИЙ КОМПОНЕНТ
// ─────────────────────────────────────────────

export default function PlayerView() {
  // ── Стан підключення ──
  // Поточний екран: 'waiting_for_host' | 'join' | 'waiting' | 'starting' |
  //                 'question' | 'answer_sent' | 'reveal' | 'leaderboard' |
  //                 'ended' | 'category_select' | 'category_chosen'
  const [screen, setScreen] = useState('waiting_for_host');

  // ── Стан kiosk ──
  const [isReconnecting, setIsReconnecting] = useState(false); // втрата зв'язку

  // ── Стан форми JOIN ──
  const [nickname, setNickname] = useState('');
  const [joinError, setJoinError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  // ── Стан гравця ──
  const [myNickname, setMyNickname] = useState('');
  const [myScore, setMyScore] = useState(0);

  // ── Стан поточного питання ──
  const [question, setQuestion] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [timeLimit, setTimeLimit] = useState(30);
  const [timeLeft, setTimeLeft] = useState(30);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [myAnswer, setMyAnswer] = useState(null);

  // ── Лічильник відповідей ──
  const [answeredCount, setAnsweredCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);

  // ── Стан відліку перед стартом ──
  const [countdown, setCountdown] = useState(3);

  // ── Стан результату (REVEAL екран) ──
  const [revealData, setRevealData] = useState(null);

  // ── Leaderboard ──
  const [leaderboard, setLeaderboard] = useState([]);
  const [isLastQuestion, setIsLastQuestion] = useState(false);

  // ── Список гравців в очікуванні ──
  const [waitingPlayers, setWaitingPlayers] = useState([]);

  // ── Category mode state ──
  const [categoryOptions, setCategoryOptions] = useState(null);
  const [categoryChooser, setCategoryChooser] = useState('');
  const [categoryTimeLeft, setCategoryTimeLeft] = useState(15);
  const [categoryTimeLimit, setCategoryTimeLimit] = useState(15);
  const [categoryChosen, setCategoryChosen] = useState(null);
  const categoryTimerRef = useRef(null);

  // ── Ref для Socket.IO ──
  const socketRef = useRef(null);

  // ── Ref для таймерів ──
  const timerRef = useRef(null);
  const countdownRef = useRef(null);

  // ── Ref для аудіо ──
  const audioRef = useRef(null);

  // ── Ref для handleServerUpdate (захист від stale closure) ──
  const handleServerUpdateRef = useRef(null);

  // ── Ref для question (захист від stale closure у handleRevealAnswer) ──
  const questionRef = useRef(null);

  // ── Ref для поточного екрану (для використання у socket reconnect) ──
  const screenRef = useRef('waiting_for_host');

  // ── Ref для коду кімнати (внутрішній, гравець не бачить) ──
  // Встановлюється автоматично з /api/current-room при виявленні гри
  const kioskRoomCodeRef = useRef(null);

  // ─────────────────────────────────────────────
  // СИНХРОНІЗАЦІЯ screenRef
  // ─────────────────────────────────────────────

  // Тримаємо ref синхронізованим зі стейтом (для socket reconnect handler)
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  // ─────────────────────────────────────────────
  // KIOSK: NAVIGATION LOCK
  // Блокуємо стандартну навігацію браузера
  // ─────────────────────────────────────────────

  useEffect(() => {
    // Попередження при спробі закрити вкладку / перезавантажити
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    // Блокуємо кнопки F5 (reload), Alt+F4, Backspace (back navigation)
    const handleKeyDown = (e) => {
      if (
        e.key === 'F5' ||
        (e.key === 'F4' && e.altKey) ||
        (e.key === 'Backspace' && e.target === document.body)
      ) {
        e.preventDefault();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // ─────────────────────────────────────────────
  // KIOSK: FULLSCREEN
  // Запитуємо повноекранний режим при першому дотику/кліку
  // ─────────────────────────────────────────────

  useEffect(() => {
    const requestFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {
          // Деякі браузери блокують fullscreen без user gesture — ігноруємо помилку
        });
      }
      // Видаляємо listener після першого спрацювання
      document.removeEventListener('click', requestFullscreen);
      document.removeEventListener('touchstart', requestFullscreen);
    };

    document.addEventListener('click', requestFullscreen);
    document.addEventListener('touchstart', requestFullscreen);

    return () => {
      document.removeEventListener('click', requestFullscreen);
      document.removeEventListener('touchstart', requestFullscreen);
    };
  }, []);

  // ─────────────────────────────────────────────
  // ІНІЦІАЛІЗАЦІЯ SOCKET.IO
  // ─────────────────────────────────────────────

  useEffect(() => {
    // Kiosk: нескінченне перепідключення з exponential backoff
    const socket = io(SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: RECONNECT_BASE_DELAY,
      reconnectionDelayMax: RECONNECT_MAX_DELAY
    });

    socketRef.current = socket;

    // Слухаємо головну подію через ref — завжди актуальний обробник
    socket.on('quiz-update', (data) => handleServerUpdateRef.current?.(data));

    // Оновлення списку гравців під час очікування
    socket.on('quiz-update', (data) => {
      if (data.type === 'PLAYER_JOINED' || data.type === 'PLAYER_LEFT') {
        setWaitingPlayers(data.players || []);
        setTotalPlayers(data.totalPlayers || 0);
      }
    });

    // Відключення: показуємо індикатор перепідключення
    socket.on('disconnect', () => {
      setIsReconnecting(true);
    });

    // Відновлення підключення: намагаємось відновити стан гри
    socket.on('connect', () => {
      setIsReconnecting(false);

      const currentScreen = screenRef.current;
      const roomCode = kioskRoomCodeRef.current;

      // Якщо були в грі до відключення — спробуємо відновити стан
      if (currentScreen !== 'waiting_for_host' && currentScreen !== 'join' && roomCode) {
        socket.emit('get-game-state', { roomCode }, (resp) => {
          if (!resp.success) {
            // Гра більше не існує — повертаємось на очікування ведучого
            resetToWaiting();
          }
          // Якщо успішно — сервер надішле quiz-update для синхронізації
        });
      }
    });

    // Розриваємо з'єднання при розмонтуванні компонента
    return () => {
      clearInterval(timerRef.current);
      clearInterval(countdownRef.current);
      clearInterval(categoryTimerRef.current);
      socket.disconnect();
    };
  }, []); // eslint-disable-line

  // ─────────────────────────────────────────────
  // KIOSK: ОПИТУВАННЯ /api/current-room
  // Коли на екрані очікування ведучого — перевіряємо кожні 3с
  // чи хост вже запустив гру
  // ─────────────────────────────────────────────

  useEffect(() => {
    // Опитуємо тільки коли очікуємо ведучого
    if (screen !== 'waiting_for_host') return;

    const poll = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/api/current-room`);
        const data = await res.json();
        if (data.roomCode) {
          // Хост запустив гру! Зберігаємо код та переходимо до вводу нікнейму
          kioskRoomCodeRef.current = data.roomCode;
          setScreen('join');
        }
      } catch (_) {
        // Сервер недоступний — продовжуємо опитування (спрацює при reconnect)
      }
    };

    poll(); // Перевіряємо одразу
    const interval = setInterval(poll, ROOM_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [screen]);

  // ─────────────────────────────────────────────
  // ОБРОБНИК ПОДІЙ ВІД СЕРВЕРА
  // ─────────────────────────────────────────────

  /**
   * Обробляє всі типи оновлень від сервера
   * Викликається при кожній події 'quiz-update'
   *
   * @param {Object} data - Дані події з полем 'type'
   */
  const handleServerUpdate = useCallback((data) => {
    switch (data.type) {

      // ── Квіз починається (3-секундний відлік) ──
      case 'QUIZ_STARTING':
        setScreen('starting');
        startCountdown(data.countdown || 3);
        break;

      // ── Нове питання ──
      case 'NEW_QUESTION':
        clearInterval(timerRef.current);
        if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
        setSelectedAnswer(null);
        setHasAnswered(false);
        setMyAnswer(null);
        setAnsweredCount(0);

        setQuestion(data.question);
        questionRef.current = data.question;
        setQuestionIndex(data.questionIndex);
        setTotalQuestions(data.totalQuestions);
        setTimeLimit(data.timeLimit);
        setTimeLeft(data.timeLimit);

        setScreen('question');
        startQuestionTimer(data.timeLimit);

        if (data.question.audio && audioRef.current) {
          audioRef.current.src = data.question.audio;
          audioRef.current.play().catch(() => {});
        }
        break;

      // ── Оновлення лічильника відповідей ──
      case 'ANSWER_COUNT':
        setAnsweredCount(data.answered);
        setTotalPlayers(data.total);
        break;

      // ── Розкриття правильної відповіді ──
      case 'REVEAL_ANSWER':
        clearInterval(timerRef.current);
        if (audioRef.current) { audioRef.current.pause(); }
        handleRevealAnswer(data);
        break;

      // ── Показ leaderboard ──
      case 'SHOW_LEADERBOARD':
        setLeaderboard(data.leaderboard || []);
        setIsLastQuestion(data.isLastQuestion || false);
        setScreen('leaderboard');
        break;

      // ── Квіз завершено ──
      case 'QUIZ_ENDED':
        setLeaderboard(data.finalLeaderboard || []);
        playFinish();
        setScreen('ended');
        break;

      // ── Вибір категорії ──
      case 'CATEGORY_SELECT':
        clearInterval(categoryTimerRef.current);
        setCategoryOptions(data.options);
        setCategoryChooser(data.chooserNickname);
        setCategoryTimeLimit(data.timeLimit || 15);
        setCategoryTimeLeft(data.timeLimit || 15);
        setCategoryChosen(null);
        setScreen('category_select');
        {
          let remaining = data.timeLimit || 15;
          categoryTimerRef.current = setInterval(() => {
            remaining -= 1;
            setCategoryTimeLeft(remaining);
            if (remaining <= 0) clearInterval(categoryTimerRef.current);
          }, 1000);
        }
        break;

      // ── Категорію обрано ──
      case 'CATEGORY_CHOSEN':
        clearInterval(categoryTimerRef.current);
        setCategoryChosen({ category: data.category, wasTimeout: data.wasTimeout });
        setScreen('category_chosen');
        break;

      default:
        break;
    }
  }, [myNickname, selectedAnswer]); // eslint-disable-line

  // Тримаємо ref синхронізованим із найсвіжішою версією handleServerUpdate
  useEffect(() => {
    handleServerUpdateRef.current = handleServerUpdate;
  });

  // ─────────────────────────────────────────────
  // ТАЙМЕРИ
  // ─────────────────────────────────────────────

  /**
   * Запускає таймер зворотного відліку для питання
   *
   * @param {number} seconds - Кількість секунд
   */
  const startQuestionTimer = useCallback((seconds) => {
    clearInterval(timerRef.current);
    let remaining = seconds;

    timerRef.current = setInterval(() => {
      remaining -= 1;
      setTimeLeft(remaining);

      if (remaining > 0 && remaining <= 5) {
        playTick();
      }

      if (remaining <= 0) {
        clearInterval(timerRef.current);
      }
    }, 1000);
  }, []);

  /**
   * Запускає відлік перед початком квізу (3, 2, 1...)
   *
   * @param {number} from - З якого числа рахувати
   */
  const startCountdown = useCallback((from) => {
    clearInterval(countdownRef.current);
    setCountdown(from);
    playCountdown();

    let count = from;
    countdownRef.current = setInterval(() => {
      count -= 1;
      setCountdown(count);
      if (count > 0) playCountdown();
      if (count <= 0) clearInterval(countdownRef.current);
    }, 1000);
  }, []);

  // ─────────────────────────────────────────────
  // RESET — повернення до очікування ведучого
  // Викликається після закінчення гри або при втраті з'єднання з грою
  // ─────────────────────────────────────────────

  const resetToWaiting = useCallback(() => {
    clearInterval(timerRef.current);
    clearInterval(countdownRef.current);
    clearInterval(categoryTimerRef.current);

    setMyScore(0);
    setMyNickname('');
    setQuestion(null);
    questionRef.current = null;
    setHasAnswered(false);
    setMyAnswer(null);
    setSelectedAnswer(null);
    setRevealData(null);
    setLeaderboard([]);
    setWaitingPlayers([]);
    setCategoryOptions(null);
    setCategoryChooser('');
    setCategoryChosen(null);
    setNickname('');
    setJoinError('');
    kioskRoomCodeRef.current = null;

    setScreen('waiting_for_host');
  }, []);

  // ─────────────────────────────────────────────
  // ОБРОБНИКИ ДІЙ КОРИСТУВАЧА
  // ─────────────────────────────────────────────

  /**
   * Обробляє приєднання гравця до кімнати (kiosk mode)
   * Надсилає тільки нікнейм — сервер знає поточну активну кімнату
   */
  const handleJoin = useCallback(() => {
    const trimmedNick = nickname.trim();

    if (trimmedNick.length < 2 || trimmedNick.length > 20) {
      setJoinError('Нікнейм має бути від 2 до 20 символів');
      return;
    }

    setIsJoining(true);
    setJoinError('');

    // Kiosk mode: надсилаємо нікнейм та (опційно) код кімнати
    // Сервер використовує currentActiveRoom якщо roomCode не вказано
    socketRef.current.emit('join-quiz', {
      nickname: trimmedNick,
      ...(kioskRoomCodeRef.current && { roomCode: kioskRoomCodeRef.current })
    }, (response) => {
      setIsJoining(false);

      if (response.success) {
        setMyNickname(trimmedNick);
        setWaitingPlayers(response.gameState?.players || []);
        setTotalPlayers(response.gameState?.players?.length || 0);
        setScreen('waiting');
      } else if (response.noActiveRoom || (response.error && response.error.includes('не знайден'))) {
        // Кімната зникла поки гравець набирав нікнейм — повертаємось на очікування
        kioskRoomCodeRef.current = null;
        setScreen('waiting_for_host');
      } else {
        setJoinError(response.error || 'Не вдалось приєднатись');
      }
    });
  }, [nickname]);

  /**
   * Обробляє натискання кнопки відповіді
   *
   * @param {number} answerId - Індекс обраної відповіді (0-3)
   */
  const handleAnswerClick = useCallback((answerId) => {
    if (selectedAnswer !== null || hasAnswered) return;

    setSelectedAnswer(answerId);
    setHasAnswered(true);
    setMyAnswer(answerId);

    socketRef.current.emit('submit-answer', { answerId }, (response) => {
      if (!response.success) {
        setSelectedAnswer(null);
        setHasAnswered(false);
        setMyAnswer(null);
        setScreen('question');
      }
    });
  }, [selectedAnswer, hasAnswered]);

  /**
   * Обробляє отримання результату відповіді
   *
   * @param {Object} data - Дані REVEAL_ANSWER від сервера
   */
  const handleRevealAnswer = useCallback((data) => {
    const myResult = data.playerResults?.find(r => r.nickname === myNickname);

    const isCorrect = myResult?.isCorrect || false;
    const didNotAnswer = myResult?.didNotAnswer || false;
    const pointsEarned = myResult?.pointsEarned || 0;

    if (didNotAnswer) {
      playTimeout();
    } else if (isCorrect) {
      playCorrect();
    } else {
      playWrong();
    }

    setMyScore(prev => prev + pointsEarned);

    const currentQuestion = questionRef.current;
    setRevealData({
      correctAnswer: data.correctAnswer,
      correctAnswerText: currentQuestion?.answers?.[data.correctAnswer]?.text || '',
      isCorrect,
      didNotAnswer,
      pointsEarned,
      playerResults: data.playerResults || []
    });

    setScreen('reveal');
  }, [myNickname]);

  /**
   * Обробляє натискання кнопки категорії (тільки для chooser)
   *
   * @param {number} choiceIndex - 0 або 1
   */
  const handleCategoryClick = useCallback((choiceIndex) => {
    socketRef.current.emit('submit-category', { choiceIndex }, (_response) => {
      // Сервер авто-обирає категорію по таймауту — мовчки ігноруємо помилку
    });
  }, []);

  /**
   * Kiosk: після завершення гри повертаємось на очікування ведучого
   * Наступна гра буде виявлена автоматично через polling
   */
  const handlePlayAgain = useCallback(() => {
    resetToWaiting();
  }, [resetToWaiting]);

  // ─────────────────────────────────────────────
  // ОБЧИСЛЕНІ ЗНАЧЕННЯ
  // ─────────────────────────────────────────────

const myLeaderboardPosition = leaderboard.findIndex(p => p.nickname === myNickname) + 1;

  // ─────────────────────────────────────────────
  // РЕНДЕР ЕКРАНІВ
  // ─────────────────────────────────────────────

  return (
    <div className="player-view">
      {/* Hidden audio element for music questions */}
      <audio ref={audioRef} loop />

      {/* ── 0. WAITING FOR HOST (kiosk) ── */}
      {screen === 'waiting_for_host' && (
        <div className="screen-card waiting-screen">
          <div className="logo">🎮</div>
          <h2 className="screen-title">
            {isReconnecting ? '🔄 Підключення...' : 'Очікуємо ведучого...'}
          </h2>
          <p className="screen-subtitle">Гра розпочнеться автоматично</p>
          <div className="pulse-dots">
            <span /><span /><span />
          </div>
          {isReconnecting && (
            <p className="reconnecting-indicator">Відновлюємо з'єднання...</p>
          )}
        </div>
      )}

      {/* ── 1. JOIN ЕКРАН (тільки нікнейм, без коду кімнати) ── */}
      {screen === 'join' && (
        <div className="screen-card join-screen">
          <div className="logo">🎮</div>
          <h1 className="screen-title">Quiz Room</h1>
          <p className="screen-subtitle">Введи своє ім'я</p>

          {joinError && <div className="error-msg">{joinError}</div>}

          <div className="label">Твій нікнейм</div>
          <input
            className="input-field"
            type="text"
            placeholder="Введи нікнейм..."
            maxLength={20}
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />

          <button
            className="btn-primary"
            onClick={handleJoin}
            disabled={isJoining}
          >
            {isJoining ? 'Підключення...' : '🚀 Приєднатись'}
          </button>
        </div>
      )}

      {/* ── 2. WAITING ЕКРАН ── */}
      {screen === 'waiting' && (
        <div className="screen-card waiting-screen">
          <div className="logo">⏳</div>
          <h2 className="screen-title">Очікуємо початку</h2>
          <p className="screen-subtitle">Ти в кімнаті! Гра почнеться автоматично</p>

          <div className="pulse-dots">
            <span /><span /><span />
          </div>

          {waitingPlayers.length > 0 && (
            <div className="player-list">
              <p className="player-list-title">Гравці ({waitingPlayers.length})</p>
              {waitingPlayers.map((p, i) => (
                <span
                  key={i}
                  className="player-chip"
                  style={p.nickname === myNickname ? { borderColor: 'var(--color-primary-light)', color: 'var(--color-primary-light)' } : {}}
                >
                  {p.nickname === myNickname ? '👤 ' : ''}{p.nickname}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 3. STARTING (відлік перед квізом) ── */}
      {screen === 'starting' && (
        <div className="screen-card waiting-screen">
          <p className="screen-subtitle" style={{ marginBottom: 8 }}>Гра починається!</p>
          <div className="countdown-display">{countdown > 0 ? countdown : '🎯'}</div>
          <p className="screen-subtitle">Готуйся відповідати!</p>
        </div>
      )}

      {/* ── 3b. CATEGORY_SELECT ЕКРАН ── */}
      {screen === 'category_select' && categoryOptions && (
        <div className="screen-card category-select-screen">
          <div className="category-timer-bar-wrapper">
            <div
              className="category-timer-bar"
              style={{ width: `${Math.max(0, (categoryTimeLeft / categoryTimeLimit) * 100)}%` }}
            />
          </div>

          <div style={{ padding: '20px 20px 0' }}>
            <div className="category-timer-text">{categoryTimeLeft}s</div>

            {/* Банер: для chooser — заклик, для інших — хто обирає */}
            <h2 className="screen-title" style={{ marginBottom: 8 }}>
              {myNickname === categoryChooser
                ? 'Твоя черга обрати категорію!'
                : `${categoryChooser} обирає категорію`}
            </h2>
            {/* Кнопки видимі всім, але активні тільки для chooser */}
            <div className="category-buttons">
              {categoryOptions.map((opt) => (
                <button
                  key={opt.index}
                  className={`category-btn${myNickname !== categoryChooser ? ' disabled' : ''}`}
                  disabled={myNickname !== categoryChooser}
                  onClick={() => myNickname === categoryChooser && handleCategoryClick(opt.index)}
                >
                  {opt.category}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 3c. CATEGORY_CHOSEN ЕКРАН ── */}
      {screen === 'category_chosen' && categoryChosen && (
        <div className="screen-card" style={{ textAlign: 'center', padding: '32px 24px' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎯</div>
          <p className="screen-subtitle" style={{ marginBottom: 8 }}>Обрана категорія</p>
          <div className="category-chosen-name">{categoryChosen.category}</div>
          {categoryChosen.wasTimeout && (
            <p className="screen-subtitle" style={{ marginTop: 8, fontSize: '0.85rem' }}>(авто-вибір)</p>
          )}
        </div>
      )}

      {/* ── 4. QUESTION ЕКРАН ── */}
      {screen === 'question' && question && (
        <div className="screen-card question-screen" style={{ padding: 0 }}>
          <Timebar timeLimit={timeLimit} timeRemaining={timeLeft} />
          <div className="question-header">
            <span className="question-number">
              Питання {questionIndex}/{totalQuestions}
            </span>
          </div>

          {question.image && (
            <div className="question-image-wrap">
              <img
                src={question.image.startsWith('http') || question.image.startsWith('/') ? question.image : `/api/media/${question.image}`}
                alt="Question"
                className="question-image"
                onError={e => { e.target.style.display = 'none'; }}
              />
            </div>
          )}

          {question.audio && (
            <div className="question-audio-bar">
              <span className="audio-icon">🎵</span>
              <span className="audio-label">Музичне питання</span>
              <button
                className="audio-replay-btn"
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.currentTime = 0;
                    audioRef.current.play().catch(() => {});
                  }
                }}
              >▶ Повтор</button>
            </div>
          )}

          <div className="question-text">{question.text}</div>

          {totalPlayers > 0 && (
            <div className="answer-count-bar">
              <span className="answer-count-text">
                {answeredCount}/{totalPlayers} відповіли
              </span>
              <div className="answer-count-progress">
                <div
                  className="answer-count-fill"
                  style={{ width: `${totalPlayers > 0 ? (answeredCount / totalPlayers) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {hasAnswered ? (
            <div className="waiting-others">
              <div className="waiting-spinner" />
              Очікуємо інших гравців...
            </div>
          ) : (
            <div className="answers-grid">
              {question.answers.map((ans) => (
                <button
                  key={ans.id}
                  className={`answer-button answer-${ans.id}`}
                  onClick={() => handleAnswerClick(ans.id)}
                >
                  <span className="answer-letter">{ANSWER_LETTERS[ans.id]}</span>
                  <span>{ans.text}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 5. REVEAL ЕКРАН ── */}
      {screen === 'reveal' && revealData && (
        <div className="screen-card reveal-screen">
          <div className="result-icon">
            {revealData.didNotAnswer ? '⏱️' : revealData.isCorrect ? '✅' : '❌'}
          </div>

          <div className={`result-text ${revealData.didNotAnswer ? 'no-answer' : revealData.isCorrect ? 'correct' : 'wrong'}`}>
            {revealData.didNotAnswer
              ? 'Час вийшов!'
              : revealData.isCorrect
                ? 'Правильно!'
                : 'Неправильно!'}
          </div>

          {question?.answers && (
            <div className="reveal-grid">
              {question.answers.map(ans => (
                <div
                  key={ans.id}
                  className={`reveal-btn answer-${ans.id}${ans.id === revealData.correctAnswer ? ' correct' : ' wrong'}${ans.id === myAnswer ? ' my-pick' : ''}`}
                >
                  {ans.text}
                  {ans.id === revealData.correctAnswer && <span className="tick">✓</span>}
                </div>
              ))}
            </div>
          )}

          <div className="my-result">
            {revealData.didNotAnswer
              ? <span className="timeout-msg">Час вийшов — 0 балів</span>
              : revealData.isCorrect
                ? <span className="correct-msg">+{revealData.pointsEarned} балів!</span>
                : <span className="wrong-msg">Неправильно — 0 балів</span>
            }
          </div>

          <div className="correct-answer-box">
            <div className="correct-answer-label">✓ Правильна відповідь</div>
            <div className="correct-answer-text">
              {ANSWER_LETTERS[revealData.correctAnswer]}: {revealData.correctAnswerText}
            </div>
          </div>

          <div className="total-score">
            <span className="total-score-label">Твій рахунок</span>
            <span className="total-score-value">{myScore}</span>
          </div>
        </div>
      )}

      {/* ── 7. LEADERBOARD ЕКРАН ── */}
      {screen === 'leaderboard' && (
        <div className="screen-card leaderboard-screen">
          <h2 className="screen-title">
            {isLastQuestion ? '🏁 Фінальний рейтинг' : '📊 Рейтинг'}
          </h2>

          {myLeaderboardPosition > 0 && (
            <p className="screen-subtitle">
              Твоя позиція: <strong style={{ color: 'var(--color-primary-light)' }}>#{myLeaderboardPosition}</strong>
            </p>
          )}

          <div className="leaderboard-list">
            {leaderboard.slice(0, 8).map((player, index) => (
              <div
                key={player.playerId || index}
                className={`leaderboard-item ${player.nickname === myNickname ? 'is-me mine' : ''}`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <span className={`leaderboard-position ${
                  player.position === 1 ? 'pos-1' :
                  player.position === 2 ? 'pos-2' :
                  player.position === 3 ? 'pos-3' : 'pos-other'
                }`}>
                  {player.position === 1 ? '🥇' :
                   player.position === 2 ? '🥈' :
                   player.position === 3 ? '🥉' :
                   `#${player.position}`}
                </span>

                <span className="leaderboard-name">
                  {player.nickname}
                  {player.nickname === myNickname && <span className="me-badge">← ти</span>}
                </span>

                <span className="leaderboard-score">{player.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 8. ENDED ЕКРАН ── */}
      {screen === 'ended' && (
        <div className="screen-card ended-screen">
          <div className="trophy-icon">
            {myLeaderboardPosition === 1 ? '🏆' :
             myLeaderboardPosition === 2 ? '🥈' :
             myLeaderboardPosition === 3 ? '🥉' : '🎮'}
          </div>

          <h2 className="screen-title">Квіз завершено!</h2>

          <div className="final-position">Твоє місце</div>
          <div className="final-position-number">
            #{myLeaderboardPosition || '—'}
          </div>

          <div className="final-stats">
            <div className="stat-box">
              <div className="stat-label">Рахунок</div>
              <div className="stat-value">{myScore}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Питань</div>
              <div className="stat-value">{totalQuestions}</div>
            </div>
          </div>

          {leaderboard.length > 0 && (
            <div className="leaderboard-list" style={{ marginBottom: 20 }}>
              {leaderboard.slice(0, 3).map((player, index) => (
                <div
                  key={player.playerId || index}
                  className={`leaderboard-item ${player.nickname === myNickname ? 'is-me mine' : ''}`}
                >
                  <span className="leaderboard-position pos-1">
                    {player.position === 1 ? '🥇' : player.position === 2 ? '🥈' : '🥉'}
                  </span>
                  <span className="leaderboard-name">{player.nickname}</span>
                  <span className="leaderboard-score">{player.score}</span>
                </div>
              ))}
            </div>
          )}

          {/* Kiosk: кнопка повертає на очікування ведучого (не на форму входу) */}
          <button className="btn-primary" onClick={handlePlayAgain}>
            🔄 Очікувати наступну гру
          </button>
        </div>
      )}

    </div>
  );
}
