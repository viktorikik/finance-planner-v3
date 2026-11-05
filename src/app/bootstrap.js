/* ==========================================================================
   Инициализация приложения.
   Этап 1: роутер + регистрация SW.
   Этапы 2–7 добавят: открытие IndexedDB, миграции, восстановление состояния,
   проверку инвариантов. Пока — только каркас.
   ========================================================================== */
import { initRouter } from './router.js';
import { registerServiceWorker } from '../pwa/registerServiceWorker.js';

/**
 * Асинхронный старт приложения.
 * Ошибки на этом уровне перехватываются и логируются, но не роняют страницу.
 */
export async function bootstrap() {
  console.log('[bootstrap] app started');

  try {
    initRouter();
    await registerServiceWorker();
    console.log('[bootstrap] ready');
  } catch (err) {
    // Никогда не молчим: пользователь должен понимать, что что-то сломалось.
    console.error('[bootstrap] failed:', err);
  }
}
