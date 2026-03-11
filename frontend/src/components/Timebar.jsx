// Timebar.jsx — компонент смуги зворотного відліку
// Отримує timeLimit (секунди), timeRemaining (секунди), відображає анімовану смугу

import { useEffect, useState, useRef } from 'react';
import './Timebar.css';

export default function Timebar({ timeLimit, timeRemaining, showLabel = true }) {
  const [displayTime, setDisplayTime] = useState(timeRemaining);
  const intervalRef = useRef(null);
  const startRef = useRef(Date.now());
  const startRemaining = useRef(timeRemaining);

  useEffect(() => {
    // Скидаємо при зміні timeRemaining ззовні (нове питання або синхронізація)
    startRef.current = Date.now();
    startRemaining.current = timeRemaining;
    setDisplayTime(timeRemaining);

    clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      const remaining = Math.max(0, startRemaining.current - elapsed);
      setDisplayTime(remaining);
      if (remaining <= 0) clearInterval(intervalRef.current);
    }, 100);

    return () => clearInterval(intervalRef.current);
  }, [timeRemaining]);

  const pct = timeLimit > 0 ? Math.max(0, (displayTime / timeLimit) * 100) : 0;
  const colorClass = pct > 40 ? '' : pct > 20 ? 'warning' : 'danger';
  const secs = Math.ceil(displayTime);

  return (
    <div className="timebar-wrapper">
      <div className="timebar-container">
        <div
          className={`timebar-fill ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && <div className="timebar-label">{secs}s</div>}
    </div>
  );
}
