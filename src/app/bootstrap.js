/* ==========================================================================
   Инициализация приложения.
   Открывает БД, миграцию, проверяет сессию Supabase, запускает роутер.
   ========================================================================== */
import { openDB } from '../infrastructure/database/db.js';
import { runMigrationIfNeeded } from '../infrastructure/migration/runMigration.js';
import { initRouter, navigate, setAuthenticated } from './router.js';
import { registerServiceWorker } from '../pwa/registerServiceWorker.js';
import { getCurrentSession, onAuthStateChange } from '../auth/authService.js';

export async function bootstrap() {
  console.log('[bootstrap] app started');

  try {
    // 1. Открываем базу данных
    const db = await openDB();
    console.log('[bootstrap] DB ready');

    // 2. Миграция
    await runMigrationIfNeeded(db);

    // 3. Проверяем текущую сессию Supabase (читается из localStorage — работает офлайн)
    let authed = false;
    try {
      const session = await getCurrentSession();
      authed = Boolean(session);
    } catch (e) {
      console.warn('[bootstrap] Не удалось получить сессию:', e);
    }
    setAuthenticated(authed);
    updateBodyAuthClass(authed);

    // 4. Роутер
    initRouter(db);

    // 5. Реакция на изменения auth
    onAuthStateChange((event, session) => {
      const nowAuthed = Boolean(session);
      setAuthenticated(nowAuthed);
      updateBodyAuthClass(nowAuthed);
      if (event === 'SIGNED_IN' && nowAuthed) navigate('plan');
      else if (event === 'SIGNED_OUT') navigate('login');
    });

    // 6. Service Worker
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
  } finally {
    document.body.classList.remove('booting');
  }
}

function updateBodyAuthClass(authed) {
  document.body.classList.toggle('is-authenticated', authed);
  document.body.classList.toggle('is-auth-screen', !authed);
}
