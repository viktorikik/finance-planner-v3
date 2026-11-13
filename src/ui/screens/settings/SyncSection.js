/* ==========================================================================
   SyncSection.js — блок «Синхронизация» в настройках.
   Показывает: статус, очередь изменений, время последней синхронизации,
   кнопку «Синхронизировать сейчас», лог и кнопку «Выйти из аккаунта».
   ========================================================================== */
import { sync } from '../../../sync/syncEngine.js';
import { getLastSync } from '../../../sync/syncMeta.js';
import { getCurrentSession, signOut } from '../../../auth/authService.js';
import { requestToPromise } from '../../../infrastructure/database/transaction.js';

// In-memory лог последних операций (не сохраняется между перезагрузками)
const syncLog = [];
const MAX_LOG = 20;

function pushLog(entry) {
  syncLog.unshift({ ...entry, at: new Date().toISOString() });
  if (syncLog.length > MAX_LOG) syncLog.length = MAX_LOG;
}

function formatDateTime(iso) {
  if (!iso) return 'никогда';
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  } catch { return iso; }
}

async function getOutboxCount(db) {
  const tx = db.transaction(['syncOutbox'], 'readonly');
  const count = await requestToPromise(tx.objectStore('syncOutbox').count());
  return count;
}

/**
 * Рендерит блок «Синхронизация» в переданный anchor-элемент.
 * Можно вызывать повторно — полностью перерисует содержимое.
 */
export async function renderSyncSection(anchor, db) {
  if (!anchor) return;

  // === Загружаем данные ===
  const session = await getCurrentSession();
  const authed = Boolean(session);
  const outboxCount = authed ? await getOutboxCount(db) : 0;
  const lastSync = await getLastSync(db);

  const status = authed
    ? (outboxCount > 0 ? 'pending' : 'ok')
    : 'not-authenticated';

  const statusMap = {
    'not-authenticated': { dot: 'sync-dot-muted', text: 'Не выполнен вход' },
    ok: { dot: 'sync-dot-ok', text: 'Всё синхронизировано' },
    pending: { dot: 'sync-dot-pending', text: `Есть неотправленные изменения (${outboxCount})` },
    syncing: { dot: 'sync-dot-syncing', text: 'Синхронизация...' },
    error: { dot: 'sync-dot-error', text: 'Ошибка синхронизации' }
  };

  const st = statusMap[status];

  const logHtml = syncLog.length
    ? syncLog.slice(0, 5).map(l => `
        <div class="sync-log-item sync-log-${l.kind}">
          <span class="sync-log-time">${formatDateTime(l.at)}</span>
          <span class="sync-log-msg">${l.message}</span>
        </div>
      `).join('')
    : '<div class="sync-log-empty">Пока не было операций</div>';

  anchor.innerHTML = `
    <section class="card">
      <h2>Синхронизация</h2>

      <div class="sync-status-row">
        <span class="sync-dot ${st.dot}" id="sync-status-dot"></span>
        <span class="sync-status-text" id="sync-status-text">${st.text}</span>
      </div>

      <div class="sync-info">
        <div class="sync-info-row">
          <span>Email</span>
          <b>${session?.user?.email || '—'}</b>
        </div>
        <div class="sync-info-row">
          <span>В очереди</span>
          <b id="sync-outbox-count">${outboxCount} изменени${plural(outboxCount)}</b>
        </div>
        <div class="sync-info-row">
          <span>Последняя синхронизация</span>
          <b id="sync-last-at">${formatDateTime(lastSync)}</b>
        </div>
      </div>

      <button class="btn" id="btn-sync-now" style="width: 100%; margin-top: 12px;" ${!authed ? 'disabled' : ''}>
        🔄 Синхронизировать сейчас
      </button>

      <details class="sync-log-details" style="margin-top: 12px;">
        <summary>Лог операций</summary>
        <div class="sync-log" id="sync-log">${logHtml}</div>
      </details>

      <button class="btn btn-outline" id="btn-signout" style="width: 100%; margin-top: 12px;">
        🚪 Выйти из аккаунта
      </button>

      <p class="sync-warning">
        При выходе локальные данные остаются на устройстве. Если вы войдёте
        под другим аккаунтом, данные могут смешаться. Рекомендуется сначала
        сделать резервную копию.
      </p>
    </section>
  `;

  // === Обработчик: синхронизация ===
  const btnSync = anchor.querySelector('#btn-sync-now');
  btnSync.addEventListener('click', async () => {
    if (!authed) return;
    btnSync.disabled = true;
    btnSync.textContent = '⏳ Синхронизация...';
    const dot = anchor.querySelector('#sync-status-dot');
    const txt = anchor.querySelector('#sync-status-text');
    dot.className = 'sync-dot sync-dot-syncing';
    txt.textContent = 'Синхронизация...';

    try {
      const result = await sync(db);
      if (!result.ok && result.reason === 'not-authenticated') {
        throw new Error('Не выполнен вход');
      }
      const pushed = result.pushed || 0;
      const pulled = result.pulled || 0;
      const failed = result.failed || 0;
      const summary = `Отправлено: ${pushed}, получено: ${pulled}${failed ? `, ошибок: ${failed}` : ''}`;
      pushLog({ kind: failed ? 'error' : 'ok', message: summary });
      await renderSyncSection(anchor, db);
    } catch (err) {
      console.error('[SyncSection] sync failed:', err);
      pushLog({ kind: 'error', message: 'Ошибка: ' + (err?.message || 'неизвестно') });
      await renderSyncSection(anchor, db);
    }
  });

  // === Обработчик: выход ===
  const btnSignout = anchor.querySelector('#btn-signout');
  btnSignout.addEventListener('click', async () => {
    if (!confirm('Выйти из аккаунта? Локальные данные останутся на устройстве.')) return;
    try {
      btnSignout.disabled = true;
      btnSignout.textContent = 'Выход...';
      await signOut();
      // Router переключит на экран входа через onAuthStateChange в bootstrap.js
    } catch (err) {
      alert('Ошибка выхода: ' + err.message);
      btnSignout.disabled = false;
      btnSignout.textContent = '🚪 Выйти из аккаунта';
    }
  });
}

function plural(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'е';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'я';
  return 'й';
}
