/* ==========================================================================
   realtimeManager.js — мгновенная синхронизация через WebSocket (Supabase Realtime).
   Слушает изменения в sync_entities и shared_access, вызывает sync().
   ========================================================================== */
import { getSupabaseClient } from '../supabaseClient.js';
import { sync } from './syncEngine.js';

let channel = null;
let currentDb = null;
let syncTimeout = null;

/**
 * Запускает Realtime-подписку.
 * Вызывать после успешной авторизации.
 */
export function startRealtime(db) {
  if (channel) return; // Уже запущено
  currentDb = db;
  const supabase = getSupabaseClient();

  // Слушаем изменения в sync_entities (данные) и shared_access (доступы)
  channel = supabase
    .channel('realtime-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sync_entities' },
      (payload) => {
        // Игнорируем свои собственные изменения, чтобы не было бесконечного цикла
        // (события от других пользователей приходят с их user_id)
        const { data: { user } } = supabase.auth.getUserSync?.() || {};
        // getUserSync может не быть, поэтому используем простой debounce
        scheduleSync();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shared_access' },
      (payload) => {
        // Новый шаринг или отзыв доступа — нужно пересинхронизироваться
        console.log('[realtime] Изменение в shared_access, запускаем sync');
        scheduleSync();
      }
    )
    .subscribe((status) => {
      console.log('[realtime] Статус подписки:', status);
      if (status === 'SUBSCRIBED') {
        console.log('[realtime] WebSocket подключен, изменения будут приходить мгновенно.');
      }
    });

  console.log('[realtime] Менеджер запущен.');
}

/**
 * Останавливает Realtime-подписку.
 */
export function stopRealtime() {
  if (channel) {
    const supabase = getSupabaseClient();
    supabase.removeChannel(channel);
    channel = null;
    currentDb = null;
    console.log('[realtime] Менеджер остановлен.');
  }
}

/**
 * Ставит sync() в очередь с задержкой 500 мс.
 * Это защищает от «шторма» событий (например, при массовом импорте).
 */
function scheduleSync() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    if (!currentDb) return;
    try {
      console.log('[realtime] Запуск sync() по событию WebSocket');
      await sync(currentDb);
    } catch (e) {
      console.warn('[realtime] Ошибка синхронизации:', e);
    }
  }, 500);
}
