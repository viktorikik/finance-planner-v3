/* ==========================================================================
   Инициализация приложения.
   Открывает базу данных и передает её в роутер.
   ========================================================================== */
import { openDB } from '../infrastructure/database/db.js';
import { initRouter } from './router.js';
import { registerServiceWorker } from '../pwa/registerServiceWorker.js';

export async function bootstrap() {
  console.log('[bootstrap] app started');

  try {
    // 1. Открываем базу данных
    const db = await openDB();
    console.log('[bootstrap] DB ready');

    // 2. Инициализируем роутер, передавая ему db
    initRouter(db);

    // 3. Регистрируем Service Worker
    await registerServiceWorker();
    
    console.log('[bootstrap] ready');
  } catch (err) {
    console.error('[bootstrap] failed:', err);
    document.getElementById('screen').innerHTML = `
      <div class="error-msg">
        <h2>Ошибка запуска</h2>
        <p>${err.message}</p>
        <p>Попробуйте перезагрузить страницу.</p>
      </div>
    `;
  }
}
