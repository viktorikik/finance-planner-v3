/* ==========================================================================
   entitySync.js — единая точка «sync-aware» записи/удаления.
   ВАЖНО: внутри транзакции IndexedDB избегаем лишних await между операциями,
   иначе Safari/iPhone закрывает транзакцию (TransactionInactiveError).
   ========================================================================== */
import { requestToPromise } from '../infrastructure/database/transaction.js';
import { generateId } from '../domain/shared/ids.js';
import { SYNCABLE_STORES } from '../infrastructure/database/dbSchema.js';

const SYNCABLE = new Set(SYNCABLE_STORES);

export function isSyncable(storeName) {
  return SYNCABLE.has(storeName);
}

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

/** Синхронно пишет метку в syncOutbox (без await). */
function recordOutboxSync(tx, storeName, entityId, operation) {
  const outboxStore = tx.objectStore('syncOutbox');
  outboxStore.put({
    id: generateId(),
    storeName,
    entityId,
    operation,
    createdAt: new Date().toISOString()
  });
}

export async function saveWithSync(tx, storeName, record) {
  if (!SYNCABLE.has(storeName)) {
    return requestToPromise(tx.objectStore(storeName).put(record));
  }

  const store = tx.objectStore(storeName);
  const keyPath = store.keyPath;
  const id = record[keyPath];

  // Единственный await — чтение предыдущей версии (нужно для field-level merge).
  const previous = await new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const stamped = stampSyncFields(record, previous);

  // СИНХРОННО, без await: put + outbox в одной микротаске.
  store.put(stamped);
  recordOutboxSync(tx, storeName, id, 'upsert');

  return stamped;
}

export async function deleteWithSync(tx, storeName, id) {
  const store = tx.objectStore(storeName);
  store.delete(id); // без await — синхронно

  if (SYNCABLE.has(storeName)) {
    recordOutboxSync(tx, storeName, id, 'delete');
  }
}
