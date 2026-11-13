/* ==========================================================================
   syncEngine.js — синхронизация IndexedDB ↔ Supabase.
   Обновлено:
   - Защита от параллельных запусков (замок).
   - Авто-догрузка (backfill) при появлении нового шаринга.
   - Первичная полная выгрузка локальных данных (hasDoneFullUpload).
   ========================================================================== */
import { requestToPromise } from '../infrastructure/database/transaction.js';
import { SYNCABLE_STORES } from '../infrastructure/database/dbSchema.js';
import { getSupabaseClient } from '../supabaseClient.js';
import { generateId } from '../domain/shared/ids.js';
import {
  getLastSync, setLastSync,
  getForceCloudReset, clearForceCloudReset, clearOutbox,
  getKnownShares, setKnownShares,
  getHasDoneFullUpload, setHasDoneFullUpload
} from './syncMeta.js';

const SYNCABLE = new Set(SYNCABLE_STORES);
const PAGE_SIZE = 500;
const RPC_BATCH = 50;

let syncPromise = null;

function awaitTx(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function stripSyncFields(record) {
  const { _syncUpdatedAt, _fieldVersions, _ownerId, ...clean } = record;
  return clean;
}

function collapseOutbox(entries) {
  const map = new Map();
  for (const e of entries) map.set(e.entityId, e);
  return [...map.values()];
}

async function prepareTasks(db, collapsedEntries) {
  const tasks = [];
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const myId = userData?.user?.id;

  for (const entry of collapsedEntries) {
    const storeName = entry.storeName;
    if (!SYNCABLE.has(storeName)) continue;

    if (entry.operation === 'delete') {
      tasks.push({ outboxId: entry.id, storeName, entityId: entry.entityId, isDelete: true });
      continue;
    }

    const tx = db.transaction([storeName], 'readonly');
    const record = await requestToPromise(tx.objectStore(storeName).get(entry.entityId));
    await awaitTx(tx);

    if (!record) {
      tasks.push({ outboxId: entry.id, storeName, entityId: entry.entityId, isDelete: true });
      continue;
    }

    if (record._ownerId && record._ownerId !== myId) {
      continue;
    }

    tasks.push({
      outboxId: entry.id, storeName, entityId: entry.entityId,
      isDelete: false, data: stripSyncFields(record), fieldVersions: record._fieldVersions || {}
    });
  }
  return tasks;
}

async function pushBatch(supabase, tasks) {
  const ok = [];
  const failed = [];
  for (const t of tasks) {
    try {
      const { error } = await supabase.rpc('merge_sync_entity', {
        p_id: t.entityId, p_entity_type: t.storeName,
        p_data: t.data || {}, p_field_versions: t.fieldVersions || {}, p_deleted: t.isDelete
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
  const readTx = db.transaction(['syncOutbox'], 'readonly');
  const all = await requestToPromise(readTx.objectStore('syncOutbox').getAll());
  await awaitTx(readTx);
  if (all.length === 0) return { pushed: 0, failed: 0 };

  const collapsed = collapseOutbox(all);
  const tasks = await prepareTasks(db, collapsed);
  if (tasks.length === 0) {
    await clearOutbox(db);
    return { pushed: 0, failed: 0 };
  }

  const supabase = getSupabaseClient();
  let allOk = [], allFailed = [];

  for (let i = 0; i < tasks.length; i += RPC_BATCH) {
    const chunk = tasks.slice(i, i + RPC_BATCH);
    const res = await pushBatch(supabase, chunk);
    allOk = allOk.concat(res.ok);
    allFailed = allFailed.concat(res.failed);
  }

  if (allOk.length > 0) {
    const delTx = db.transaction(['syncOutbox'], 'readwrite');
    const store = delTx.objectStore('syncOutbox');
    for (const id of allOk) await requestToPromise(store.delete(id));
    await awaitTx(delTx);
  }

  return { pushed: allOk.length, failed: allFailed.length };
}

function mergeRemoteIntoLocal(localRecord, remoteData, remoteFV, remoteUpdatedAt, remoteOwnerId) {
  if (!localRecord) {
    return {
      ...remoteData, _syncUpdatedAt: remoteUpdatedAt,
      _fieldVersions: { ...remoteFV }, _ownerId: remoteOwnerId
    };
  }

  const merged = { ...localRecord, _ownerId: remoteOwnerId };
  const mergedFV = { ...(localRecord._fieldVersions || {}) };

  for (const [field, remoteTs] of Object.entries(remoteFV || {})) {
    const localTs = mergedFV[field];
    const apply = !localTs || new Date(remoteTs) > new Date(localTs);
    if (apply) {
      merged[field] = remoteData[field] !== undefined ? remoteData[field] : null;
      mergedFV[field] = remoteTs;
    }
  }

  const localSyncTs = localRecord._syncUpdatedAt ? new Date(localRecord._syncUpdatedAt) : new Date(0);
  const remoteSyncTs = remoteUpdatedAt ? new Date(remoteUpdatedAt) : new Date(0);
  merged._syncUpdatedAt = remoteSyncTs > localSyncTs ? remoteUpdatedAt : localRecord._syncUpdatedAt;
  merged._fieldVersions = mergedFV;
  return merged;
}

export async function pull(db) {
  const lastSync = await getLastSync(db);
  const supabase = getSupabaseClient();

  let totalApplied = 0;
  let fromUpdatedAt = lastSync;

  while (true) {
    let query = supabase
      .from('sync_entities')
      .select('id, user_id, entity_type, data, field_versions, updated_at, deleted_at')
      .order('updated_at', { ascending: true })
      .limit(PAGE_SIZE);

    if (fromUpdatedAt) query = query.gt('updated_at', fromUpdatedAt);

    const { data: rows, error } = await query;
    if (error) throw error;
    if (!rows || rows.length === 0) break;

    await applyRemoteRows(db, rows);
    totalApplied += rows.length;

    const lastRow = rows[rows.length - 1];
    fromUpdatedAt = lastRow.updated_at;

    if (rows.length < PAGE_SIZE) break;
  }

  return { pulled: totalApplied };
}

async function applyRemoteRows(db, rows) {
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
        if (local) await requestToPromise(store.delete(row.id));
        continue;
      }

      const merged = mergeRemoteIntoLocal(local, row.data, row.field_versions, row.updated_at, row.user_id);
      await requestToPromise(store.put(merged));
    }

    await awaitTx(tx);
  }
}

// === НОВОЕ: Первичная полная выгрузка локальных данных в облако ===
async function forceUploadAll(db, supabase) {
  const { data: userData } = await supabase.auth.getUser();
  const myId = userData?.user?.id;
  if (!myId) return 0;

  let uploadCount = 0;

  for (const storeName of SYNCABLE_STORES) {
    const readTx = db.transaction([storeName], 'readonly');
    const records = await requestToPromise(readTx.objectStore(storeName).getAll());
    await awaitTx(readTx);

    const toUpload = records.filter(r => !r._ownerId || r._ownerId === myId);
    if (toUpload.length === 0) continue;

    const writeTx = db.transaction(['syncOutbox'], 'readwrite');
    const outStore = writeTx.objectStore('syncOutbox');
    const now = new Date().toISOString();

    // ВАЖНО (Safari): все put запускаем синхронно, без await между ними.
    for (const record of toUpload) {
      outStore.put({
        id: generateId(),
        storeName,
        entityId: record.id,
        operation: 'upsert',
        createdAt: now
      });
    }

    await awaitTx(writeTx);
    uploadCount += toUpload.length;
  }

  return uploadCount;
}

async function checkForNewShares(db, supabase) {
  try {
    const { data: shares, error } = await supabase.rpc('get_shares_with_me');
    if (error || !shares) return { currentShares: [] };

    const currentShareIds = shares.map(s => s.owner_id).sort();
    const savedShareIds = await getKnownShares(db);

    const hasNew = currentShareIds.some(id => !savedShareIds.includes(id));

    if (hasNew) {
      console.log('[sync] Обнаружен новый совместный доступ. Включаем полную догрузку (backfill).');
      await setLastSync(db, null);
    }

    return { currentShares: currentShareIds };
  } catch (err) {
    console.warn('[sync] Ошибка проверки шарингов:', err);
    return { currentShares: [] };
  }
}

async function doSync(db, options = {}) {
  const supabase = getSupabaseClient();
  const { data: sessData } = await supabase.auth.getSession();
  if (!sessData?.session) return { ok: false, reason: 'not-authenticated' };

  const { currentShares } = await checkForNewShares(db, supabase);

  let isForceReset = false;
  if (await getForceCloudReset(db)) {
    isForceReset = true;
    console.log('[sync] forceCloudReset: очищаем облачные данные...');
    const { error } = await supabase.rpc('reset_my_cloud_data');
    if (error) throw error;
    await clearForceCloudReset(db);
    await clearOutbox(db);
    await setLastSync(db, null);
    await setHasDoneFullUpload(db, true);
  }

  // Первичная полная выгрузка: если ещё не делали (или принудительно).
  const hasDoneFullUpload = await getHasDoneFullUpload(db);
  const shouldForceUpload = !isForceReset && (!hasDoneFullUpload || options.forceUpload);

  if (shouldForceUpload) {
    const uploadCount = await forceUploadAll(db, supabase);
    console.log(`[sync] Полная выгрузка: добавлено в очередь ${uploadCount} записей`);
    await setHasDoneFullUpload(db, true);
  }

  const pushResult = await push(db);
  const pullResult = await pull(db);

  await setLastSync(db, new Date().toISOString());

  if (currentShares.length > 0) {
    await setKnownShares(db, currentShares);
  }

  return { ok: true, ...pushResult, ...pullResult };
}

export async function sync(db, options = {}) {
  if (syncPromise) {
    console.log('[sync] Синхронизация уже идет, ждем текущую...');
    return syncPromise;
  }

  syncPromise = doSync(db, options);
  try {
    const res = await syncPromise;
    return res;
  } finally {
    syncPromise = null;
  }
}
