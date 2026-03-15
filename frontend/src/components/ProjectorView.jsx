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
import Timebar from './Timebar.jsx';

// URL бекенду
const SERVER_URL = import.meta.env.DEV ? 'http://localhost:8080' : window.location.origin;

// Інтервал опитування активної кімнати (мілісекунди)
const ROOM_POLL_INTERVAL = 3000;

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
  const [sessionName, setSessionName] = useState(''); // назва сесії від ведучого (опційно)
  const [players, setPlayers] = useState([]);

  // ── Питання ──
  const [question, setQuestion] = useState(null);    // { text, answers, image? }
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [timeLimit, setTimeLimit] = useState(30);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  // Очікувана кількість гравців (з PLAYER_JOINED/PLAYER_LEFT)
  const [playerCount, setPlayerCount] = useState(0);

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
  const pollRef = useRef(null);           // інтервал опитування /api/current-room
  const quizEndedTimerRef = useRef(null); // таймер авто-скидання після QUIZ_ENDED

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

    const socket = io(SERVER_URL, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000
    });
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

    // При розриві з'єднання — повертаємось до очікування кімнати
    socket.on('disconnect', () => {
      setPhase('waiting_for_room');
      setGameState('WAITING');
      pollRef.current = setInterval(() => {
        fetch(`${SERVER_URL}/api/current-room`)
          .then(r => r.json())
          .then(data => {
            if (data.roomCode) {
              clearInterval(pollRef.current);
              connectToRoom(data.roomCode);
            }
          })
          .catch(() => {});
      }, ROOM_POLL_INTERVAL);
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
      pollRef.current = setInterval(tryConnect, ROOM_POLL_INTERVAL);
    }

    return () => {
      clearInterval(pollRef.current);
      clearInterval(timerRef.current);
      clearInterval(countdownRef.current);
      clearInterval(categoryTimerRef.current);
      clearTimeout(quizEndedTimerRef.current);
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
    setSessionName(gs.sessionName || '');
    setPlayers(gs.players || []);
    setTotalPlayers(gs.playerCount || gs.players?.length || 0);
    setPlayerCount(gs.targetPlayerCount || gs.playerCount || gs.players?.length || 0);
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
        if (data.targetPlayerCount) setPlayerCount(data.targetPlayerCount);
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
        // Functional updater уникає застарілого замикання на timeLeft
        setTimeLeft(prev => data.timeRemaining ?? prev);
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
        // Через 12 секунд автоматично повертаємось до очікування нової гри
        quizEndedTimerRef.current = setTimeout(() => {
          socketRef.current?.disconnect();
          setPhase('waiting_for_room');
          setGameState('WAITING');
          setLeaderboard([]);
          pollRef.current = setInterval(() => {
            fetch(`${SERVER_URL}/api/current-room`)
              .then(r => r.json())
              .then(d => {
                if (d.roomCode) {
                  clearInterval(pollRef.current);
                  connectToRoom(d.roomCode);
                }
              })
              .catch(() => {});
          }, ROOM_POLL_INTERVAL);
        }, 12000);
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

      {/* ── Верхня панель: назва квізу + назва сесії (якщо задана) ── */}
      <header className="projector-header">
        <div className="projector-header-title">{quizTitle || 'Quiz Room'}</div>
        {sessionName && (
          <div className="projector-header-session">{sessionName}</div>
        )}
      </header>

      {/* ── ПАУЗА — оверлей ── */}
      {isPaused && (
        <div className="projector-pause-overlay">
          <div className="projector-pause-icon">⏸</div>
          <div className="projector-pause-text">ПАУЗА</div>
        </div>
      )}

      {/* ── WAITING: очікування гравців (кіоск-режим, центральний стенд) ── */}
      {gameState === 'WAITING' && (
        <div className="proj-screen proj-waiting">
          <div className="proj-quiz-title">{quizTitle || 'Quiz Room'}</div>
          <div className="proj-join-count">
            {playerCount > 0
              ? `${players.length} / ${playerCount} гравців готові`
              : `${players.length} гравців приєдналось`}
          </div>
          <div className="proj-player-chips">
            {players.map(p => (
              <div key={p.nickname} className="proj-chip">{p.nickname}</div>
            ))}
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

      {/* ── CATEGORY_SELECT: вибір категорії гравцем ── */}
      {gameState === 'CATEGORY_SELECT' && categoryOptions && (
        <div className="proj-screen proj-category-select">
          <div className="proj-chooser">{categoryChooser} обирає категорію</div>
          <Timebar timeLimit={categoryTimeLimit} timeRemaining={categoryTimeLeft} />
          <div className="proj-category-options">
            {categoryOptions.map((opt, i) => (
              <div key={i} className="proj-category-card">{opt.category}</div>
            ))}
          </div>
        </div>
      )}

      {/* ── CATEGORY_CHOSEN: показуємо обрану категорію 4 секунди ── */}
      {gameState === 'CATEGORY_CHOSEN' && categoryChosen && (
        <div className="proj-screen proj-category-chosen">
          <div className="proj-chosen-label">Категорія</div>
          <div className="proj-chosen-name">{categoryChosen.category}</div>
        </div>
      )}

      {/* ── QUESTION: питання + відповіді + таймбар + лічильник ── */}
      {gameState === 'QUESTION' && question && (
        <div className="proj-screen proj-question">
          <div className="proj-q-header">
            <span>Питання {questionIndex}/{totalQuestions}</span>
            <span className="proj-answer-count">{answeredCount}/{totalPlayers || '?'} відповіли</span>
          </div>
          <Timebar timeLimit={timeLimit} timeRemaining={timeLeft} />
          {question.image && (
            <div className="proj-question-image-wrap">
              <img
                src={question.image.startsWith('http') || question.image.startsWith('/') ? question.image : `/api/media/${question.image}`}
                alt="Question"
                className="proj-question-image"
                onError={e => { e.target.style.display = 'none'; }}
              />
            </div>
          )}
          <div className="proj-question-text">{question.text}</div>
          <div className="proj-answer-grid">
            {question.answers.map(ans => (
              <div key={ans.id} className={`proj-answer-card answer-${ans.id}`}>
                <span className="proj-answer-letter">{['A', 'B', 'C', 'D'][ans.id]}</span>
                <span className="proj-answer-text">{ans.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ANSWER_REVEAL: підсвічуємо правильну відповідь ── */}
      {gameState === 'ANSWER_REVEAL' && question && (
        <div className="proj-screen proj-reveal">
          <div className="proj-reveal-label">Правильна відповідь</div>
          {question.image && (
            <div className="proj-question-image-wrap">
              <img
                src={question.image.startsWith('http') || question.image.startsWith('/') ? question.image : `/api/media/${question.image}`}
                alt="Question"
                className="proj-question-image"
                onError={e => { e.target.style.display = 'none'; }}
              />
            </div>
          )}
          <div className="proj-answer-grid reveal">
            {question.answers.map(ans => (
              <div
                key={ans.id}
                className={`proj-answer-card answer-${ans.id}${ans.id === correctAnswer ? ' proj-correct' : ' proj-wrong'}`}
              >
                <span className="proj-answer-letter">{['A', 'B', 'C', 'D'][ans.id]}</span>
                <span className="proj-answer-text">{ans.text}</span>
                {ans.id === correctAnswer && <span className="proj-tick">✓</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── LEADERBOARD / ENDED: подіум топ-3 + решта списку ── */}
      {(gameState === 'LEADERBOARD' || gameState === 'ENDED') && (
        <div className="proj-screen proj-leaderboard">
          <div className="proj-podium">
            {[1, 0, 2].map(idx => leaderboard[idx] && (
              <div key={leaderboard[idx].nickname} className={`proj-podium-slot pos-${idx + 1}`}>
                <div className="proj-podium-name">{leaderboard[idx].nickname}</div>
                <div className="proj-podium-score">{leaderboard[idx].score}</div>
                <div className="proj-podium-block">{['🥇', '🥈', '🥉'][idx]}</div>
              </div>
            ))}
          </div>
          <div className="proj-lb-rest">
            {leaderboard.slice(3).map((p, i) => (
              <div key={p.nickname} className="proj-lb-row">
                <span className="proj-lb-pos">#{p.position ?? i + 4}</span>
                <span className="proj-lb-name">{p.nickname}</span>
                <span className="proj-lb-score">{p.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
