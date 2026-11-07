/* ==========================================================================
   Роутер на hash-навигации.
   ========================================================================== */
import { renderPlanScreen } from '../ui/screens/plan/PlanScreen.js';
import { renderCalendarScreen } from '../ui/screens/calendar/CalendarScreen.js';
import { renderStatisticsScreen } from '../ui/screens/statistics/StatisticsScreen.js';
import { renderSettingsScreen } from '../ui/screens/settings/SettingsScreen.js';
import { renderBudgetScreen } from '../ui/screens/budget/BudgetScreen.js'; // <-- НОВЫЙ ИМПОРТ

const ROUTES = {
  plan: renderPlanScreen,
  calendar: renderCalendarScreen,
  statistics: renderStatisticsScreen,
  settings: renderSettingsScreen,
  budget: renderBudgetScreen, // <-- НОВЫЙ РОУТ
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
    console.error(err);
    container.innerHTML = `<div class="error-msg">Ошибка отображения: ${err.message}</div>`;
  }
}

function updateActiveTabs(route) {
  // Если мы на экране бюджета, визуально оставляем активной вкладку "План"
  const visualRoute = route === 'budget' ? 'plan' : route;
  
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === visualRoute);
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
