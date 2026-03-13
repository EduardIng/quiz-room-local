/**
 * StatsPanel.jsx - Statistics dashboard for completed quiz sessions
 *
 * Fetches GET /api/stats and displays:
 * - Summary cards (total sessions, players, avg)
 * - Session history table with expandable leaderboard rows
 */

import React, { useState, useEffect, useCallback } from 'react';
import useLang from '../utils/useLang.js';
import './StatsPanel.css';

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export default function StatsPanel() {
  const [t, lang, setLang] = useLang();
  const [stats, setStats] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [sessionResults, setSessionResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [questionStatsCache, setQuestionStatsCache] = useState({}); // sessionId → масив статистики питань
  const [activeTab, setActiveTab] = useState({}); // sessionId → 'leaderboard' | 'questions'

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data.success) setStats(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const toggleExpand = useCallback(async (sessionId) => {
    if (expandedId === sessionId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(sessionId);
    // Встановлюємо вкладку за замовчуванням при першому розкритті
    setActiveTab(prev => ({ ...prev, [sessionId]: prev[sessionId] || 'leaderboard' }));

    // Завантажуємо таблицю лідерів, якщо ще не кешовано
    if (!sessionResults[sessionId]) {
      try {
        const res = await fetch(`/api/stats/session/${sessionId}`);
        const data = await res.json();
        if (data.success) {
          setSessionResults(prev => ({ ...prev, [sessionId]: data.results }));
        }
      } catch { /* ignore */ }
    }

    // Завантажуємо статистику питань, якщо ще не кешовано
    if (!questionStatsCache[sessionId]) {
      try {
        const res = await fetch(`/api/stats/session/${sessionId}/questions`);
        const data = await res.json();
        if (data.success) {
          setQuestionStatsCache(prev => ({ ...prev, [sessionId]: data.questionStats }));
        }
      } catch { /* ignore */ }
    }
  }, [expandedId, sessionResults, questionStatsCache]);

  const totals = stats?.totals || {};
  const sessions = stats?.sessions || [];

  return (
    <div className="stats-panel">
      {/* Header */}
      <header className="stats-header">
        <div className="stats-header-left">
          <h1 className="stats-title">{t('statsTitle')}</h1>
        </div>
        <div className="stats-header-right">
          <button
            className="lang-toggle"
            onClick={() => setLang(lang === 'uk' ? 'en' : 'uk')}
            title="Switch language"
          >
            {lang === 'uk' ? '🇬🇧 EN' : '🇺🇦 UK'}
          </button>
          <a href="#/admin" className="stats-nav-link">{t('back')}</a>
        </div>
      </header>

      {/* Summary cards */}
      <div className="stats-summary">
        <div className="stat-card">
          <div className="stat-card-value">{totals.total_sessions || 0}</div>
          <div className="stat-card-label">{t('totalSessions')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{totals.total_players || 0}</div>
          <div className="stat-card-label">{t('totalPlayers')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">
            {totals.avg_players ? Math.round(totals.avg_players * 10) / 10 : 0}
          </div>
          <div className="stat-card-label">{t('avgPlayers')}</div>
        </div>
      </div>

      {/* Session history */}
      <div className="stats-content">
        <h2 className="section-title">{t('sessionHistory')}</h2>

        {loading && <div className="stats-loading">...</div>}

        {!loading && sessions.length === 0 && (
          <div className="stats-empty">{t('noSessions')}</div>
        )}

        {sessions.length > 0 && (
          <div className="sessions-table-wrap">
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>{t('date')}</th>
                  <th>{t('title')}</th>
                  <th>{t('playersCount')}</th>
                  <th>{t('topScorer')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(session => (
                  <React.Fragment key={session.id}>
                    <tr className={expandedId === session.id ? 'row-expanded' : ''}>
                      <td className="col-date">{formatDate(session.ended_at)}</td>
                      <td className="col-title">{session.title}</td>
                      <td className="col-players">{session.player_count}</td>
                      <td className="col-top">
                        {session.topScorer
                          ? `${session.topScorer.nickname} (${session.topScorer.score})`
                          : '—'}
                      </td>
                      <td className="col-action">
                        <button
                          className="expand-btn"
                          onClick={() => toggleExpand(session.id)}
                        >
                          {expandedId === session.id ? t('hideBtn') : t('leaderboardBtn')}
                        </button>
                      </td>
                    </tr>

                    {expandedId === session.id && (
                      <tr className="leaderboard-row">
                        <td colSpan={5}>
                          <div className="session-detail">

                            {/* Вкладки навігації */}
                            <div className="detail-tabs">
                              <button
                                className={`detail-tab ${(activeTab[session.id] || 'leaderboard') === 'leaderboard' ? 'active' : ''}`}
                                onClick={() => setActiveTab(prev => ({ ...prev, [session.id]: 'leaderboard' }))}
                              >
                                {lang === 'uk' ? 'Рейтинг' : 'Leaderboard'}
                              </button>
                              <button
                                className={`detail-tab ${activeTab[session.id] === 'questions' ? 'active' : ''}`}
                                onClick={() => setActiveTab(prev => ({ ...prev, [session.id]: 'questions' }))}
                              >
                                {lang === 'uk' ? 'Питання' : 'Questions'}
                              </button>
                            </div>

                            {/* Вкладка: таблиця лідерів */}
                            {(activeTab[session.id] || 'leaderboard') === 'leaderboard' && (
                              <div className="tab-leaderboard">
                                {sessionResults[session.id]
                                  ? sessionResults[session.id].map((r, i) => (
                                    <div key={i} className="lb-item">
                                      <span className="lb-pos">
                                        {r.position === 1 ? '🥇' : r.position === 2 ? '🥈' : r.position === 3 ? '🥉' : `#${r.position}`}
                                      </span>
                                      <span className="lb-nick">{r.nickname}</span>
                                      <span className="lb-score">{r.score}</span>
                                      {r.avg_answer_time != null && (
                                        <span className="lb-time">⏱ {r.avg_answer_time.toFixed(1)}s</span>
                                      )}
                                    </div>
                                  ))
                                  : <span className="lb-loading">...</span>
                                }
                              </div>
                            )}

                            {/* Вкладка: статистика питань */}
                            {activeTab[session.id] === 'questions' && (
                              <div className="tab-questions">
                                {!questionStatsCache[session.id]
                                  ? <span className="lb-loading">...</span>
                                  : questionStatsCache[session.id].length === 0
                                    ? <span className="lb-loading">{lang === 'uk' ? 'Немає даних' : 'No data'}</span>
                                    : (() => {
                                        const qs = questionStatsCache[session.id];
                                        // Знаходимо питання з найнижчою точністю для бейджу "Найважче"
                                        const hardestIdx = qs.reduce((minIdx, q, i) => {
                                          if (q.total_answered === 0) return minIdx;
                                          const acc = q[`answer_${q.correct_answer}`] / q.total_answered;
                                          const minAcc = qs[minIdx]?.total_answered > 0
                                            ? qs[minIdx][`answer_${qs[minIdx].correct_answer}`] / qs[minIdx].total_answered
                                            : 1;
                                          return acc < minAcc ? i : minIdx;
                                        }, 0);

                                        return qs.map((q, i) => {
                                          const correctCount = q.correct_answer >= 0 ? (q[`answer_${q.correct_answer}`] || 0) : 0;
                                          const accuracyPct = q.total_answered > 0
                                            ? Math.round(correctCount / q.total_answered * 100)
                                            : null;
                                          const isHardest = i === hardestIdx && q.total_answered > 0 && accuracyPct < 100;
                                          const LETTERS = ['A', 'B', 'C', 'D'];

                                          return (
                                            <div key={i} className={`q-row ${isHardest ? 'q-hardest' : ''}`}>
                                              <div className="q-header">
                                                <span className="q-num">Q{q.question_index + 1}</span>
                                                {isHardest && (
                                                  <span className="q-hardest-badge">
                                                    {lang === 'uk' ? '⚠️ Найважче' : '⚠️ Hardest'}
                                                  </span>
                                                )}
                                                <span className="q-accuracy-label">
                                                  {accuracyPct !== null
                                                    ? `${accuracyPct}% ${lang === 'uk' ? 'правильно' : 'correct'}`
                                                    : '—'}
                                                </span>
                                              </div>

                                              {/* Смуга точності відповідей */}
                                              {accuracyPct !== null && (
                                                <div className="q-accuracy-bar-wrap">
                                                  <div className="q-accuracy-bar" style={{ width: `${accuracyPct}%` }} />
                                                </div>
                                              )}

                                              {/* Розподіл відповідей A/B/C/D */}
                                              <div className="q-dist">
                                                {[0, 1, 2, 3].map(idx => {
                                                  const count = q[`answer_${idx}`] || 0;
                                                  const pct = q.total_answered > 0
                                                    ? Math.round(count / q.total_answered * 100)
                                                    : 0;
                                                  const isCorrect = idx === q.correct_answer;
                                                  return (
                                                    <div key={idx} className={`q-dist-item ${isCorrect ? 'correct' : ''}`}>
                                                      <span className="q-dist-letter">{LETTERS[idx]}</span>
                                                      <div className="q-dist-bar-wrap">
                                                        <div
                                                          className={`q-dist-bar ${isCorrect ? 'correct' : ''}`}
                                                          style={{ width: `${pct}%` }}
                                                        />
                                                      </div>
                                                      <span className="q-dist-pct">{pct}%</span>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          );
                                        });
                                      })()
                                }
                              </div>
                            )}

                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
