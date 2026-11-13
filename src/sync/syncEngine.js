/* ==========================================================================
   syncEngine.js — синхронизация IndexedDB ↔ Supabase.
   - push(): отправка outbox через RPC merge_sync_entity (field-level merge на сервере).
   - pull(): получение изменений с сервера и field-level merge локально.
   - sync(): оркестратор (обработка forceCloudReset → push → pull → lastSync).

   Локальные поля: _syncUpdatedAt (ISO), _fieldVersions ({field: ISO}).
   Сторы вне SYNCABLE_STORES не участвуют.
   ========================================================================== */
import { requestToPromise } from '../infrastructure/database/transaction.js';
import { SYNCABLE_STORES } from '../infrastructure/database/dbSchema.js';
import { getSupabaseClient } from '../supabaseClient.js';
import {
  getLastSync, setLastSync,
  getForceCloudReset, clearForceCloudReset, clearOutbox
} from './syncMeta.js';

const SYNCABLE = new Set(SYNCABLE_STORES);
const PAGE_SIZE = 500;
const RPC_BATCH = 50;

function awaitTx(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Убирает sync-поля перед отправкой в облако. */
function stripSyncFields(record) {
  const { _syncUpdatedAt, _fieldVersions, ...clean } = record;
  return clean;
}

// ============================================================
// PUSH
// ============================================================

/** Свёртка outbox: для каждой entityId берём последнюю операцию. */
function collapseOutbox(entries) {
  const map = new Map();
  for (const e of entries) map.set(e.entityId, e);
  return [...map.values()];
}

/**
 * Готовит список задач для push:
 *   { outboxId, storeName, entityId, isDelete, data?, fieldVersions? }
 */
async function prepareTasks(db, collapsedEntries) {
  const tasks = [];
  for (const entry of collapsedEntries) {
    const storeName = entry.storeName;
    if (!SYNCABLE.has(storeName)) continue;

    if (entry.operation === 'delete') {
      tasks.push({
        outboxId: entry.id,
        storeName,
        entityId: entry.entityId,
        isDelete: true
      });
      continue;
    }

    // upsert: читаем актуальную запись из стора
    const tx = db.transaction([storeName], 'readonly');
    const record = await requestToPromise(tx.objectStore(storeName).get(entry.entityId));
    await awaitTx(tx);

    if (!record) {
      // Запись уже удалена локально — считаем как delete
      tasks.push({
        outboxId: entry.id,
        storeName,
        entityId: entry.entityId,
        isDelete: true
      });
      continue;
    }

    tasks.push({
      outboxId: entry.id,
      storeName,
      entityId: entry.entityId,
      isDelete: false,
      data: stripSyncFields(record),
      fieldVersions: record._fieldVersions || {}
    });
  }
  return tasks;
}

/** Отправляет один батч задач через RPC. Возвращает { ok, failed } — id outbox. */
async function pushBatch(supabase, tasks) {
  const ok = [];
  const failed = [];
  for (const t of tasks) {
    try {
      const { error } = await supabase.rpc('merge_sync_entity', {
        p_id: t.entityId,
        p_entity_type: t.storeName,
        p_data: t.data || {},
        p_field_versions: t.fieldVersions || {},
        p_deleted: t.isDelete
      });
      if (error) throw error;
      ok.push(t.outboxId);
    } catch (err) {
      console.error('[sync] push failed:', t.storeName, t.entityId, err);
      failed.push(t.outboxId);
    }
  }
  return { ok, failed };
}

export async function push(db) {
  // 1. Читаем весь outbox
  const readTx = db.transaction(['syncOutbox'], 'readonly');
  const all = await requestToPromise(readTx.objectStore('syncOutbox').getAll());
  await awaitTx(readTx);
  if (all.length === 0) return { pushed: 0, failed: 0 };

  // 2. Свёртка и подготовка задач
  const collapsed = collapseOutbox(all);
  const tasks = await prepareTasks(db, collapsed);
  if (tasks.length === 0) {
    await clearOutbox(db);
    return { pushed: 0, failed: 0 };
  }

  // 3. Батчами — RPC
  const supabase = getSupabaseClient();
  let allOk = [];
  let allFailed = [];

  for (let i = 0; i < tasks.length; i += RPC_BATCH) {
    const chunk = tasks.slice(i, i + RPC_BATCH);
    const res = await pushBatch(supabase, chunk);
    allOk = allOk.concat(res.ok);
    allFailed = allFailed.concat(res.failed);
  }

  // 4. Удаляем из outbox успешно отправленные
  if (allOk.length > 0) {
    const delTx = db.transaction(['syncOutbox'], 'readwrite');
    const store = delTx.objectStore('syncOutbox');
    for (const id of allOk) {
      await requestToPromise(store.delete(id));
    }
    await awaitTx(delTx);
  }

  return { pushed: allOk.length, failed: allFailed.length };
}

// ============================================================
// PULL
// ============================================================

/**
 * Field-level merge: входящие поля применяются только если их timestamp
 * строго больше локального для этого поля. Возвращает итоговую запись.
 */
function mergeRemoteIntoLocal(localRecord, remoteData, remoteFV, remoteUpdatedAt) {
  if (!localRecord) {
    return {
      ...remoteData,
      _syncUpdatedAt: remoteUpdatedAt,
      _fieldVersions: { ...remoteFV }
    };
  }

  const merged = { ...localRecord };
  const mergedFV = { ...(localRecord._fieldVersions || {}) };

  for (const [field, remoteTs] of Object.entries(remoteFV || {})) {
    const localTs = mergedFV[field];
    const apply = !localTs || new Date(remoteTs) > new Date(localTs);
    if (apply) {
      merged[field] = remoteData[field] !== undefined ? remoteData[field] : null;
      mergedFV[field] = remoteTs;
    }
  }

  // _syncUpdatedAt: берём более поздний
  const localSyncTs = localRecord._syncUpdatedAt ? new Date(localRecord._syncUpdatedAt) : new Date(0);
  const remoteSyncTs = remoteUpdatedAt ? new Date(remoteUpdatedAt) : new Date(0);
  merged._syncUpdatedAt = remoteSyncTs > localSyncTs
    ? remoteUpdatedAt
    : localRecord._syncUpdatedAt;

  merged._fieldVersions = mergedFV;
  return merged;
}

export async function pull(db) {
  const lastSync = await getLastSync(db);
  const supabase = getSupabaseClient();

  let totalApplied = 0;
  let fromUpdatedAt = lastSync;

  // Пагинация: сервер отдаёт по updated_at ASC, чтобы lastSync двигался вперёд.
  while (true) {
    let query = supabase
      .from('sync_entities')
      .select('id, entity_type, data, field_versions, updated_at, deleted_at')
      .order('updated_at', { ascending: true })
      .limit(PAGE_SIZE);

    if (fromUpdatedAt) query = query.gt('updated_at', fromUpdatedAt);

    const { data: rows, error } = await query;
    if (error) throw error;
    if (!rows || rows.length === 0) break;

    await applyRemoteRows(db, rows);
    totalApplied += rows.length;

    // Следующая страница — от последнего updated_at
    const lastRow = rows[rows.length - 1];
    fromUpdatedAt = lastRow.updated_at;

    if (rows.length < PAGE_SIZE) break;
  }

  return { pulled: totalApplied };
}

async function applyRemoteRows(db, rows) {
  // Группируем по стору, чтобы делать по одной транзакции на стор
  const byStore = new Map();
  for (const row of rows) {
    const storeName = row.entity_type;
    if (!SYNCABLE.has(storeName)) continue;
    if (!byStore.has(storeName)) byStore.set(storeName, []);
    byStore.get(storeName).push(row);
  }

  for (const [storeName, storeRows] of byStore) {
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);

    for (const row of storeRows) {
      const local = await requestToPromise(store.get(row.id));

      if (row.deleted_at) {
        // Soft delete → удаляем локально
        if (local) await requestToPromise(store.delete(row.id));
        continue;
      }

      const merged = mergeRemoteIntoLocal(local, row.data, row.field_versions, row.updated_at);
      await requestToPromise(store.put(merged));
    }

    await awaitTx(tx);
  }
}

// ============================================================
// SYNC (оркестратор)
// ============================================================

export async function sync(db) {
  const supabase = getSupabaseClient();

  // 0. Проверка сессии
  const { data: sessData } = await supabase.auth.getSession();
  if (!sessData?.session) {
    return { ok: false, reason: 'not-authenticated' };
  }

  // 1. forceCloudReset — полная очистка облака
  if (await getForceCloudReset(db)) {
    console.log('[sync] forceCloudReset: очищаем облачные данные...');
    const { error } = await supabase.rpc('reset_my_cloud_data');
    if (error) {
      console.error('[sync] reset_my_cloud_data failed:', error);
      throw error;
    }
    await clearForceCloudReset(db);
    await clearOutbox(db);
    await setLastSync(db, null);
    console.log('[sync] облачные данные очищены');
  }

  // 2. Push
  const pushResult = await push(db);

  // 3. Pull (от lastSync до текущего)
  const pullResult = await pull(db);

  // 4. Двигаем lastSync вперёд
  await setLastSync(db, new Date().toISOString());

  return {
    ok: true,
    ...pushResult,
    ...pullResult
  };
}
