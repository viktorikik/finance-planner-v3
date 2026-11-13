/* ==========================================================================
   entitySync.js — единая точка «sync-aware» записи/удаления.
   Оборачивает put/delete для синхронизируемых сторов:
   - проставляет _syncUpdatedAt и _fieldVersions (только реально изменённые поля);
   - пишет метку в syncOutbox (upsert/delete);
   - для не-синхронизируемых сторов работает как обычный put.
   ========================================================================== */
import { requestToPromise } from '../infrastructure/database/transaction.js';
import { generateId } from '../domain/shared/ids.js';
import { SYNCABLE_STORES } from '../infrastructure/database/dbSchema.js';

const SYNCABLE = new Set(SYNCABLE_STORES);

export function isSyncable(storeName) {
  return SYNCABLE.has(storeName);
}

/** Глубокое сравнение значений полей (через JSON-сериализацию). */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Возвращает копию записи с обновлёнными _syncUpdatedAt и _fieldVersions.
 * Если ничего не изменилось и previousRecord есть — _syncUpdatedAt не трогается.
 */
export function stampSyncFields(record, previousRecord) {
  const now = new Date().toISOString();
  const prevFV = previousRecord?._fieldVersions || {};
  const fieldVersions = { ...prevFV };
  let changed = !previousRecord;

  for (const key of Object.keys(record)) {
    if (key.startsWith('_')) continue;
    const newVal = record[key];
    const oldVal = previousRecord ? previousRecord[key] : undefined;
    if (!previousRecord || !deepEqual(oldVal, newVal)) {
      fieldVersions[key] = now;
      changed = true;
    }
  }

  return {
    ...record,
    _syncUpdatedAt: changed ? now : (previousRecord?._syncUpdatedAt || now),
    _fieldVersions: fieldVersions
  };
}

/** Пишет метку в syncOutbox (одна запись на одно изменение). */
export async function recordOutbox(tx, storeName, entityId, operation) {
  const store = tx.objectStore('syncOutbox');
  const entry = {
    id: generateId(),
    storeName,
    entityId,
    operation, // 'upsert' | 'delete'
    createdAt: new Date().toISOString()
  };
  return requestToPromise(store.put(entry));
}

/**
 * Сохраняет запись с обновлением sync-полей и записью в outbox.
 * Возвращает сохранённый (stamped) объект.
 */
export async function saveWithSync(tx, storeName, record) {
  if (!SYNCABLE.has(storeName)) {
    return requestToPromise(tx.objectStore(storeName).put(record));
  }

  const store = tx.objectStore(storeName);
  const keyPath = store.keyPath;
  const id = record[keyPath];

  const previous = await requestToPromise(store.get(id));
  const stamped = stampSyncFields(record, previous);

  await requestToPromise(store.put(stamped));
  await recordOutbox(tx, storeName, id, 'upsert');

  return stamped;
}

/**
 * Удаляет запись. Для sync-сторов ставит метку 'delete' в outbox
 * (на сервере запись получит deleted_at — soft delete).
 */
export async function deleteWithSync(tx, storeName, id) {
  const store = tx.objectStore(storeName);
  await requestToPromise(store.delete(id));

  if (SYNCABLE.has(storeName)) {
    await recordOutbox(tx, storeName, id, 'delete');
  }
}
