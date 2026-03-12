/**
 * main.jsx - Точка входу React додатку з hash-роутингом
 *
 * Маршрути:
 * - #/        → PlayerView  (інтерфейс гравця, за замовчуванням — планшети)
 * - #/host    → HostView    (інтерфейс ведучого: вибір квізу → старт)
 * - #/create  → QuizCreator (редактор квізів для створення JSON)
 * - #/stats   → StatsPanel  (статистика сесій)
 * - #/screen  → ProjectorView (великий екран для залу)
 */

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import PlayerView from './components/PlayerView.jsx';
import HostView from './components/HostView.jsx';
import QuizCreator from './components/QuizCreator.jsx';
import StatsPanel from './components/StatsPanel.jsx';
import ProjectorView from './components/ProjectorView.jsx';
import SideMonitor from './components/SideMonitor.jsx';
import './styles/theme.css';

/**
 * Зчитує поточний hash-маршрут з URL
 * Наприклад: "#/host" → "/host"
 *
 * @returns {string} Маршрут починаючи з "/"
 */
function getRoute() {
  const hash = window.location.hash;
  if (!hash || hash === '#' || hash === '#/') return '/';
  return hash.replace('#', '') || '/';
}

/**
 * Кореневий компонент з hash-роутером
 * Перерендерюється при зміні URL hash
 */
function App() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    // Слухаємо зміни hash (назад/вперед, клік по посиланню)
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Рендеримо відповідний компонент за маршрутом
  if (route === '/host')             return <HostView />;
  if (route === '/create')           return <QuizCreator />;
  if (route === '/stats')            return <StatsPanel />;
  if (route.startsWith('/screen'))   return <ProjectorView />;
  if (route === '/side')             return <SideMonitor />;
  return <PlayerView />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
