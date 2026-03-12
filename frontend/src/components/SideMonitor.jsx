// SideMonitor.jsx — бічний монітор подіуму
// Відображає нікнейм гравця для інших учасників
// Запускається на HDMI-2 того ж Raspberry Pi (окремий процес Chromium)
// Комунікація: HTTP polling /api/podium/status (localStorage між процесами не працює)

import { useEffect, useState } from 'react';
import './SideMonitor.css';

const POLL_INTERVAL = 2000;

export default function SideMonitor() {
  const [nickname, setNickname] = useState('');
  const [phase, setPhase] = useState('WAITING');

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/podium/status');
        const data = await res.json();
        // Безумовно оновлюємо — щоб null з сервера очистив старий нікнейм
        setNickname(data.nickname ?? '');
        setPhase(data.phase || '');
      } catch {
        // Сервер недоступний — продовжуємо показувати останній стан
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const phaseLabel = {
    'QUESTION': '🎯',
    'ANSWER_REVEAL': '✓',
    'LEADERBOARD': '🏆',
    'CATEGORY_SELECT': '📂',
    'ENDED': '🏁',
  }[phase] || '';

  return (
    <div className="side-monitor">
      <div className="side-phase-icon">{phaseLabel}</div>
      <div className="side-nickname">{nickname || '...'}</div>
    </div>
  );
}
