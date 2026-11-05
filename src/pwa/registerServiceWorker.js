/* ==========================================================================
   Регистрация Service Worker.
   В dev-режиме SW отключён: иначе кэш мешает HMR и обновлению модулей.
   В production используется BASE_URL — гарантирует корректный scope
   при раздаче из подпапки GitHub Pages (/finance-planner-v3/).
   ========================================================================== */

/**
 * Регистрирует SW и возвращает registration (или null при неудаче).
 * Не бросает исключение — вызывающая сторона решает, что делать.
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('[pwa] SW not supported');
    return null;
  }

  if (import.meta.env.DEV) {
    console.log('[pwa] SW disabled in dev');
    return null;
  }

  try {
    const base = import.meta.env.BASE_URL;      // '/' или '/finance-planner-v3/'
    const swUrl = base + 'sw.js';
    const registration = await navigator.serviceWorker.register(swUrl, {
      scope: base,
    });
    console.log('[pwa] SW registered:', registration.scope);
    return registration;
  } catch (err) {
    console.error('[pwa] SW registration failed:', err);
    return null;
  }
}
