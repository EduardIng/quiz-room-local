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
    if (!sessionResults[sessionId]) {
      try {
        const res = await fetch(`/api/stats/session/${sessionId}`);
        const data = await res.json();
        if (data.success) {
          setSessionResults(prev => ({ ...prev, [sessionId]: data.results }));
        }
      } catch {
        // ignore
      }
    }
  }, [expandedId, sessionResults]);

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
                          <div className="inline-leaderboard">
                            {sessionResults[session.id]
                              ? sessionResults[session.id].map((r, i) => (
                                <div key={i} className="lb-item">
                                  <span className="lb-pos">
                                    {r.position === 1 ? '🥇' : r.position === 2 ? '🥈' : r.position === 3 ? '🥉' : `#${r.position}`}
                                  </span>
                                  <span className="lb-nick">{r.nickname}</span>
                                  <span className="lb-score">{r.score}</span>
                                </div>
                              ))
                              : <span className="lb-loading">...</span>
                            }
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
