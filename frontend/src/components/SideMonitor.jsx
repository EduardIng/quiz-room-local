// SideMonitor.jsx — бічний монітор подіуму
// Відображає нікнейм гравця для інших учасників
// Запускається на HDMI-2 того ж Raspberry Pi (окремий процес Chromium)
// Комунікація: HTTP polling /api/podium/status (localStorage між процесами не працює)

import { useEffect, useState } from 'react';
import './SideMonitor.css';

// URL бекенду — абсолютний в dev (різні порти), відносний в production
const SERVER_URL = import.meta.env.DEV ? 'http://localhost:8080' : window.location.origin;
const POLL_INTERVAL = 2000;

export default function SideMonitor() {
  const [nickname, setNickname] = useState('');
  const [phase, setPhase] = useState('WAITING');
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/api/podium/status`);
        const data = await res.json();
        // Безумовно оновлюємо — щоб null з сервера очистив старий нікнейм
        setNickname(data.nickname ?? '');
        setPhase(data.phase || '');
        setConnected(true);
      } catch {
        // Сервер недоступний — показуємо індикатор втрати зв'язку
        setConnected(false);
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
    <div className={`side-monitor${connected ? '' : ' disconnected'}`}>
      <div className="side-phase-icon">{phaseLabel}</div>
      <div className="side-nickname">{nickname || '...'}</div>
    </div>
  );
}
