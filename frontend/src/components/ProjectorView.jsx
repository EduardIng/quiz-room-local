/**
 * ProjectorView.jsx - Великий екран для залу (Projector / TV View)
 *
 * Призначений для відображення на телевізорі або проекторі під час квіз-вечора.
 * Показує поточний стан гри в реальному часі:
 * - Код кімнати + QR для підключення гравців
 * - Список гравців що приєдналися
 * - Поточне питання з великими кнопками відповідей
 * - Таймер питання
 * - Лічильник відповідей (скільки гравців відповіли)
 * - Правильну відповідь після завершення питання
 * - Leaderboard між питаннями
 * - Фінальний результат
 *
 * Підключення: автоматично через /api/current-room (кіоск-режим).
 * Override: #/screen?room=XXXXXX — підключається одразу до вказаної кімнати.
 *
 * Socket.IO: підключається як спостерігач через подію 'watch-room'.
 * Не є гравцем — не впливає на ігровий процес.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import './ProjectorView.css';

// URL бекенду
const SERVER_URL = import.meta.env.DEV ? 'http://localhost:8080' : window.location.origin;

// Літери відповідей A-D
const ANSWER_LETTERS = ['A', 'B', 'C', 'D'];

// Кольори кнопок відповідей
const ANSWER_COLORS = ['#e74c3c', '#3498db', '#f39c12', '#27ae60'];

export default function ProjectorView() {
  // ── Стан підключення ──
  // Фаза: 'waiting_for_room' | 'connecting' | 'watching'
  const [phase, setPhase] = useState(() => {
    // Якщо є ?room= в URL — підключаємось одразу (ручний override)
    const code = new URLSearchParams(window.location.search).get('room');
    return code ? 'connecting' : 'waiting_for_room';
  });

  // Код кімнати (з URL або з форми вводу)
  const [roomCode, setRoomCode] = useState(() => {
    return new URLSearchParams(window.location.search).get('room')?.toUpperCase() || '';
  });

  // ── Ігровий стан (оновлюється через quiz-update) ──
  const [gameState, setGameState] = useState('WAITING');
  const [isPaused, setIsPaused] = useState(false);
  const [quizTitle, setQuizTitle] = useState('');
  const [players, setPlayers] = useState([]);

  // ── Питання ──
  const [question, setQuestion] = useState(null);    // { text, answers, image? }
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [timeLimit, setTimeLimit] = useState(30);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);

  // ── Відлік перед стартом ──
  const [countdown, setCountdown] = useState(3);

  // ── Reveal ──
  const [correctAnswer, setCorrectAnswer] = useState(null);
  const [revealStats, setRevealStats] = useState(null);

  // ── Leaderboard ──
  const [leaderboard, setLeaderboard] = useState([]);
  const [isLastQuestion, setIsLastQuestion] = useState(false);

  // ── Category mode ──
  const [categoryOptions, setCategoryOptions] = useState(null);
  const [categoryChooser, setCategoryChooser] = useState('');
  const [categoryTimeLeft, setCategoryTimeLeft] = useState(15);
  const [categoryTimeLimit, setCategoryTimeLimit] = useState(15);
  const [categoryChosen, setCategoryChosen] = useState(null);

  // ── Refs ──
  const socketRef = useRef(null);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const categoryTimerRef = useRef(null);
  const pollRef = useRef(null);   // інтервал опитування /api/current-room

  // ─────────────────────────────────────────────
  // ПІДКЛЮЧЕННЯ ДО КІМНАТИ
  // ─────────────────────────────────────────────

  const connectToRoom = useCallback((code) => {
    // Валідуємо код — захищає від кривих ?room= параметрів у URL
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode.length !== 6) {
      // Мовчки ігноруємо невалідний код (форми вводу більше немає)
      return;
    }

    setPhase('connecting');
    setRoomCode(cleanCode);

    const socket = io(SERVER_URL, { reconnectionAttempts: 5 });
    socketRef.current = socket;

    socket.on('connect', () => {
      // Підписуємось як спостерігач
      socket.emit('watch-room', { roomCode: cleanCode }, (response) => {
        if (!response.success) {
          // Кімната не знайдена — повертаємось в очікування
          setPhase('waiting_for_room');
          socket.disconnect();
          return;
        }

        // Синхронізуємо початковий стан
        syncState(response.gameState);
        setPhase('watching');
      });
    });

    socket.on('connect_error', () => {
      // Помилка підключення — повертаємось в очікування
      setPhase('waiting_for_room');
    });

    // Слухаємо всі ігрові оновлення
    socket.on('quiz-update', handleUpdate);

    return () => socket.disconnect();
  }, []); // eslint-disable-line

  // Авто-підключення: ?room= override або опитування /api/current-room
  useEffect(() => {
    const urlCode = new URLSearchParams(window.location.search).get('room');

    if (urlCode) {
      // Є ?room= → підключаємось одразу (ручний override)
      connectToRoom(urlCode);
    } else {
      // Немає коду → опитуємо /api/current-room кожні 3 секунди
      setPhase('waiting_for_room');
      const tryConnect = () => {
        fetch(`${SERVER_URL}/api/current-room`)
          .then(r => r.json())
          .then(data => {
            if (data.roomCode) {
              clearInterval(pollRef.current);
              connectToRoom(data.roomCode);
            }
          })
          .catch(() => {}); // ігноруємо помилки мережі
      };
      tryConnect();
      pollRef.current = setInterval(tryConnect, 3000);
    }

    return () => {
      clearInterval(pollRef.current);
      clearInterval(timerRef.current);
      clearInterval(countdownRef.current);
      clearInterval(categoryTimerRef.current);
      socketRef.current?.disconnect();
    };
  }, []); // eslint-disable-line

  // ─────────────────────────────────────────────
  // СИНХРОНІЗАЦІЯ ПОЧАТКОВОГО СТАНУ
  // (коли Projector підключається до вже активної гри)
  // ─────────────────────────────────────────────

  function syncState(gs) {
    if (!gs) return;
    setGameState(gs.gameState);
    setIsPaused(gs.isPaused || false);
    setQuizTitle(gs.quizTitle || '');
    setPlayers(gs.players || []);
    setTotalPlayers(gs.playerCount || gs.players?.length || 0);
    setTotalQuestions(gs.totalQuestions || 0);

    if (gs.currentQuestion) {
      setQuestion(gs.currentQuestion);
      setQuestionIndex(gs.questionIndex || 1);
      setAnsweredCount(gs.answeredCount || 0);
    }

    if (gs.gameState === 'QUESTION') {
      const remaining = gs.timeRemaining || gs.timeLimit || 30;
      const limit = gs.timeLimit || 30;
      setTimeLeft(remaining);
      setTimeLimit(limit);
      if (!gs.isPaused) startTimer(remaining);
    }

    if (gs.gameState === 'ANSWER_REVEAL' && gs.correctAnswer !== undefined) {
      setCorrectAnswer(gs.correctAnswer);
    }

    if (gs.leaderboard) {
      setLeaderboard(gs.leaderboard);
    }
  }

  // ─────────────────────────────────────────────
  // ОБРОБНИК ПОДІЙ ВІД СЕРВЕРА
  // ─────────────────────────────────────────────

  function handleUpdate(data) {
    switch (data.type) {

      case 'PLAYER_JOINED':
      case 'PLAYER_LEFT':
        setPlayers(data.players || []);
        setTotalPlayers(data.totalPlayers || 0);
        break;

      case 'QUIZ_STARTING':
        setGameState('STARTING');
        setTotalQuestions(data.totalQuestions || 0);
        startCountdown(data.countdown || 3);
        break;

      case 'CATEGORY_SELECT':
        setGameState('CATEGORY_SELECT');
        setCategoryOptions(data.options);
        setCategoryChooser(data.chooserNickname);
        setCategoryTimeLimit(data.timeLimit || 15);
        setCategoryTimeLeft(data.timeLimit || 15);
        setCategoryChosen(null);
        clearInterval(categoryTimerRef.current);
        {
          let rem = data.timeLimit || 15;
          categoryTimerRef.current = setInterval(() => {
            rem -= 1;
            setCategoryTimeLeft(rem);
            if (rem <= 0) clearInterval(categoryTimerRef.current);
          }, 1000);
        }
        break;

      case 'CATEGORY_CHOSEN':
        clearInterval(categoryTimerRef.current);
        setGameState('CATEGORY_CHOSEN');
        setCategoryChosen({ category: data.category, wasTimeout: data.wasTimeout });
        break;

      case 'NEW_QUESTION':
        clearInterval(timerRef.current);
        setGameState('QUESTION');
        setIsPaused(false);
        setCorrectAnswer(null);
        setRevealStats(null);
        setQuestion(data.question);
        setQuestionIndex(data.questionIndex);
        setTotalQuestions(data.totalQuestions);
        setTimeLimit(data.timeLimit);
        setTimeLeft(data.timeLimit);
        setAnsweredCount(0);
        setTotalPlayers(data.total || totalPlayers);
        startTimer(data.timeLimit);
        break;

      case 'ANSWER_COUNT':
        setAnsweredCount(data.answered);
        setTotalPlayers(data.total);
        break;

      case 'GAME_PAUSED':
        setIsPaused(true);
        setTimeLeft(data.timeRemaining || timeLeft);
        clearInterval(timerRef.current);
        break;

      case 'GAME_RESUMED':
        setIsPaused(false);
        startTimer(data.timeRemaining);
        break;

      case 'REVEAL_ANSWER':
        clearInterval(timerRef.current);
        setGameState('ANSWER_REVEAL');
        setCorrectAnswer(data.correctAnswer);
        setRevealStats(data.statistics);
        break;

      case 'SHOW_LEADERBOARD':
        setGameState('LEADERBOARD');
        setLeaderboard(data.leaderboard || []);
        setIsLastQuestion(data.isLastQuestion || false);
        break;

      case 'QUIZ_ENDED':
        setGameState('ENDED');
        setLeaderboard(data.finalLeaderboard || []);
        break;

      default:
        break;
    }
  }

  // ─────────────────────────────────────────────
  // ТАЙМЕРИ
  // ─────────────────────────────────────────────

  function startTimer(seconds) {
    clearInterval(timerRef.current);
    let rem = seconds;
    setTimeLeft(rem);
    timerRef.current = setInterval(() => {
      rem -= 1;
      setTimeLeft(rem);
      if (rem <= 0) clearInterval(timerRef.current);
    }, 1000);
  }

  function startCountdown(from) {
    clearInterval(countdownRef.current);
    setCountdown(from);
    let count = from;
    countdownRef.current = setInterval(() => {
      count -= 1;
      setCountdown(count);
      if (count <= 0) clearInterval(countdownRef.current);
    }, 1000);
  }

  // ─────────────────────────────────────────────
  // РЕНДЕР
  // ─────────────────────────────────────────────

  const timerPercent = Math.max(0, (timeLeft / timeLimit) * 100);
  const timerDanger = timeLeft <= 5;
  const timerWarning = timeLeft <= 10 && !timerDanger;

  // ── WAITING FOR ROOM ──
  if (phase === 'waiting_for_room') {
    return (
      <div className="projector-root">
        <div className="projector-enter-screen">
          <div className="projector-logo">📺</div>
          <h1 className="projector-enter-title">Quiz Room — Великий Екран</h1>
          <p className="projector-enter-sub">Очікування активної гри...</p>
          <div className="projector-spinner" />
        </div>
      </div>
    );
  }

  // ── CONNECTING SCREEN ──
  if (phase === 'connecting') {
    return (
      <div className="projector-root">
        <div className="projector-center">
          <div className="projector-spinner" />
          <p className="projector-connecting-text">Підключення до кімнати {roomCode}...</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // WATCHING — головні екрани гри
  // ─────────────────────────────────────────────

  return (
    <div className="projector-root">

      {/* ── Верхня панель: назва квізу + код кімнати ── */}
      <header className="projector-header">
        <div className="projector-header-title">{quizTitle || 'Quiz Room'}</div>
        <div className="projector-header-code">
          <span className="projector-code-label">Код:</span>
          <span className="projector-code-value">{roomCode}</span>
        </div>
      </header>

      {/* ── ПАУЗА — оверлей ── */}
      {isPaused && (
        <div className="projector-pause-overlay">
          <div className="projector-pause-icon">⏸</div>
          <div className="projector-pause-text">ПАУЗА</div>
        </div>
      )}

      {/* ── WAITING: очікування гравців ── */}
      {gameState === 'WAITING' && (
        <div className="projector-waiting-screen">
          <div className="projector-waiting-left">
            <h2 className="projector-waiting-title">Приєднуйся!</h2>
            <p className="projector-waiting-sub">Скануй QR або відкрий у браузері</p>
            <div className="projector-join-url">
              {window.location.origin}/?room=<strong>{roomCode}</strong>
            </div>
            <div className="projector-player-count">
              <span className="projector-player-count-num">{players.length}</span>
              <span className="projector-player-count-label"> гравців приєдналось</span>
            </div>
            {players.length > 0 && (
              <div className="projector-player-chips">
                {players.map((p, i) => (
                  <span key={i} className="projector-player-chip">{p.nickname}</span>
                ))}
              </div>
            )}
          </div>
          <div className="projector-waiting-right">
            <img
              src={`/api/qr/${roomCode}`}
              alt="QR код"
              className="projector-qr"
            />
          </div>
        </div>
      )}

      {/* ── STARTING: відлік ── */}
      {gameState === 'STARTING' && (
        <div className="projector-center">
          <p className="projector-starting-sub">Гра починається!</p>
          <div className="projector-countdown">{countdown > 0 ? countdown : 'GO!'}</div>
        </div>
      )}

      {/* ── CATEGORY_SELECT ── */}
      {gameState === 'CATEGORY_SELECT' && categoryOptions && (
        <div className="projector-category-screen">
          <div className="projector-cat-timer-bar-wrap">
            <div
              className="projector-cat-timer-bar"
              style={{ width: `${Math.max(0, (categoryTimeLeft / categoryTimeLimit) * 100)}%` }}
            />
          </div>
          <div className="projector-cat-inner">
            <div className="projector-cat-header">
              <span className="projector-cat-chooser">Обирає: <strong>{categoryChooser}</strong></span>
              <span className="projector-cat-time">{categoryTimeLeft}с</span>
            </div>
            <div className="projector-cat-options">
              {categoryOptions.map((opt, i) => (
                <div key={i} className={`projector-cat-option projector-cat-opt-${i}`}>
                  {opt.category}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CATEGORY_CHOSEN ── */}
      {gameState === 'CATEGORY_CHOSEN' && categoryChosen && (
        <div className="projector-center">
          <p className="projector-starting-sub">Обрана категорія</p>
          <div className="projector-cat-chosen">{categoryChosen.category}</div>
          {categoryChosen.wasTimeout && (
            <p className="projector-cat-auto">(авто-вибір)</p>
          )}
        </div>
      )}

      {/* ── QUESTION ── */}
      {gameState === 'QUESTION' && question && (
        <div className="projector-question-screen">
          {/* Таймер + прогрес-бар */}
          <div className="projector-q-header">
            <span className="projector-q-num">
              Питання {questionIndex}/{totalQuestions}
            </span>
            <div className="projector-timer-bar-wrap">
              <div
                className={`projector-timer-bar ${timerDanger ? 'danger' : timerWarning ? 'warning' : ''}`}
                style={{ width: `${timerPercent}%` }}
              />
            </div>
            <span className={`projector-timer-num ${timerDanger ? 'danger' : timerWarning ? 'warning' : ''}`}>
              {timeLeft}
            </span>
          </div>

          {/* Зображення питання */}
          {question.image && (
            <div className="projector-q-image-wrap">
              <img src={question.image} alt="" className="projector-q-image"
                onError={e => { e.target.style.display = 'none'; }} />
            </div>
          )}

          {/* Текст питання */}
          <div className="projector-q-text">{question.text}</div>

          {/* Лічильник відповідей */}
          {totalPlayers > 0 && (
            <div className="projector-answer-count">
              <div
                className="projector-answer-count-bar"
                style={{ width: `${(answeredCount / totalPlayers) * 100}%` }}
              />
              <span className="projector-answer-count-text">
                {answeredCount}/{totalPlayers} відповіли
              </span>
            </div>
          )}

          {/* Кнопки відповідей (2×2 сітка, не клікабельні) */}
          <div className="projector-answers-grid">
            {question.answers.map((ans) => (
              <div
                key={ans.id}
                className="projector-answer-btn"
                style={{ background: ANSWER_COLORS[ans.id] }}
              >
                <span className="projector-answer-letter">{ANSWER_LETTERS[ans.id]}</span>
                <span className="projector-answer-text">{ans.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ANSWER_REVEAL ── */}
      {gameState === 'ANSWER_REVEAL' && question && (
        <div className="projector-question-screen">
          {/* Хедер: питання N/N */}
          <div className="projector-q-header">
            <span className="projector-q-num">
              Питання {questionIndex}/{totalQuestions}
            </span>
            <span className="projector-reveal-label">Відповідь!</span>
          </div>

          {/* Текст питання */}
          <div className="projector-q-text">{question.text}</div>

          {/* Кнопки з підсвіткою правильної відповіді */}
          <div className="projector-answers-grid">
            {question.answers.map((ans) => {
              const isCorrect = ans.id === correctAnswer;
              const stat = revealStats?.answers?.[ans.id];
              const count = stat?.count || 0;
              return (
                <div
                  key={ans.id}
                  className={`projector-answer-btn ${isCorrect ? 'correct' : 'wrong'}`}
                  style={{ background: isCorrect ? '#27ae60' : '#555' }}
                >
                  <span className="projector-answer-letter">{ANSWER_LETTERS[ans.id]}</span>
                  <span className="projector-answer-text">{ans.text}</span>
                  {isCorrect && <span className="projector-correct-icon">✓</span>}
                  {count > 0 && (
                    <span className="projector-answer-count-badge">{count}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── LEADERBOARD ── */}
      {(gameState === 'LEADERBOARD' || gameState === 'ENDED') && (
        <div className="projector-leaderboard-screen">
          <h2 className="projector-lb-title">
            {gameState === 'ENDED' ? '🏆 Фінальний результат' : '📊 Рейтинг'}
          </h2>
          <div className="projector-lb-list">
            {leaderboard.slice(0, 8).map((player, i) => (
              <div key={player.playerId || i} className={`projector-lb-item pos-${player.position}`}>
                <span className="projector-lb-pos">
                  {player.position === 1 ? '🥇' :
                   player.position === 2 ? '🥈' :
                   player.position === 3 ? '🥉' :
                   `#${player.position}`}
                </span>
                <span className="projector-lb-name">{player.nickname}</span>
                <span className="projector-lb-score">{player.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
