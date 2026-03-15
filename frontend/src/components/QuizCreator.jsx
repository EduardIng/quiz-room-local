/**
 * QuizCreator.jsx - Інтерфейс для створення квізу в браузері
 *
 * Дозволяє:
 * - Введення назви квізу
 * - Додавання/видалення питань
 * - Вибір правильної відповіді
 * - Перегляд питань
 * - Запуск гри → отримання коду кімнати
 * - Експорт квізу як JSON файл
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { io } from 'socket.io-client';
import useLang from '../utils/useLang.js';
import './QuizCreator.css';

// URL бекенду
const SERVER_URL = import.meta.env.DEV ? 'http://localhost:8080' : window.location.origin;

// Порожнє питання — шаблон для нового питання
const EMPTY_QUESTION = () => ({
  question: '',
  answers: ['', '', '', ''],
  correctAnswer: 0,
  timeLimit: '',  // порожнє = використовувати глобальний config.questionTime
  image: '',
  audio: ''
});

// Templates for category mode
const EMPTY_OPTION = () => ({ category: '', question: '', answers: ['', '', '', ''], correctAnswer: 0, timeLimit: '', image: '', audio: '' });
const EMPTY_ROUND  = () => ({ options: [EMPTY_OPTION(), EMPTY_OPTION()] });

/**
 * Повертає рядок помилки якщо є повторення категорій між сусідніми раундами, інакше null
 * Дублює логіку серверної validateNoCategoryRepeat для живого показу в редакторі
 */
function getCategoryRepeatError(rounds) {
  for (let i = 1; i < rounds.length; i++) {
    const prevCats = new Set((rounds[i - 1].options || []).map(o => o.category).filter(Boolean));
    for (const opt of (rounds[i].options || [])) {
      if (opt.category && prevCats.has(opt.category)) {
        return `Раунд ${i + 1}: категорія "${opt.category}" вже була у раунді ${i}`;
      }
    }
  }
  return null;
}

