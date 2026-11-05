/* ==========================================================================
   Роутер на hash-навигации (#/plan, #/calendar, #/statistics, #/settings).
   Hash выбран из-за GitHub Pages: не требует серверной перезаписи URL
   и переживает обновление страницы без 404.

   Каждый экран — модуль, экспортирующий `renderXxxScreen(container)`.
   Роутер отвечает только за выбор экрана и подсветку активной вкладки.
   ========================================================================== */
import { renderPlanScreen } from '../ui/screens/plan/PlanScreen.js';
import { renderCalendarScreen } from '../ui/screens/calendar/CalendarScreen.js';
import { renderStatisticsScreen } from '../ui/screens/statistics/StatisticsScreen.js';
import { renderSettingsScreen } from '../ui/screens/settings/SettingsScreen.js';

/* Таблица маршрутов: имя → функция рендера */
const ROUTES = {
  plan: renderPlanScreen,
  calendar: renderCalendarScreen,
  statistics: renderStatisticsScreen,
  settings: renderSettingsScreen,
};

/* Маршрут по умолчанию */
const DEFAULT_ROUTE = 'plan';

/**
 * Переход на маршрут. Устанавливает hash, рендерит экран, обновляет подсветку.
 */
export function navigate(route) {
  if (!ROUTES[route]) route = DEFAULT_ROUTE;
  // Обновляем hash — это вызовет hashchange и рендер
  const target = `#/${route}`;
  if (window.location.hash !== target) {
    window.location.hash = target;
  } else {
    // hash уже такой — рендерим вручную (hashchange не сработает)
    render(route);
    updateActiveTabs(route);
  }
}

/**
 * Отрисовка экрана в контейнер #screen.
 * Полностью перерисовывает — каждый экран сам отвечает за свой DOM.
 */
export function render(route) {
  const container = document.getElementById('screen');
  if (!container) return;

  const renderer = ROUTES[route] || ROUTES[DEFAULT_ROUTE];
  container.innerHTML = '';           // очищаем
  renderer(container);                // каждый экран сам наполняет
}

/**
 * Подсветка активной вкладки. Активна и в табах, и в футере.
 */
function updateActiveTabs(route) {
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === route);
  });
}

/**
 * Инициализация роутера: обработчики кликов + начальный маршрут из hash.
 * Вызывается один раз из bootstrap.
 */
export function initRouter() {
  // Все элементы с data-tab (вкладки и футер) кликабельны
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(el.dataset.tab);
    });
  });

  // Реакция на ручное изменение hash (назад/вперёд в браузере)
  window.addEventListener('hashchange', () => {
    const route = window.location.hash.replace(/^#\/?/, '') || DEFAULT_ROUTE;
    render(route);
    updateActiveTabs(route);
  });

  // Первичный маршрут
  const initial = window.location.hash.replace(/^#\/?/, '') || DEFAULT_ROUTE;
  navigate(initial);
}
