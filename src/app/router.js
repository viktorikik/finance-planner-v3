/* ==========================================================================
   Роутер на hash-навигации.
   ========================================================================== */
import { renderPlanScreen } from '../ui/screens/plan/PlanScreen.js';
import { renderCalendarScreen } from '../ui/screens/calendar/CalendarScreen.js';
import { renderStatisticsScreen } from '../ui/screens/statistics/StatisticsScreen.js';
import { renderSettingsScreen } from '../ui/screens/settings/SettingsScreen.js';
import { renderBudgetScreen } from '../ui/screens/budget/BudgetScreen.js';

const ROUTES = {
  plan: renderPlanScreen,
  budget: renderBudgetScreen,
  calendar: renderCalendarScreen,
  statistics: renderStatisticsScreen,
  settings: renderSettingsScreen,
};

const DEFAULT_ROUTE = 'plan';
let dbInstance = null;

export function navigate(route) {
  if (!ROUTES[route]) route = DEFAULT_ROUTE;
  const target = `#/${route}`;
  if (window.location.hash !== target) {
    window.location.hash = target;
  } else {
    render(route);
    updateActiveTabs(route);
  }
}

export async function render(route) {
  const container = document.getElementById('screen');
  if (!container) return;

  const renderer = ROUTES[route] || ROUTES[DEFAULT_ROUTE];
  container.innerHTML = '<div class="loading">Загрузка...</div>';

  try {
    container.innerHTML = '';
    await renderer(container, dbInstance);
  } catch (err) {
    console.error('[Router] Ошибка отображения:', err);
    container.innerHTML = `<div class="card" style="margin: 16px;"><h2 style="color: var(--red);">Ошибка загрузки</h2><p class="muted">${err.message}</p><p class="muted">Попробуйте обновить страницу.</p></div>`;
  }
}

function updateActiveTabs(route) {
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === route);
  });
}

export function initRouter(db) {
  dbInstance = db;

  document.querySelectorAll('[data-tab]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(el.dataset.tab);
    });
  });

  window.addEventListener('hashchange', () => {
    const route = window.location.hash.replace(/^#\/?/, '') || DEFAULT_ROUTE;
    render(route);
    updateActiveTabs(route);
  });

  const initial = window.location.hash.replace(/^#\/?/, '') || DEFAULT_ROUTE;
  navigate(initial);
}
