/**
 * PlayerView.jsx - Інтерфейс гравця для Quiz Room Auto
 *
 * Реалізує 7 екранів гри:
 * JOIN → WAITING → QUESTION → ANSWER_SENT → REVEAL → LEADERBOARD → ENDED
 *
 * Використовує Socket.IO для real-time комунікації з сервером.
 *
 * Socket події що слухаємо:
 * - quiz-update: { type: QUIZ_STARTING | NEW_QUESTION | ANSWER_COUNT |
 *                        REVEAL_ANSWER | SHOW_LEADERBOARD | QUIZ_ENDED }
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import './PlayerView.css';
import { playCorrect, playWrong, playTimeout, playTick, playCountdown, playFinish } from '../utils/sound.js';

// ─────────────────────────────────────────────
// КОНСТАНТИ
// ─────────────────────────────────────────────

// URL бекенду (у dev режимі - через Vite proxy, у prod - той самий origin)
const SERVER_URL = import.meta.env.DEV ? 'http://localhost:8080' : window.location.origin;

// Літери відповідей для відображення (A, B, C, D)
const ANSWER_LETTERS = ['A', 'B', 'C', 'D'];

// ─────────────────────────────────────────────
// ГОЛОВНИЙ КОМПОНЕНТ
// ─────────────────────────────────────────────

export default function PlayerView() {
  // ── Стан підключення ──
  // Поточний екран: 'join' | 'waiting' | 'starting' | 'question' | 'answer_sent' | 'reveal' | 'leaderboard' | 'ended'
  const [screen, setScreen] = useState('join');

  // ── Стан форми JOIN ──
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState(() => {
    // Pre-fill room code from URL query param ?room=XXXXXX
    return new URLSearchParams(window.location.search).get('room') || '';
  });
  const [joinError, setJoinError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  // ── Стан гравця ──
  const [myNickname, setMyNickname] = useState('');
  const [myScore, setMyScore] = useState(0);
  const [myPosition, setMyPosition] = useState(null);

  // ── Стан поточного питання ──
  const [question, setQuestion] = useState(null);        // { text, answers: [{id, text}] }
  const [questionIndex, setQuestionIndex] = useState(0); // 1-based
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [timeLimit, setTimeLimit] = useState(30);
  const [timeLeft, setTimeLeft] = useState(30);
  const [selectedAnswer, setSelectedAnswer] = useState(null);

  // ── Лічильник відповідей ──
  const [answeredCount, setAnsweredCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);

  // ── Стан відліку перед стартом ──
  const [countdown, setCountdown] = useState(3);

  // ── Стан результату (REVEAL екран) ──
  const [revealData, setRevealData] = useState(null); // { correctAnswer, isCorrect, pointsEarned }

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

  // ── Ref для Socket.IO (не викликає ре-рендер) ──
  const socketRef = useRef(null);

  // ── Ref для таймера зворотного відліку ──
  const timerRef = useRef(null);
  const countdownRef = useRef(null);

  // ── Ref для аудіо ──
  const audioRef = useRef(null);

  // ── Ref для handleServerUpdate — щоб socket listener завжди викликав актуальну версію ──
  const handleServerUpdateRef = useRef(null);

  // ── Ref для question — щоб handleRevealAnswer завжди мав актуальне питання ──
  const questionRef = useRef(null);

  // ─────────────────────────────────────────────
  // ІНІЦІАЛІЗАЦІЯ SOCKET.IO
  // ─────────────────────────────────────────────

  useEffect(() => {
    // Створюємо Socket.IO з'єднання при монтуванні компонента
    const socket = io(SERVER_URL, {
      // Не підключаємося автоматично - чекаємо на join
      autoConnect: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current = socket;

    // Слухаємо головну подію від сервера через ref — завжди актуальний обробник
    socket.on('quiz-update', (data) => handleServerUpdateRef.current?.(data));

    // Оновлення списку гравців під час очікування
    socket.on('quiz-update', (data) => {
      if (data.type === 'PLAYER_JOINED' || data.type === 'PLAYER_LEFT') {
        setWaitingPlayers(data.players || []);
        setTotalPlayers(data.totalPlayers || 0);
      }
    });

    // Розриваємо з'єднання при розмонтуванні компонента
    return () => {
      clearInterval(timerRef.current);
      clearInterval(countdownRef.current);
      clearInterval(categoryTimerRef.current);
      socket.disconnect();
    };
  }, []); // [] - виконується один раз при монтуванні

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
        // Очищаємо попередній стан
        clearInterval(timerRef.current);
        if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
        setSelectedAnswer(null);
        setAnsweredCount(0);

        // Встановлюємо дані питання
        setQuestion(data.question);
        questionRef.current = data.question;
        setQuestionIndex(data.questionIndex);
        setTotalQuestions(data.totalQuestions);
        setTimeLimit(data.timeLimit);
        setTimeLeft(data.timeLimit);

        // Переходимо на екран питання
        setScreen('question');

        // Запускаємо таймер зворотного відліку
        startQuestionTimer(data.timeLimit);

        // Авто-програємо аудіо якщо є
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
        // Client-side countdown
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
  // (щоб socket listener завжди викликав актуальний обробник)
  useEffect(() => {
    handleServerUpdateRef.current = handleServerUpdate;
  });

  // ─────────────────────────────────────────────
  // ТАЙМЕРИ
  // ─────────────────────────────────────────────

  /**
   * Запускає таймер зворотного відліку для питання
   * Оновлює timeLeft кожну секунду
   *
   * @param {number} seconds - Кількість секунд
   */
  const startQuestionTimer = useCallback((seconds) => {
    // Очищаємо попередній таймер
    clearInterval(timerRef.current);

    let remaining = seconds;

    timerRef.current = setInterval(() => {
      remaining -= 1;
      setTimeLeft(remaining);

      // Тікаємо звуком коли залишилось ≤ 5 секунд
      if (remaining > 0 && remaining <= 5) {
        playTick();
      }

      // Таймер закінчився - сервер сам завершить питання
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
    playCountdown(); // перший бiп одразу

    let count = from;
    countdownRef.current = setInterval(() => {
      count -= 1;
      setCountdown(count);
      if (count > 0) playCountdown();
      if (count <= 0) {
        clearInterval(countdownRef.current);
      }
    }, 1000);
  }, []);

  // ─────────────────────────────────────────────
  // ОБРОБНИКИ ДІЙ КОРИСТУВАЧА
  // ─────────────────────────────────────────────

  /**
   * Обробляє приєднання гравця до кімнати
   * Надсилає подію 'join-quiz' на сервер
   */
  const handleJoin = useCallback(() => {
    // Валідація форми на клієнті
    const trimmedNick = nickname.trim();
    const trimmedCode = roomCode.trim().toUpperCase();

    if (trimmedNick.length < 2 || trimmedNick.length > 20) {
      setJoinError('Нікнейм має бути від 2 до 20 символів');
      return;
    }

    if (trimmedCode.length !== 6) {
      setJoinError('Код кімнати має бути 6 символів');
      return;
    }

    setIsJoining(true);
    setJoinError('');

    // Надсилаємо запит на приєднання
    socketRef.current.emit('join-quiz', {
      roomCode: trimmedCode,
      nickname: trimmedNick
    }, (response) => {
      setIsJoining(false);

      if (response.success) {
        // Приєднання успішне
        setMyNickname(trimmedNick);
        setWaitingPlayers(response.gameState?.players || []);
        setTotalPlayers(response.gameState?.players?.length || 0);
        setScreen('waiting');
      } else {
        // Помилка - показуємо повідомлення
        setJoinError(response.error || 'Не вдалось приєднатись');
      }
    });
  }, [nickname, roomCode]);

  /**
   * Обробляє натискання кнопки відповіді
   * Надсилає подію 'submit-answer' на сервер
   *
   * @param {number} answerId - Індекс обраної відповіді (0-3)
   */
  const handleAnswerClick = useCallback((answerId) => {
    // Запобігаємо подвійному натисканню
    if (selectedAnswer !== null) return;

    setSelectedAnswer(answerId);
    setScreen('answer_sent');

    // Надсилаємо відповідь на сервер
    socketRef.current.emit('submit-answer', { answerId }, (response) => {
      if (!response.success) {
        // Якщо помилка - повертаємось на питання (рідкісний випадок)
        setSelectedAnswer(null);
        setScreen('question');
      }
    });
  }, [selectedAnswer]);

  /**
   * Обробляє отримання результату відповіді
   * Оновлює рахунок гравця та показує REVEAL екран
   *
   * @param {Object} data - Дані REVEAL_ANSWER від сервера
   */
  const handleRevealAnswer = useCallback((data) => {
    // Знаходимо результат поточного гравця
    const myResult = data.playerResults?.find(r => r.nickname === myNickname);

    const isCorrect = myResult?.isCorrect || false;
    const didNotAnswer = myResult?.didNotAnswer || false;
    const pointsEarned = myResult?.pointsEarned || 0;

    // Звуковий ефект результату
    if (didNotAnswer) {
      playTimeout();
    } else if (isCorrect) {
      playCorrect();
    } else {
      playWrong();
    }

    // Оновлюємо рахунок (додаємо зароблені бали)
    setMyScore(prev => prev + pointsEarned);

    // Зберігаємо дані для REVEAL екрану
    const currentQuestion = questionRef.current;
    setRevealData({
      correctAnswer: data.correctAnswer,
      correctAnswerText: currentQuestion?.answers?.[data.correctAnswer]?.text || '',
      isCorrect,
      didNotAnswer,
      pointsEarned
    });

    setScreen('reveal');
  }, [myNickname]);

  /**
   * Обробляє натискання кнопки категорії (тільки для chooser)
   *
   * @param {number} choiceIndex - 0 або 1
   */
  const handleCategoryClick = useCallback((choiceIndex) => {
    socketRef.current.emit('submit-category', { choiceIndex }, (response) => {
      if (!response.success) {
        console.warn('submit-category error:', response.error);
      }
    });
  }, []);

  /**
   * Обробляє натискання "Грати знову" на ENDED екрані
   * Скидає стан і повертає на JOIN екран
   */
  const handlePlayAgain = useCallback(() => {
    clearInterval(timerRef.current);
    clearInterval(countdownRef.current);
    clearInterval(categoryTimerRef.current);

    // Скидаємо весь стан гри
    setMyScore(0);
    setMyPosition(null);
    setQuestion(null);
    questionRef.current = null;
    setSelectedAnswer(null);
    setRevealData(null);
    setLeaderboard([]);
    setWaitingPlayers([]);
    setCategoryOptions(null);
    setCategoryChooser('');
    setCategoryChosen(null);
    setRoomCode('');
    setNickname('');
    setJoinError('');
    setScreen('join');
  }, []);

  // ─────────────────────────────────────────────
  // ОБЧИСЛЕНІ ЗНАЧЕННЯ
  // ─────────────────────────────────────────────

  // Відсоток таймера (для ширини progress bar)
  const timerPercent = Math.max(0, (timeLeft / timeLimit) * 100);

  // Клас небезпеки таймера
  const timerClass = timeLeft <= 5 ? 'danger' : timeLeft <= 10 ? 'warning' : '';

  // Позиція поточного гравця в leaderboard
  const myLeaderboardPosition = leaderboard.findIndex(p => p.nickname === myNickname) + 1;

  // ─────────────────────────────────────────────
  // РЕНДЕР ЕКРАНІВ
  // ─────────────────────────────────────────────

  return (
    <div className="player-view">
      {/* Hidden audio element for music questions */}
      <audio ref={audioRef} loop />

      {/* ── 1. JOIN ЕКРАН ── */}
      {screen === 'join' && (
        <div className="screen-card join-screen">
          <div className="logo">🎮</div>
          <h1 className="screen-title">Quiz Room</h1>
          <p className="screen-subtitle">Введи код кімнати та свій нікнейм</p>

          {joinError && <div className="error-msg">{joinError}</div>}

          <div className="label">Код кімнати</div>
          <input
            className="input-field room-code"
            type="text"
            placeholder="ABC123"
            maxLength={6}
            value={roomCode}
            onChange={e => setRoomCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />

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
          {/* Timer bar */}
          <div className="category-timer-bar-wrapper">
            <div
              className="category-timer-bar"
              style={{ width: `${Math.max(0, (categoryTimeLeft / categoryTimeLimit) * 100)}%` }}
            />
          </div>

          <div style={{ padding: '20px 20px 0' }}>
            <div className="category-timer-text">{categoryTimeLeft}s</div>

            {myNickname === categoryChooser ? (
              <>
                <h2 className="screen-title" style={{ marginBottom: 8 }}>Твій вибір!</h2>
                <p className="screen-subtitle" style={{ marginBottom: 20 }}>Обери категорію питання</p>
                <div className="category-buttons">
                  {categoryOptions.map((opt) => (
                    <button
                      key={opt.index}
                      className="category-btn"
                      onClick={() => handleCategoryClick(opt.index)}
                    >
                      {opt.category}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="category-wait-icon">🎲</div>
                <p className="category-wait-text">
                  Чекаємо поки <strong>{categoryChooser}</strong> обере категорію...
                </p>
              </>
            )}
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
          {/* Хедер: номер питання + таймер */}
          <div className="question-header">
            <span className="question-number">
              Питання {questionIndex}/{totalQuestions}
            </span>
            <span className={`timer-display ${timerClass}`}>
              {timeLeft}
            </span>
          </div>

          {/* Прогрес-бар таймера */}
          <div className="timer-bar-wrapper">
            <div
              className={`timer-bar ${timerClass}`}
              style={{ width: `${timerPercent}%` }}
            />
          </div>

          {/* Зображення питання (якщо є) */}
          {question.image && (
            <div className="question-image-wrap">
              <img
                src={question.image}
                alt="Question"
                className="question-image"
                onError={e => { e.target.style.display = 'none'; }}
              />
            </div>
          )}

          {/* Аудіо питання — кнопка повтору (якщо є) */}
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

          {/* Текст питання */}
          <div className="question-text">{question.text}</div>

          {/* Лічильник відповідей */}
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

          {/* Кнопки відповідей (2x2 grid) */}
          <div className="answers-grid">
            {question.answers.map((ans) => (
              <button
                key={ans.id}
                className="answer-button"
                onClick={() => handleAnswerClick(ans.id)}
              >
                <span className="answer-letter">{ANSWER_LETTERS[ans.id]}</span>
                <span>{ans.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 5. ANSWER_SENT ЕКРАН ── */}
      {screen === 'answer_sent' && (
        <div className="screen-card answer-sent-screen">
          <div className="answer-sent-icon">✅</div>
          <h2 className="screen-title">Відповідь надіслана!</h2>
          <p className="screen-subtitle">
            Ти обрав: <strong>{selectedAnswer !== null ? ANSWER_LETTERS[selectedAnswer] : '—'}</strong>
          </p>
          <p className="screen-subtitle">Чекаємо на інших гравців...</p>
          <div className="waiting-dots">
            <span /><span /><span />
          </div>

          {/* Лічильник хто вже відповів */}
          {totalPlayers > 0 && (
            <p style={{ marginTop: 16, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              {answeredCount} з {totalPlayers} відповіли
            </p>
          )}
        </div>
      )}

      {/* ── 6. REVEAL ЕКРАН ── */}
      {screen === 'reveal' && revealData && (
        <div className="screen-card reveal-screen">
          {/* Іконка результату */}
          <div className="result-icon">
            {revealData.didNotAnswer ? '⏱️' : revealData.isCorrect ? '✅' : '❌'}
          </div>

          {/* Текст результату */}
          <div className={`result-text ${revealData.didNotAnswer ? 'no-answer' : revealData.isCorrect ? 'correct' : 'wrong'}`}>
            {revealData.didNotAnswer
              ? 'Час вийшов!'
              : revealData.isCorrect
                ? 'Правильно!'
                : 'Неправильно!'}
          </div>

          {/* Зароблені бали */}
          {revealData.isCorrect && (
            <div className="points-earned">
              <div className="points-value">+{revealData.pointsEarned}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: 4 }}>балів</div>
            </div>
          )}

          {/* Правильна відповідь */}
          <div className="correct-answer-box">
            <div className="correct-answer-label">✓ Правильна відповідь</div>
            <div className="correct-answer-text">
              {ANSWER_LETTERS[revealData.correctAnswer]}: {revealData.correctAnswerText}
            </div>
          </div>

          {/* Загальний рахунок */}
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
                className={`leaderboard-item ${player.nickname === myNickname ? 'is-me' : ''}`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                {/* Позиція / медаль */}
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

                {/* Нікнейм */}
                <span className="leaderboard-name">
                  {player.nickname}
                  {player.nickname === myNickname && <span className="me-badge">← ти</span>}
                </span>

                {/* Рахунок */}
                <span className="leaderboard-score">{player.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 8. ENDED ЕКРАН ── */}
      {screen === 'ended' && (
        <div className="screen-card ended-screen">
          {/* Трофей */}
          <div className="trophy-icon">
            {myLeaderboardPosition === 1 ? '🏆' :
             myLeaderboardPosition === 2 ? '🥈' :
             myLeaderboardPosition === 3 ? '🥉' : '🎮'}
          </div>

          <h2 className="screen-title">Квіз завершено!</h2>

          {/* Фінальна позиція */}
          <div className="final-position">Твоє місце</div>
          <div className="final-position-number">
            #{myLeaderboardPosition || '—'}
          </div>

          {/* Статистика */}
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

          {/* Топ-3 фінального рейтингу */}
          {leaderboard.length > 0 && (
            <div className="leaderboard-list" style={{ marginBottom: 20 }}>
              {leaderboard.slice(0, 3).map((player, index) => (
                <div
                  key={player.playerId || index}
                  className={`leaderboard-item ${player.nickname === myNickname ? 'is-me' : ''}`}
                >
                  <span className="leaderboard-position pos-1" style={{}}>
                    {player.position === 1 ? '🥇' : player.position === 2 ? '🥈' : '🥉'}
                  </span>
                  <span className="leaderboard-name">{player.nickname}</span>
                  <span className="leaderboard-score">{player.score}</span>
                </div>
              ))}
            </div>
          )}

          {/* Кнопка "Грати знову" */}
          <button className="btn-primary" onClick={handlePlayAgain}>
            🔄 Грати знову
          </button>
        </div>
      )}

    </div>
  );
}
