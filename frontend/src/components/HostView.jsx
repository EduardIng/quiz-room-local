/**
 * HostView.jsx — Інтерфейс ведучого для kiosk-режиму
 *
 * Спрощений хост-екран: вибери квіз → натисни Старт.
 * Після запуску — керування грою (пауза / відновити / пропустити).
 *
 * Відповідальність:
 * - Завантаження бібліотеки квізів з /api/quizzes
 * - Відображення списку + вибір квізу
 * - Налаштування гри (час питання, мін. гравців)
 * - Запуск квізу через create-quiz (Socket.IO)
 * - Host controls: start / pause / resume / skip
 * - Відображення статусу гри в реальному часі
 *
 * @module HostView
 * @author EduardIng
 * @created 2026-03-10
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import useLang from '../utils/useLang.js';
import './HostView.css';

// URL бекенду — dev: localhost:8080, prod: поточний origin
const SERVER_URL = import.meta.env.DEV ? 'http://localhost:8080' : window.location.origin;

export default function HostView() {
  const [t, lang, setLang] = useLang();

  // ── Бібліотека квізів ──
  const [quizzes, setQuizzes]       = useState([]);    // список квізів з диску
  const [loadingLib, setLoadingLib] = useState(true);  // завантаження списку
  const [libError, setLibError]     = useState('');    // помилка завантаження

  // ── Вибраний квіз та налаштування ──
  const [selectedId, setSelectedId]     = useState(null); // id вибраного квізу
  const [questionTime, setQuestionTime] = useState(30);   // час на питання (сек)
  const [minPlayers, setMinPlayers]     = useState(1);    // мінімум гравців

  // ── Стан гри після запуску ──
  const [roomCode, setRoomCode] = useState(null);     // код кімнати після create-quiz
  const [isPaused, setIsPaused] = useState(false);    // пауза
  const [gameEnded, setGameEnded] = useState(false);  // гра завершена
  const [playerCount, setPlayerCount] = useState(0);  // кількість гравців онлайн
  const [gamePhase, setGamePhase] = useState('');     // поточна фаза (для статусу)
  const [isLaunching, setIsLaunching] = useState(false); // кнопка Старт заблокована
  const [launchError, setLaunchError]  = useState('');   // помилка запуску

  // Socket зберігаємо в ref щоб не тригерити ре-рендер
  const socketRef = useRef(null);

  // ─────────────────────────────────────────────
  // ЗАВАНТАЖЕННЯ БІБЛІОТЕКИ КВІЗІВ
  // ─────────────────────────────────────────────

  /**
   * Завантажує список квізів з /api/quizzes при монтуванні.
   * Авто-вибирає перший квіз якщо бібліотека не порожня.
   */
  useEffect(() => {
    setLoadingLib(true);
    fetch(`${SERVER_URL}/api/quizzes`)
      .then(r => r.json())
      .then(data => {
        const list = data.quizzes || [];
        setQuizzes(list);
        if (list.length > 0) setSelectedId(list[0].id);
        setLoadingLib(false);
      })
      .catch(() => {
        setLibError('Не вдалось завантажити бібліотеку квізів.');
        setLoadingLib(false);
      });
  }, []);

  // ─────────────────────────────────────────────
  // ЗАПУСК КВІЗУ
  // ─────────────────────────────────────────────

  /**
   * Знаходить вибраний квіз та надсилає create-quiz через Socket.IO.
   * Після успіху — зберігає roomCode, підписується на quiz-update.
   */
  const handleLaunch = useCallback(() => {
    const quiz = quizzes.find(q => q.id === selectedId);
    if (!quiz) return;

    setIsLaunching(true);
    setLaunchError('');

    const quizData = quiz; // повний об'єкт квізу (quiz-storage повертає плоску структуру)

    const settings = {
      questionTime,
      autoStart: false,   // kiosk: ведучий явно натискає Start
      minPlayers,
      waitForAllPlayers: true
    };

    // Підключаємося до сервера
    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('create-quiz', { quizData, settings }, (response) => {
        setIsLaunching(false);

        if (response.success) {
          setRoomCode(response.roomCode);
          setPlayerCount(0);
          setGamePhase('waiting');
        } else {
          setLaunchError(response.error || 'Помилка створення кімнати');
          socket.disconnect();
          socketRef.current = null;
        }
      });
    });

    socket.on('connect_error', () => {
      setIsLaunching(false);
      setLaunchError('Не вдалось підключитись до сервера. Переконайся що сервер запущений.');
      socket.disconnect();
      socketRef.current = null;
    });
  }, [quizzes, selectedId, questionTime, minPlayers]);

  // ─────────────────────────────────────────────
  // ОНОВЛЕННЯ СТАНУ ГРАВЦІВ (QUIZ-UPDATE)
  // ─────────────────────────────────────────────

  /**
   * Підписується на quiz-update після отримання roomCode.
   * Відстежує: кількість гравців, паузу, завершення гри, поточну фазу.
   */
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !roomCode) return;

    const handler = (data) => {
      switch (data.type) {
        case 'PLAYER_JOINED':
        case 'PLAYER_LEFT':
          setPlayerCount(data.totalPlayers ?? data.players?.length ?? 0);
          break;
        case 'QUIZ_STARTING':
          setGamePhase('starting');
          break;
        case 'CATEGORY_SELECT':
          setGamePhase('category_select');
          break;
        case 'NEW_QUESTION':
          setGamePhase(`question_${data.questionIndex + 1}_of_${data.totalQuestions}`);
          break;
        case 'REVEAL_ANSWER':
          setGamePhase('reveal');
          break;
        case 'SHOW_LEADERBOARD':
          setGamePhase('leaderboard');
          break;
        case 'GAME_PAUSED':
          setIsPaused(true);
          break;
        case 'GAME_RESUMED':
          setIsPaused(false);
          break;
        case 'QUIZ_ENDED':
          setGameEnded(true);
          setGamePhase('ended');
          break;
        default:
          break;
      }
    };

    socket.on('quiz-update', handler);
    return () => socket.off('quiz-update', handler);
  }, [roomCode]);

  // ─────────────────────────────────────────────
  // HOST CONTROLS
  // ─────────────────────────────────────────────

  /**
   * Надсилає команду керування грою: start / pause / resume / skip.
   */
  const sendHostControl = useCallback((action) => {
    socketRef.current?.emit('host-control', { roomCode, action }, () => {});
  }, [roomCode]);

  /**
   * Скидає стан для запуску нової гри.
   * Роз'єднує поточний сокет.
   */
  const handleReset = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setRoomCode(null);
    setIsPaused(false);
    setGameEnded(false);
    setPlayerCount(0);
    setGamePhase('');
    setLaunchError('');
  }, []);

  // ─────────────────────────────────────────────
  // ДОПОМІЖНІ ФУНКЦІЇ
  // ─────────────────────────────────────────────

  /**
   * Повертає текст поточної фази гри для відображення ведучому.
   */
  function phaseLabel(phase) {
    if (!phase || phase === 'waiting') return lang === 'uk' ? 'Очікування гравців' : 'Waiting for players';
    if (phase === 'starting')         return lang === 'uk' ? 'Починаємо...' : 'Starting...';
    if (phase === 'category_select')  return lang === 'uk' ? 'Вибір категорії' : 'Category select';
    if (phase === 'reveal')           return lang === 'uk' ? 'Розкриття відповіді' : 'Answer reveal';
    if (phase === 'leaderboard')      return lang === 'uk' ? 'Рейтинг' : 'Leaderboard';
    if (phase === 'ended')            return lang === 'uk' ? '✅ Гра завершена' : '✅ Game ended';
    if (phase.startsWith('question_')) {
      const [, qNum, , total] = phase.split('_');
      return lang === 'uk' ? `Питання ${qNum} з ${total}` : `Question ${qNum} of ${total}`;
    }
    return phase;
  }

  /**
   * Повертає кількість питань / раундів у квізі.
   */
  function quizSize(quiz) {
    // quiz-storage повертає плоску структуру: quiz.categoryMode, quiz.rounds, quiz.questions
    if (quiz.categoryMode) {
      const n = quiz.rounds?.length ?? 0;
      return lang === 'uk' ? `${n} раундів` : `${n} rounds`;
    }
    const n = quiz.questions?.length ?? 0;
    return lang === 'uk' ? `${n} питань` : `${n} questions`;
  }

  // ─────────────────────────────────────────────
  // РЕНДЕР: ПІСЛЯ ЗАПУСКУ ГРАВЦЯ (HOST CONTROLS)
  // ─────────────────────────────────────────────

  if (roomCode) {
    return (
      <div className="host-page">
        {/* Хедер */}
        <header className="host-header">
          <h1 className="host-title">🎮 Host Controls</h1>
          <button
            className="lang-toggle-host"
            onClick={() => setLang(lang === 'uk' ? 'en' : 'uk')}
          >
            {lang === 'uk' ? '🇬🇧 EN' : '🇺🇦 UK'}
          </button>
        </header>

        {/* Статус гри */}
        <div className="host-status-card">
          <div className="host-status-row">
            <span className="host-status-label">
              {lang === 'uk' ? 'Кімната' : 'Room'}
            </span>
            <span className="host-status-value host-room-code">{roomCode}</span>
          </div>
          <div className="host-status-row">
            <span className="host-status-label">
              {lang === 'uk' ? 'Гравців' : 'Players'}
            </span>
            <span className="host-status-value">{playerCount}</span>
          </div>
          <div className="host-status-row">
            <span className="host-status-label">
              {lang === 'uk' ? 'Статус' : 'Status'}
            </span>
            <span className="host-status-value host-phase-label">
              {isPaused
                ? (lang === 'uk' ? '⏸ Пауза' : '⏸ Paused')
                : phaseLabel(gamePhase)}
            </span>
          </div>
        </div>

        {/* Кнопки керування */}
        {!gameEnded && (
          <div className="host-controls-panel">
            {/* Старт — запускає гру з WAITING */}
            <button
              className="host-ctrl-btn host-ctrl-start"
              onClick={() => sendHostControl('start')}
            >
              ▶ {lang === 'uk' ? 'Старт' : 'Start'}
            </button>

            {/* Пауза / Відновити */}
            {isPaused ? (
              <button
                className="host-ctrl-btn host-ctrl-resume"
                onClick={() => sendHostControl('resume')}
              >
                ▶ {lang === 'uk' ? 'Відновити' : 'Resume'}
              </button>
            ) : (
              <button
                className="host-ctrl-btn host-ctrl-pause"
                onClick={() => sendHostControl('pause')}
              >
                ⏸ {lang === 'uk' ? 'Пауза' : 'Pause'}
              </button>
            )}

            {/* Пропустити */}
            <button
              className="host-ctrl-btn host-ctrl-skip"
              onClick={() => sendHostControl('skip')}
            >
              ⏭ {lang === 'uk' ? 'Пропустити' : 'Skip'}
            </button>
          </div>
        )}

        {/* Посилання Projector View */}
        <a
          href={`#/screen?room=${roomCode}`}
          className="host-projector-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          📺 {lang === 'uk' ? 'Projector View' : 'Projector View'}
          <span className="host-projector-hint">
            {' '}— {lang === 'uk' ? 'відкрий на великому екрані' : 'open on big screen'}
          </span>
        </a>

        {/* Кнопка нової гри */}
        <button className="host-new-game-btn" onClick={handleReset}>
          + {lang === 'uk' ? 'Нова гра' : 'New game'}
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // РЕНДЕР: ВИБІР КВІЗУ
  // ─────────────────────────────────────────────

  const selectedQuiz = quizzes.find(q => q.id === selectedId);

  return (
    <div className="host-page">
      {/* Хедер */}
      <header className="host-header">
        <h1 className="host-title">🎮 {lang === 'uk' ? 'Ведучий' : 'Host'}</h1>
        <div className="host-header-right">
          <a href="#/create" className="host-link-btn">
            ✏️ {lang === 'uk' ? 'Редактор квізів' : 'Quiz Editor'}
          </a>
          <button
            className="lang-toggle-host"
            onClick={() => setLang(lang === 'uk' ? 'en' : 'uk')}
          >
            {lang === 'uk' ? '🇬🇧 EN' : '🇺🇦 UK'}
          </button>
        </div>
      </header>

      <div className="host-body">
        {/* ── Список квізів ── */}
        <section className="host-library">
          <h2 className="host-section-title">
            {lang === 'uk' ? 'Бібліотека квізів' : 'Quiz Library'}
          </h2>

          {loadingLib && (
            <p className="host-loading">
              {lang === 'uk' ? 'Завантаження...' : 'Loading...'}
            </p>
          )}

          {libError && (
            <p className="host-error">{libError}</p>
          )}

          {!loadingLib && !libError && quizzes.length === 0 && (
            <p className="host-empty">
              {lang === 'uk'
                ? 'Бібліотека порожня. Додай квізи через редактор.'
                : 'Library is empty. Add quizzes via the editor.'}
            </p>
          )}

          {quizzes.map(quiz => (
            <div
              key={quiz.id}
              className={`host-quiz-item ${quiz.id === selectedId ? 'selected' : ''}`}
              onClick={() => setSelectedId(quiz.id)}
            >
              <div className="host-quiz-name">
                {quiz.title || quiz.id}
              </div>
              <div className="host-quiz-meta">
                {quizSize(quiz)}
                {quiz.categoryMode && (
                  <span className="host-badge-category">
                    {lang === 'uk' ? 'Категорії' : 'Categories'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </section>

        {/* ── Налаштування + Запуск ── */}
        <section className="host-launch-panel">
          <h2 className="host-section-title">
            {lang === 'uk' ? 'Налаштування' : 'Settings'}
          </h2>

          {selectedQuiz ? (
            <div className="host-selected-info">
              <span className="host-selected-label">
                {lang === 'uk' ? 'Вибрано:' : 'Selected:'}
              </span>
              <span className="host-selected-title">
                {selectedQuiz.title || selectedQuiz.id}
              </span>
            </div>
          ) : (
            <p className="host-no-selection">
              {lang === 'uk' ? 'Вибери квіз зліва' : 'Pick a quiz on the left'}
            </p>
          )}

          {/* Час на питання */}
          <label className="host-setting-label">
            {lang === 'uk' ? 'Час на питання (сек)' : 'Time per question (sec)'}
          </label>
          <input
            className="host-setting-input"
            type="number"
            min={10}
            max={120}
            value={questionTime}
            onChange={e => setQuestionTime(Number(e.target.value))}
          />

          {/* Мінімум гравців */}
          <label className="host-setting-label">
            {lang === 'uk' ? 'Мін. гравців' : 'Min. players'}
          </label>
          <input
            className="host-setting-input"
            type="number"
            min={1}
            max={50}
            value={minPlayers}
            onChange={e => setMinPlayers(Number(e.target.value))}
          />

          {/* Помилка запуску */}
          {launchError && (
            <p className="host-error">{launchError}</p>
          )}

          {/* Кнопка запуску */}
          <button
            className="host-launch-btn"
            disabled={!selectedQuiz || isLaunching}
            onClick={handleLaunch}
          >
            {isLaunching
              ? (lang === 'uk' ? '⏳ Створення...' : '⏳ Creating...')
              : `🚀 ${lang === 'uk' ? 'Запустити квіз' : 'Launch Quiz'}`}
          </button>

          <p className="host-launch-hint">
            {lang === 'uk'
              ? 'Після запуску планшети підключаться автоматично. Натисни Старт щоб почати гру.'
              : 'After launching, tablets connect automatically. Press Start to begin.'}
          </p>
        </section>
      </div>
    </div>
  );
}
