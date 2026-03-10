/**
 * AdminPanel.jsx - Адмін-панель для моніторингу активних квізів
 *
 * Показує всі активні кімнати в реальному часі:
 * - Код кімнати
 * - Назва квізу
 * - Поточний стан гри
 * - Кількість гравців
 * - Кнопка копіювання коду кімнати
 *
 * Оновлення: опитує /api/active-quizzes кожні 2 секунди
 */

import React, { useState, useEffect, useCallback } from 'react';
import useLang from '../utils/useLang.js';
import './AdminPanel.css';

// Переклад станів гри для відображення
const STATE_LABELS = {
  WAITING:       { label: 'Очікування',  color: '#f39c12' },
  STARTING:      { label: 'Старт!',      color: '#3498db' },
  QUESTION:      { label: 'Питання',     color: '#27ae60' },
  ANSWER_REVEAL: { label: 'Відповідь',   color: '#8e44ad' },
  LEADERBOARD:   { label: 'Рейтинг',     color: '#2980b9' },
  ENDED:         { label: 'Завершено',   color: '#7f8c8d' },
};

export default function AdminPanel() {
  const [t, lang, setLang] = useLang();

  // Список активних сесій від API
  const [sessions, setSessions] = useState([]);

  // Стан з'єднання з сервером
  const [status, setStatus] = useState('connecting'); // 'connecting' | 'ok' | 'error'

  // Час останнього оновлення
  const [lastUpdate, setLastUpdate] = useState(null);

  // Повідомлення про скопійований код
  const [copiedCode, setCopiedCode] = useState(null);

  // Час роботи сервера (uptime)
  const [serverUptime, setServerUptime] = useState(null);

  /**
   * Запитує активні сесії з API
   * Викликається кожні 2 секунди через setInterval
   */
  const fetchSessions = useCallback(async () => {
    try {
      const response = await fetch('/api/active-quizzes');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      setSessions(data.sessions || []);
      setStatus('ok');
      setLastUpdate(new Date());
    } catch {
      setStatus('error');
    }
  }, []);

  /**
   * Запитує health endpoint для отримання uptime сервера
   */
  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch('/health');
      const data = await response.json();
      setServerUptime(data.uptime);
    } catch {
      // Ігноруємо помилки health check
    }
  }, []);

  // Запускаємо polling при монтуванні компонента
  useEffect(() => {
    // Перший запит одразу
    fetchSessions();
    fetchHealth();

    // Потім кожні 2 секунди
    const sessionsInterval = setInterval(fetchSessions, 2000);
    const healthInterval = setInterval(fetchHealth, 10000);

    return () => {
      clearInterval(sessionsInterval);
      clearInterval(healthInterval);
    };
  }, [fetchSessions, fetchHealth]);

  /**
   * Копіює код кімнати в буфер обміну
   * Показує підтвердження на 2 секунди
   *
   * @param {string} code - Код кімнати для копіювання
   */
  const copyCode = useCallback((code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  }, []);

  /**
   * Форматує uptime у читабельний формат
   * Наприклад: 3661 → "1год 1хв 1с"
   *
   * @param {number} seconds - Секунди роботи сервера
   * @returns {string} Відформатований рядок
   */
  function formatUptime(seconds) {
    if (!seconds && seconds !== 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}год ${m}хв`;
    if (m > 0) return `${m}хв ${s}с`;
    return `${s}с`;
  }

  /**
   * Форматує час останнього оновлення
   *
   * @param {Date} date - Дата оновлення
   * @returns {string} Рядок "ЧЧ:ХХ:СС"
   */
  function formatTime(date) {
    if (!date) return '—';
    return date.toLocaleTimeString('uk-UA');
  }

  return (
    <div className="admin-panel">
      {/* ── Хедер ── */}
      <header className="admin-header">
        <div className="admin-header-left">
          <h1 className="admin-title">{t('adminTitle')}</h1>
          <p className="admin-subtitle">{t('adminSubtitle')}</p>
        </div>
        <div className="admin-header-right">
          {/* Індикатор стану з'єднання */}
          <div className={`status-indicator ${status}`}>
            <span className="status-dot" />
            <span className="status-text">
              {status === 'ok' ? t('online') : status === 'error' ? t('error') : t('connecting')}
            </span>
          </div>
          <button
            className="lang-toggle-admin"
            onClick={() => setLang(lang === 'uk' ? 'en' : 'uk')}
            title="Switch language"
          >
            {lang === 'uk' ? '🇬🇧 EN' : '🇺🇦 UK'}
          </button>
          <a href="/" className="admin-nav-link">{t('playerLink')}</a>
          <a href="#/stats" className="admin-nav-link">{t('statsLink')}</a>
          <a href="#/create" className="admin-nav-link admin-nav-primary">{t('newQuiz')}</a>
        </div>
      </header>

      {/* ── Статистика сервера ── */}
      <div className="admin-stats">
        <div className="stat-card">
          <div className="stat-card-value">{sessions.length}</div>
          <div className="stat-card-label">{t('activeRooms')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">
            {sessions.reduce((sum, s) => sum + s.playerCount, 0)}
          </div>
          <div className="stat-card-label">{t('playersOnline')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{formatUptime(serverUptime)}</div>
          <div className="stat-card-label">{t('serverUptime')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{formatTime(lastUpdate)}</div>
          <div className="stat-card-label">{t('updated')}</div>
        </div>
      </div>

      {/* ── Список активних кімнат ── */}
      <div className="admin-content">
        <h2 className="section-title">{t('activeRoomsTitle')}</h2>

        {status === 'error' && (
          <div className="admin-error">
            {t('serverError')}
          </div>
        )}

        {status === 'ok' && sessions.length === 0 && (
          <div className="admin-empty">
            <div className="admin-empty-icon">📭</div>
            <p>{t('noRooms')}</p>
            <a href="#/create" className="btn-primary-small">{t('createQuiz')}</a>
          </div>
        )}

        {sessions.length > 0 && (
          <div className="sessions-grid">
            {sessions.map((session) => {
              const stateInfo = STATE_LABELS[session.gameState] || { label: session.gameState, color: '#95a5a6' };

              return (
                <div key={session.roomCode} className="session-card">
                  {/* Код кімнати */}
                  <div className="session-code-row">
                    <span className="session-code">{session.roomCode}</span>
                    <button
                      className={`copy-btn ${copiedCode === session.roomCode ? 'copied' : ''}`}
                      onClick={() => copyCode(session.roomCode)}
                      title="Copy code"
                    >
                      {copiedCode === session.roomCode ? t('copied') : t('copyCode')}
                    </button>
                  </div>

                  {/* QR code */}
                  <img
                    src={`/api/qr/${session.roomCode}`}
                    alt={`QR ${session.roomCode}`}
                    className="session-qr"
                    width={80}
                    height={80}
                  />

                  {/* Назва квізу */}
                  <div className="session-title">{session.title}</div>

                  {/* Стан та гравці */}
                  <div className="session-meta">
                    <span
                      className="session-state"
                      style={{ background: stateInfo.color + '22', color: stateInfo.color, borderColor: stateInfo.color + '44' }}
                    >
                      {stateInfo.label}
                    </span>
                    <span className="session-players">
                      👥 {session.playerCount}
                    </span>
                  </div>

                  {/* Projector View link */}
                  <a
                    href={`#/screen?room=${session.roomCode}`}
                    className="session-projector-link"
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t('projectorHint')}
                  >
                    📺 {t('projectorLink')}
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