export default function QuizCreator() {
  const [t, lang, setLang] = useLang();

  // ── Стан квізу ──
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState([EMPTY_QUESTION()]);

  // ── Category mode state (always on — only mode supported) ──
  const [rounds, setRounds] = useState([EMPTY_ROUND()]);
  const [activeRound, setActiveRound] = useState(0);


  // ── Стан UI ──
  const [activeQuestion, setActiveQuestion] = useState(0); // Індекс активного питання
  const [isCreating, setIsCreating] = useState(false);     // Йде запит до сервера
  const [roomCode, setRoomCode] = useState(null);          // Отриманий код кімнати
  const [error, setError] = useState('');                  // Повідомлення про помилку

  // Socket.IO ref (підключаємо лише при потребі)
  const socketRef = useRef(null);

  // ── Host controls state (active after room creation) ──
  const [isPaused, setIsPaused] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);

  // null = не завантажується; { roundIdx, optIdx } = завантаження для цього слоту
  const [uploadingImage, setUploadingImage] = useState(null);

  // Пікер медіа: { roundIdx, optIdx } коли відкрито, null коли закрито
  const [mediaPicker, setMediaPicker] = useState(null);
  const [mediaFiles, setMediaFiles] = useState([]);

  // Drag-to-reorder refs and state
  const dragIndexRef = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  // Import / library refs and state
  const fileInputRef = useRef(null);
  const [importError, setImportError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [showHostLink, setShowHostLink] = useState(false); // показуємо посилання на Host Panel після збереження
  const [libraryQuizzes, setLibraryQuizzes] = useState(null); // null = not loaded
  const [showLibrary, setShowLibrary] = useState(false);
  // ID квізу що зараз редагується (null = новий квіз)
  const [currentQuizId, setCurrentQuizId] = useState(null);

  // ─────────────────────────────────────────────
  // УПРАВЛІННЯ ПИТАННЯМИ
  // ─────────────────────────────────────────────

  /**
   * Додає нове порожнє питання в кінець списку
   */
  const addQuestion = useCallback(() => {
    setQuestions(prev => [...prev, EMPTY_QUESTION()]);
    // Автоматично переходимо до нового питання
    setActiveQuestion(prev => questions.length);
  }, [questions.length]);

  /**
   * Видаляє питання за індексом
   * Не дозволяє видалити якщо залишилось тільки одне
   *
   * @param {number} index - Індекс питання для видалення
   */
  const removeQuestion = useCallback((index) => {
    if (questions.length <= 1) return; // Мінімум одне питання
    setQuestions(prev => prev.filter((_, i) => i !== index));
    setActiveQuestion(prev => Math.min(prev, questions.length - 2));
  }, [questions.length]);

  /**
   * Оновлює поле питання
   *
   * @param {number} qIndex - Індекс питання
   * @param {string} value - Нове значення тексту питання
   */
  const updateQuestionText = useCallback((qIndex, value) => {
    setQuestions(prev => prev.map((q, i) =>
      i === qIndex ? { ...q, question: value } : q
    ));
  }, []);

  /**
   * Оновлює один варіант відповіді
   *
   * @param {number} qIndex - Індекс питання
   * @param {number} aIndex - Індекс відповіді (0-3)
   * @param {string} value  - Новий текст відповіді
   */
  const updateAnswer = useCallback((qIndex, aIndex, value) => {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIndex) return q;
      const answers = [...q.answers];
      answers[aIndex] = value;
      return { ...q, answers };
    }));
  }, []);

  /**
   * Встановлює правильну відповідь для питання
   *
   * @param {number} qIndex   - Індекс питання
   * @param {number} ansIndex - Індекс правильної відповіді (0-3)
   */
  const setCorrectAnswer = useCallback((qIndex, ansIndex) => {
    setQuestions(prev => prev.map((q, i) =>
      i === qIndex ? { ...q, correctAnswer: ansIndex } : q
    ));
  }, []);

  /**
   * Встановлює таймер для конкретного питання
   *
   * @param {number} qIndex - Індекс питання
   * @param {string} value  - Значення таймера (порожнє = глобальний)
   */
  const updateTimeLimit = useCallback((qIndex, value) => {
    setQuestions(prev => prev.map((q, i) =>
      i === qIndex ? { ...q, timeLimit: value } : q
    ));
  }, []);

  const updateImage = useCallback((qIndex, value) => {
    setQuestions(prev => prev.map((q, i) =>
      i === qIndex ? { ...q, image: value } : q
    ));
  }, []);

  const updateAudio = useCallback((qIndex, value) => {
    setQuestions(prev => prev.map((q, i) =>
      i === qIndex ? { ...q, audio: value } : q
    ));
  }, []);

  // ─────────────────────────────────────────────
  // CATEGORY MODE HELPERS
  // ─────────────────────────────────────────────

  const addRound = useCallback(() => {
    setRounds(prev => [...prev, EMPTY_ROUND()]);
    setActiveRound(prev => prev + 1);
  }, []);

  const removeRound = useCallback((i) => {
    if (rounds.length <= 1) return;
    setRounds(prev => prev.filter((_, idx) => idx !== i));
    setActiveRound(prev => Math.min(prev, rounds.length - 2));
  }, [rounds.length]);

  const updateRoundOption = useCallback((roundIdx, optIdx, field, value) => {
    setRounds(prev => prev.map((r, ri) => {
      if (ri !== roundIdx) return r;
      const options = r.options.map((opt, oi) => {
        if (oi !== optIdx) return opt;
        if (field === 'answers') return opt;  // handled separately
        return { ...opt, [field]: value };
      });
      return { ...r, options };
    }));
  }, []);

  const updateRoundOptionAnswer = useCallback((roundIdx, optIdx, aIdx, value) => {
    setRounds(prev => prev.map((r, ri) => {
      if (ri !== roundIdx) return r;
      const options = r.options.map((opt, oi) => {
        if (oi !== optIdx) return opt;
        const answers = [...opt.answers];
        answers[aIdx] = value;
        return { ...opt, answers };
      });
      return { ...r, options };
    }));
  }, []);

  // ─────────────────────────────────────────────
  // ВАЛІДАЦІЯ
  // ─────────────────────────────────────────────

  /**
   * Перевіряє чи квіз готовий до запуску
   * Повертає масив помилок (порожній = все ОК)
   *
   * @returns {string[]} Масив рядків з описами помилок
   */
  const validate = useCallback(() => {
    const errors = [];

    if (!title.trim()) {
      errors.push('Введіть назву квізу');
    }

    rounds.forEach((r, i) => {
      r.options.forEach((opt, j) => {
        if (!opt.category.trim()) {
          errors.push(`Раунд ${i + 1}, варіант ${j + 1}: введіть назву категорії`);
        }
        if (!opt.question.trim()) {
          errors.push(`Раунд ${i + 1}, варіант ${j + 1}: введіть текст питання`);
        }
        const emptyAnswers = opt.answers.filter(a => !a.trim());
        if (emptyAnswers.length > 0) {
          errors.push(`Раунд ${i + 1}, варіант ${j + 1}: заповніть усі 4 варіанти відповіді`);
        }
      });
    });

    // Перевірка правила: жодна категорія не повторюється у двох поспіль раундах
    const repeatError = getCategoryRepeatError(rounds);
    if (repeatError) errors.push(repeatError);

    return errors;
  }, [title, rounds]);

  // ─────────────────────────────────────────────
  // ЗАПУСК ГРИ
  // ─────────────────────────────────────────────

  /**
   * Підключається до сервера і створює квіз-кімнату
   * Після успіху показує код кімнати
   */
  const handleCreateRoom = useCallback(() => {
    const errors = validate();
    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }

    setError('');
    setIsCreating(true);

    // Підготовуємо дані квізу (прибираємо порожні timeLimit)
    const quizData = {
      title: title.trim(),
      categoryMode: true,
      rounds: rounds.map(r => ({
        options: r.options.map(opt => {
          const result = {
            category: opt.category.trim(),
            question: opt.question.trim(),
            answers: opt.answers.map(a => a.trim()),
            correctAnswer: opt.correctAnswer
          };
          const tl = parseInt(opt.timeLimit, 10);
          if (!isNaN(tl) && tl >= 10 && tl <= 120) result.timeLimit = tl;
          if (opt.image?.trim()) result.image = opt.image.trim();
          if (opt.audio?.trim()) result.audio = opt.audio.trim();
          return result;
        })
      }))
    };

    const settings = {
      autoStart: true,
      minPlayers: 1,
      waitForAllPlayers: true
    };

    // Підключаємося до сервера
    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      // Надсилаємо запит на створення кімнати
      socket.emit('create-quiz', { quizData, settings }, (response) => {
        setIsCreating(false);

        if (response.success) {
          setRoomCode(response.roomCode);
        } else {
          setError(response.error || 'Помилка створення кімнати');
          socket.disconnect();
        }
      });
    });

    socket.on('connect_error', () => {
      setIsCreating(false);
      setError('Не вдалось підключитись до сервера. Переконайся що сервер запущений.');
      socket.disconnect();
    });
  }, [validate, title, rounds]);

  /**
   * Слухаємо quiz-update після створення кімнати для host controls
   */
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !roomCode) return;
    const handler = (data) => {
      if (data.type === 'GAME_PAUSED') setIsPaused(true);
      if (data.type === 'GAME_RESUMED') setIsPaused(false);
      if (data.type === 'QUIZ_ENDED') setGameEnded(true);
    };
    socket.on('quiz-update', handler);
    return () => socket.off('quiz-update', handler);
  }, [roomCode]);

  /**
   * Надсилає host-control команду (pause/resume/skip/start)
   */
  const sendHostControl = useCallback((action) => {
    socketRef.current?.emit('host-control', { roomCode, action }, () => {});
  }, [roomCode]);

  /**
   * Скидає форму для створення нового квізу
   */
  const handleReset = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setRoomCode(null);
    setTitle('');
    setQuestions([EMPTY_QUESTION()]);
    setActiveQuestion(0);
    setCategoryMode(false);
    setRounds([EMPTY_ROUND()]);
    setActiveRound(0);
    setError('');
    setIsPaused(false);
    setGameEnded(false);
  }, []);

  // ─────────────────────────────────────────────
  // ЕКСПОРТ JSON
  // ─────────────────────────────────────────────

  /**
   * Завантажує квіз як JSON файл
   * Дозволяє зберегти квіз у папку quizzes/ для повторного використання
   */
  const handleExportJSON = useCallback(() => {
    const quizData = {
      title: title.trim() || 'Мій квіз',
      categoryMode: true,
      rounds: rounds.map(r => ({
        options: r.options.map(opt => ({
          category: opt.category.trim(),
          question: opt.question.trim(),
          answers: opt.answers.map(a => a.trim()),
          correctAnswer: opt.correctAnswer,
          ...(opt.timeLimit ? { timeLimit: parseInt(opt.timeLimit, 10) } : {}),
          ...(opt.image?.trim() ? { image: opt.image.trim() } : {}),
          ...(opt.audio?.trim() ? { audio: opt.audio.trim() } : {})
        }))
      }))
    };

    // Створюємо Blob та посилання для завантаження
    const blob = new Blob([JSON.stringify(quizData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'quiz').toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [title, rounds]);

  // ─────────────────────────────────────────────
  // DRAG-TO-REORDER
  // ─────────────────────────────────────────────

  const handleDragStart = useCallback((index) => {
    dragIndexRef.current = index;
  }, []);

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((e, toIndex) => {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === toIndex) {
      dragIndexRef.current = null;
      setDragOverIndex(null);
      return;
    }
    setQuestions(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
    setActiveQuestion(toIndex);
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  // ─────────────────────────────────────────────
  // IMPORT / LIBRARY
  // ─────────────────────────────────────────────

  /**
   * Handles JSON file import — reads file, validates, populates state
   */
  const handleImportFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const quiz = JSON.parse(evt.target.result);
        if (!quiz.title) {
          setImportError('Invalid quiz JSON: missing title');
          return;
        }
        setTitle(quiz.title);
        setCurrentQuizId(null); // імпорт з файлу — новий квіз без ID
        if (Array.isArray(quiz.rounds) && quiz.rounds.length > 0) {
          setRounds(quiz.rounds.map(r => ({
            options: (r.options || []).map(opt => ({
              category: opt.category || '',
              question: opt.question || '',
              answers: Array.isArray(opt.answers) && opt.answers.length === 4 ? opt.answers : ['', '', '', ''],
              correctAnswer: typeof opt.correctAnswer === 'number' ? opt.correctAnswer : 0,
              timeLimit: opt.timeLimit ? String(opt.timeLimit) : '',
              image: opt.image || '',
              audio: opt.audio || ''
            }))
          })));
          setActiveRound(0);
        } else {
          setImportError('Invalid quiz JSON: missing rounds');
          return;
        }
      } catch {
        setImportError('Could not parse JSON file');
      }
    };
    reader.readAsText(file);
    // Reset file input so same file can be re-imported
    e.target.value = '';
  }, []);

  /**
   * Loads quiz list from /api/quizzes
   */
  const handleLoadLibrary = useCallback(async () => {
    if (showLibrary) { setShowLibrary(false); return; }
    try {
      const res = await fetch('/api/quizzes');
      const data = await res.json();
      setLibraryQuizzes(data.quizzes || []);
      setShowLibrary(true);
    } catch {
      setImportError('Could not load quiz library');
    }
  }, [showLibrary]);

  /**
   * Базова логіка збереження — приймає rounds явно, без залежності від поточного стану.
   * silent=true: не показує тост успіху, не оновлює бібліотеку (для авто-збереження).
   */
  const doSaveToLibrary = useCallback(async (roundsToSave, { silent = false } = {}) => {
    // Не зберігаємо якщо назва порожня або раундів немає
    if (!title.trim() || !roundsToSave.length) return;
    const quizData = {
      ...(currentQuizId ? { id: currentQuizId } : {}),
      title: title.trim(),
      categoryMode: true,
      rounds: roundsToSave.map(r => ({
        options: r.options.map(opt => ({
          category: opt.category.trim(),
          question: opt.question.trim(),
          answers: opt.answers.map(a => a.trim()),
          correctAnswer: opt.correctAnswer,
          ...(opt.timeLimit ? { timeLimit: parseInt(opt.timeLimit, 10) } : {}),
          ...(opt.image?.trim() ? { image: opt.image.trim() } : {}),
          ...(opt.audio?.trim() ? { audio: opt.audio.trim() } : {})
        }))
      }))
    };
    try {
      const res = await fetch('/api/quizzes/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quizData)
      });
      const data = await res.json();
      if (data.success) {
        setCurrentQuizId(data.id);
        if (!silent) {
          setSaveSuccess(`✓ Збережено: "${quizData.title}"`);
          setShowHostLink(true);
          if (showLibrary) {
            const libRes = await fetch('/api/quizzes');
            const libData = await libRes.json();
            setLibraryQuizzes(libData.quizzes || []);
          }
          setTimeout(() => { setSaveSuccess(''); setShowHostLink(false); }, 5000);
        }
      } else if (!silent) {
        setImportError(data.error || 'Could not save quiz');
      }
    } catch {
      if (!silent) setImportError('Could not save quiz to library');
    }
  }, [currentQuizId, title, showLibrary]);

  /**
   * Зберігає поточний квіз у бібліотеку (папка quizzes/ на сервері)
   */
  const handleSaveToLibrary = useCallback(async () => {
    setImportError('');
    setSaveSuccess('');
    const repeatError = getCategoryRepeatError(rounds);
    if (repeatError) { setImportError(repeatError); return; }
    await doSaveToLibrary(rounds);
  }, [rounds, doSaveToLibrary]);

  /**
   * Видаляє квіз з бібліотеки (з підтвердженням)
   */
  const handleDeleteLibraryQuiz = useCallback(async (e, quizId, quizTitle) => {
    e.stopPropagation();
    if (!window.confirm(`Видалити "${quizTitle}" з бібліотеки?`)) return;
    try {
      const res = await fetch(`/api/quizzes/${encodeURIComponent(quizId)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setLibraryQuizzes(prev => prev.filter(q => q.id !== quizId));
      } else {
        setImportError(data.error || 'Could not delete quiz');
      }
    } catch {
      setImportError('Could not delete quiz');
    }
  }, []);

  /**
   * Populates editor from a library quiz
   */
  const handleSelectLibraryQuiz = useCallback((quiz) => {
    setTitle(quiz.title);
    setCurrentQuizId(quiz.id || null);
    if (Array.isArray(quiz.rounds) && quiz.rounds.length > 0) {
      setRounds(quiz.rounds.map(r => ({
        options: (r.options || []).map(opt => ({
          category: opt.category || '',
          question: opt.question || '',
          answers: Array.isArray(opt.answers) && opt.answers.length === 4 ? opt.answers : ['', '', '', ''],
          correctAnswer: typeof opt.correctAnswer === 'number' ? opt.correctAnswer : 0,
          timeLimit: opt.timeLimit ? String(opt.timeLimit) : '',
          image: opt.image || '',
          audio: opt.audio || ''
        }))
      })));
      setActiveRound(0);
    }
    setShowLibrary(false);
    setImportError('');
  }, []);

  /**
   * Завантажує зображення на сервер та записує filename в стан опції.
   * Викликається при onChange файлового інпуту в редакторі раунду.
   */
  const handleImageUpload = useCallback(async (e, roundIdx, optIdx) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // дозволяє повторно завантажити той самий файл

    setUploadingImage({ roundIdx, optIdx });
    setImportError('');

    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/media/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        updateRoundOption(roundIdx, optIdx, 'image', data.filename);
        // Будуємо новий rounds inline (не чекаємо на setState) і зберігаємо тихо
        const updatedRounds = rounds.map((r, ri) => {
          if (ri !== roundIdx) return r;
          return {
            ...r,
            options: r.options.map((opt, oi) =>
              oi === optIdx ? { ...opt, image: data.filename } : opt
            )
          };
        });
        await doSaveToLibrary(updatedRounds, { silent: true });
      } else {
        setImportError(data.error || 'Помилка завантаження зображення');
      }
    } catch {
      setImportError('Не вдалося завантажити зображення');
    } finally {
      setUploadingImage(null);
    }
  }, [updateRoundOption, rounds, doSaveToLibrary]);

  /**
   * Відкриває пікер медіа для заданого слоту — завантажує список файлів з /api/media
   */
  const openMediaPicker = useCallback(async (roundIdx, optIdx) => {
    try {
      const res = await fetch('/api/media');
      const data = await res.json();
      setMediaFiles(data.files || []);
      setMediaPicker({ roundIdx, optIdx });
    } catch {
      setImportError('Could not load media library');
    }
  }, []);

  const closeMediaPicker = useCallback(() => setMediaPicker(null), []);

  /**
   * Вибирає файл з медіа пікера — оновлює стан і авто-зберігає квіз
   */
  const pickMediaFile = useCallback((filename) => {
    if (!mediaPicker) return;
    const { roundIdx, optIdx } = mediaPicker;
    updateRoundOption(roundIdx, optIdx, 'image', filename);
    const updatedRounds = rounds.map((r, ri) => {
      if (ri !== roundIdx) return r;
      return { ...r, options: r.options.map((opt, oi) =>
        oi === optIdx ? { ...opt, image: filename } : opt
      )};
    });
    doSaveToLibrary(updatedRounds, { silent: true });
    setMediaPicker(null);
  }, [mediaPicker, rounds, updateRoundOption, doSaveToLibrary]);

  // ─────────────────────────────────────────────
  // РЕНДЕР
  // ─────────────────────────────────────────────

  const LETTERS = ['A', 'B', 'C', 'D'];
  const LETTER_COLORS = ['var(--color-answer-a)', 'var(--color-answer-b)', 'var(--color-answer-c)', 'var(--color-answer-d)'];
  const currentQ = questions[activeQuestion];
  const currentRound = rounds[activeRound];
  const launchCount = rounds.length;

  // ── Успішне створення кімнати ──
  if (roomCode) {
    return (
      <div className="creator-page">
        <div className="creator-success">
          <div className="success-icon">🎉</div>
          <h2>{t('roomCreated')}</h2>
          <p className="success-subtitle">{t('shareCode')}</p>

          <div className="room-code-display">{roomCode}</div>

          <img
            src={`/api/qr/${roomCode}`}
            alt={`QR ${roomCode}`}
            className="success-qr"
            width={160}
            height={160}
          />

          <p className="success-info">
            {t('playersConnect')}{' '}
            <strong>
              {window.location.protocol}//{window.location.hostname}:{window.location.port || 8080}
            </strong>
          </p>

          {/* Посилання на Projector View */}
          <a
            href={`#/screen?room=${roomCode}`}
            className="btn-outlined projector-link-btn"
            target="_blank"
            rel="noopener noreferrer"
          >
            📺 {t('projectorLink')}
            <span className="projector-link-hint"> — {t('projectorHint')}</span>
          </a>

          {/* Host Controls: керування грою */}
          {!gameEnded && (
            <div className="host-controls">
              <div className="host-controls-title">{t('hostControls')}</div>
              <div className="host-controls-buttons">
                <button
                  className="host-btn host-btn-start"
                  onClick={() => sendHostControl('start')}
                  title={t('hostStart')}
                >
                  ▶ {t('hostStart')}
                </button>
                {isPaused ? (
                  <button
                    className="host-btn host-btn-resume"
                    onClick={() => sendHostControl('resume')}
                  >
                    ▶ {t('hostResume')}
                  </button>
                ) : (
                  <button
                    className="host-btn host-btn-pause"
                    onClick={() => sendHostControl('pause')}
                  >
                    ⏸ {t('hostPause')}
                  </button>
                )}
                <button
                  className="host-btn host-btn-skip"
                  onClick={() => sendHostControl('skip')}
                >
                  ⏭ {t('hostSkip')}
                </button>
              </div>
              {isPaused && (
                <div className="host-paused-badge">{t('gamePaused')}</div>
              )}
            </div>
          )}
          {gameEnded && (
            <div className="host-ended-badge">Quiz ended</div>
          )}

          <div className="success-actions">
            <a href="/" className="btn-outlined">{t('openAsPlayer')}</a>
            <button className="btn-primary-creator" onClick={handleReset}>{t('newQuizBtn')}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="creator-page">
      {/* Hidden file input for JSON import */}
      <input
        type="file"
        accept=".json"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      {/* ── Хедер ── */}
      <header className="creator-header">
        <h1 className="creator-title">{t('createQuizTitle')}</h1>
        <div className="creator-header-right">
          <button
            className="lang-toggle-creator"
            onClick={() => setLang(lang === 'uk' ? 'en' : 'uk')}
            title="Switch language"
          >
            {lang === 'uk' ? '🇬🇧 EN' : '🇺🇦 UK'}
          </button>
          <a href="#/host" className="admin-link">🎮 {lang === 'uk' ? 'Ведучий' : 'Host'}</a>
          <a href="#/admin" className="admin-link">🖥️ Admin</a>
          <a href="/" className="admin-link">👤 {t('playerLink')}</a>
        </div>
      </header>

      <div className="creator-layout">
        {/* ── ЛІВА КОЛОНКА: Назва + список питань/раундів ── */}
        <aside className="creator-sidebar">
          {/* Назва квізу */}
          <div className="sidebar-section">
            <label className="field-label">{t('quizTitle')}</label>
            <input
              className="creator-input"
              type="text"
              placeholder={t('quizTitlePlaceholder')}
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={80}
            />
          </div>

          {/* Список раундів */}
          <div className="sidebar-section">
            <label className="field-label">{t('round')} ({rounds.length})</label>
            <div className="questions-list">
              {rounds.map((r, i) => (
                <div
                  key={i}
                  className={`question-list-item ${i === activeRound ? 'active' : ''} ${r.options[0].category.trim() ? 'filled' : ''}`}
                  onClick={() => setActiveRound(i)}
                >
                  <span className="q-number">R{i + 1}</span>
                  <span className="q-preview">
                    {r.options[0].category.trim() || '—'} / {r.options[1].category.trim() || '—'}
                  </span>
                  {rounds.length > 1 && (
                    <button
                      className="q-remove"
                      onClick={(e) => { e.stopPropagation(); removeRound(i); }}
                      title="Видалити раунд"
                    >×</button>
                  )}
                </div>
              ))}
            </div>
            <button className="add-question-btn" onClick={addRound}>
              {t('addRound')}
            </button>
          </div>

          {/* Налаштування гри */}
        </aside>

        {/* ── ПРАВА КОЛОНКА: Редактор поточного питання/раунду ── */}
        <main className="creator-main">
          {currentRound ? (
            <div className="question-editor">
              <div className="editor-header">
                <h3>{t('round')} {activeRound + 1} / {rounds.length}</h3>
              </div>
              <div className="options-grid">
                {currentRound.options.map((opt, optIdx) => (
                  <div key={optIdx} className={`option-panel option-panel-${optIdx}`}>
                    <div className="option-header">{t('option')} {optIdx + 1}</div>

                    {/* Category name */}
                    <div className="field-group">
                      <label className="field-label">{t('categoryName')}</label>
                      <input
                        className="creator-input"
                        type="text"
                        placeholder={t('categoryNamePlaceholder')}
                        value={opt.category}
                        onChange={e => updateRoundOption(activeRound, optIdx, 'category', e.target.value)}
                        maxLength={60}
                      />
                    </div>

                    {/* Question text */}
                    <div className="field-group">
                      <label className="field-label">{t('questionText')}</label>
                      <textarea
                        className="creator-textarea"
                        placeholder={t('questionPlaceholder')}
                        value={opt.question}
                        onChange={e => updateRoundOption(activeRound, optIdx, 'question', e.target.value)}
                        rows={3}
                        maxLength={300}
                      />
                    </div>

                    {/* Answers */}
                    <div className="field-group">
                      <label className="field-label">{t('answers')}</label>
                      <div className="answers-editor">
                        {opt.answers.map((ans, ai) => (
                          <div
                            key={ai}
                            className={`answer-editor-row ${opt.correctAnswer === ai ? 'is-correct' : ''}`}
                          >
                            <button
                              className="correct-toggle"
                              style={{ background: opt.correctAnswer === ai ? LETTER_COLORS[ai] : 'transparent', borderColor: LETTER_COLORS[ai] }}
                              onClick={() => updateRoundOption(activeRound, optIdx, 'correctAnswer', ai)}
                              title="Позначити як правильну"
                            >
                              {opt.correctAnswer === ai ? '✓' : LETTERS[ai]}
                            </button>
                            <input
                              className="creator-input answer-input"
                              type="text"
                              placeholder={`Відповідь ${LETTERS[ai]}...`}
                              value={ans}
                              onChange={e => updateRoundOptionAnswer(activeRound, optIdx, ai, e.target.value)}
                              maxLength={150}
                            />
                          </div>
                        ))}
                      </div>
                      <p className="field-hint">{t('answerHint')}</p>
                    </div>

                    {/* Зображення для питання */}
                    <div className="field-group">
                      <label className="field-label">
                        {lang === 'uk' ? 'Зображення' : 'Image'}
                      </label>
                      {opt.image ? (
                        <div className="image-preview-wrap">
                          <img
                            src={opt.image.startsWith('http') || opt.image.startsWith('/') ? opt.image : `/api/media/${opt.image}`}
                            alt="preview"
                            className="image-preview"
                            onError={e => { e.target.style.display = 'none'; }}
                          />
                          <div className="image-preview-name">{opt.image}</div>
                          <button
                            className="image-remove-btn"
                            onClick={() => updateRoundOption(activeRound, optIdx, 'image', '')}
                            title={lang === 'uk' ? 'Видалити зображення' : 'Remove image'}
                          >✕</button>
                        </div>
                      ) : (
                        <div className="image-upload-group">
                          <label className={`image-upload-btn${uploadingImage?.roundIdx === activeRound && uploadingImage?.optIdx === optIdx ? ' uploading' : ''}`}>
                            {uploadingImage?.roundIdx === activeRound && uploadingImage?.optIdx === optIdx
                              ? (lang === 'uk' ? 'Завантаження...' : 'Uploading...')
                              : (lang === 'uk' ? '📎 Завантажити нове' : '📎 Upload new')}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/gif,image/webp"
                              style={{ display: 'none' }}
                              onChange={e => handleImageUpload(e, activeRound, optIdx)}
                              disabled={!!uploadingImage}
                            />
                          </label>
                          <button
                            type="button"
                            className="image-pick-btn"
                            onClick={() => openMediaPicker(activeRound, optIdx)}
                          >
                            {lang === 'uk' ? '🖼 З бібліотеки' : '🖼 From library'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Попередження про повторення категорій (живе) */}
          {getCategoryRepeatError(rounds) && (
            <div className="category-repeat-warning">
              ⚠️ {getCategoryRepeatError(rounds)}
            </div>
          )}

          {/* Помилка */}
          {error && <div className="creator-error">{error}</div>}
          {importError && <div className="creator-error">{importError}</div>}
          {saveSuccess && (
            <div className="creator-save-success">
              {saveSuccess}
              {showHostLink && (
                <a href="#/host" className="creator-host-link">
                  {lang === 'uk' ? ' → Перейти до Host Panel' : ' → Go to Host Panel'}
                </a>
              )}
            </div>
          )}

          {/* Library dropdown */}
          {showLibrary && libraryQuizzes && (
            <div className="library-dropdown">
              {libraryQuizzes.length === 0
                ? <div className="library-empty">No quizzes in library</div>
                : libraryQuizzes.map(quiz => (
                  <div key={quiz.id} className="library-item-row">
                    <button
                      className="library-item"
                      onClick={() => handleSelectLibraryQuiz(quiz)}
                    >
                      <span className="library-title">{quiz.title}</span>
                      <span className="library-count">
                        {Array.isArray(quiz.rounds) ? `${quiz.rounds.length}R` : '?'}
                      </span>
                    </button>
                    <button
                      className="library-delete-btn"
                      onClick={(e) => handleDeleteLibraryQuiz(e, quiz.id, quiz.title)}
                      title="Видалити з бібліотеки"
                    >✕</button>
                  </div>
                ))
              }
            </div>
          )}

          {/* Кнопки дій */}
          <div className="creator-actions">
            <button
              className="btn-export"
              onClick={handleExportJSON}
              disabled={!title.trim() || rounds.some(r => r.options.some(o => !o.question.trim()))}
              title="Save as JSON"
            >
              {t('saveJSON')}
            </button>
            <button
              className="btn-import"
              onClick={() => fileInputRef.current?.click()}
              title="Import JSON file"
            >
              {t('importJSON')}
            </button>
            <button
              className="btn-save-library"
              onClick={handleSaveToLibrary}
              disabled={!title.trim()}
              title="Save to library on server"
            >
              {t('saveToLibrary')}
            </button>
            <button
              className="btn-import"
              onClick={handleLoadLibrary}
              title="Load from quiz library"
            >
              {t('loadLibrary')}
            </button>
            <button
              className="btn-create-room"
              onClick={handleCreateRoom}
              disabled={isCreating}
            >
              {isCreating ? t('launching') : `${t('launchQuiz')} (${launchCount})`}
            </button>
          </div>
        </main>
      </div>

      {mediaPicker && (
        <div className="media-picker-overlay" onClick={closeMediaPicker}>
          <div className="media-picker-modal" onClick={e => e.stopPropagation()}>
            <div className="media-picker-header">
              <span>{lang === 'uk' ? 'Оберіть зображення' : 'Pick an image'}</span>
              <button className="media-picker-close" onClick={closeMediaPicker}>✕</button>
            </div>
            {mediaFiles.length === 0 ? (
              <p className="media-picker-empty">
                {lang === 'uk' ? 'Бібліотека медіа порожня' : 'Media library is empty'}
              </p>
            ) : (
              <div className="media-picker-grid">
                {mediaFiles.map(f => (
                  <button
                    key={f.filename}
                    type="button"
                    className="media-picker-thumb"
                    onClick={() => pickMediaFile(f.filename)}
                    title={f.filename}
                  >
                    <img src={f.url} alt={f.filename} onError={e => { e.target.style.display='none'; }} />
                    <span className="media-picker-name">{f.filename}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
