/* ==========================================================================
   Роутер на hash-навигации + авторизационный guard.
   ========================================================================== */
import { renderPlanScreen } from '../ui/screens/plan/PlanScreen.js';
import { renderCalendarScreen } from '../ui/screens/calendar/CalendarScreen.js';
import { renderStatisticsScreen } from '../ui/screens/statistics/StatisticsScreen.js';
import { renderSettingsScreen } from '../ui/screens/settings/SettingsScreen.js';
import { renderBudgetScreen } from '../ui/screens/budget/BudgetScreen.js';
import { renderLoginScreen } from '../ui/screens/auth/LoginScreen.js';

const ROUTES = {
  plan: renderPlanScreen,
  budget: renderBudgetScreen,
  calendar: renderCalendarScreen,
  statistics: renderStatisticsScreen,
  settings: renderSettingsScreen,
  login: renderLoginScreen,
};

const DEFAULT_ROUTE = 'plan';
const AUTH_ROUTE = 'login';

let dbInstance = null;
let isAuthenticated = false;

export function setAuthenticated(value) {
  isAuthenticated = Boolean(value);
}

export function navigate(route) {
  if (!ROUTES[route]) route = DEFAULT_ROUTE;

  // Auth guard: без сессии — только на login, с сессией — мимо login
  if (!isAuthenticated && route !== AUTH_ROUTE) route = AUTH_ROUTE;
  if (isAuthenticated && route === AUTH_ROUTE) route = DEFAULT_ROUTE;

  const target = `#/${route}`;
  if (window.location.hash !== target) {
    window.location.hash = target;
  } else {
    render(route);
  }
}

export async function render(route) {
  const container = document.getElementById('screen');
  if (!container) return;

  // Guard для прямых переходов по hash
  if (!isAuthenticated && route !== AUTH_ROUTE) {
    window.location.hash = `#/${AUTH_ROUTE}`;
    return;
  }
  if (isAuthenticated && route === AUTH_ROUTE) {
    window.location.hash = `#/${DEFAULT_ROUTE}`;
    return;
  }

  const renderer = ROUTES[route] || ROUTES[DEFAULT_ROUTE];
  container.innerHTML = '<div class="loading">Загрузка...</div>';

  try {
    container.innerHTML = '';
    await renderer(container, dbInstance);
    updateActiveTabs(route);
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
  });

  const initial = window.location.hash.replace(/^#\/?/, '') || DEFAULT_ROUTE;
  navigate(initial);
}
