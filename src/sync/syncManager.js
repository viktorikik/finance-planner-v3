/* ==========================================================================
   syncManager.js — фоновый менеджер авто-синхронизации.
   Слушает события: online, visibilitychange (возврат на вкладку) и таймер.
   ========================================================================== */
import { sync } from './syncEngine.js';
import { getSupabaseClient } from '../supabaseClient.js';

let timerId = null;
let isActive = false;
let currentDb = null;

export function startAutoSync(db) {
  if (isActive) return;
  isActive = true;
  currentDb = db;

  const safeSync = async (reason) => {
    if (!currentDb) return;
    
    // Проверяем, не вышли ли мы из аккаунта
    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    if (!data?.session) return;

    try {
      console.log(`[auto-sync] Запуск по триггеру: ${reason}`);
      await sync(currentDb);
    } catch (e) {
      console.warn('[auto-sync] Ошибка фоновой синхронизации:', e);
    }
  };

  // 1. При появлении интернета
  window.addEventListener('online', () => safeSync('online'));

  // 2. При возврате на вкладку (свайп из фона)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      safeSync('focus');
    }
  });

  // 3. Таймер (каждые 2 минуты)
  timerId = setInterval(() => {
    if (document.visibilityState === 'visible') {
      safeSync('timer');
    }
  }, 120000);

  console.log('[auto-sync] Фоновая синхронизация запущена.');
}

export function stopAutoSync() {
  if (timerId) clearInterval(timerId);
  isActive = false;
  currentDb = null;
  console.log('[auto-sync] Фоновая синхронизация остановлена.');
}
