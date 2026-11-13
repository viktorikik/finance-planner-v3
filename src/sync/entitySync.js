/* ==========================================================================
   entitySync.js — «sync-aware» запись/удаление.
   ВАЖНО (Safari/iPhone): put и запись в syncOutbox делаются ВНУТРИ onsuccess
   от get — иначе транзакция успевает закрыться между await и вызовом put
   (TransactionInactiveError).
   ========================================================================== */
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

function stampSyncFields(record, previous) {
  const now = new Date().toISOString();
  const prevFV = previous?._fieldVersions || {};
  const fieldVersions = { ...prevFV };
  let changed = !previous;

  for (const key of Object.keys(record)) {
    if (key.startsWith('_')) continue;
    if (!previous || !deepEqual(previous[key], record[key])) {
      fieldVersions[key] = now;
      changed = true;
    }
  }

  return {
    ...record,
    _syncUpdatedAt: changed ? now : (previous?._syncUpdatedAt || now),
    _fieldVersions: fieldVersions
  };
}

/**
 * Сохраняет запись с обновлением sync-полей и записью в outbox.
 * Всё внутри onsuccess — транзакция остаётся активной.
 */
export function saveWithSync(tx, storeName, record) {
  if (!SYNCABLE.has(storeName)) {
    return new Promise((resolve, reject) => {
      const req = tx.objectStore(storeName).put(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return new Promise((resolve, reject) => {
    const store = tx.objectStore(storeName);
    const keyPath = store.keyPath;
    const id = record[keyPath];
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      try {
        const previous = getReq.result;
        const stamped = stampSyncFields(record, previous);
        const now = new Date().toISOString();

        const putReq = store.put(stamped);
        putReq.onerror = () => reject(putReq.error);

        putReq.onsuccess = () => {
          const outboxReq = tx.objectStore('syncOutbox').put({
            id: generateId(),
            storeName,
            entityId: id,
            operation: 'upsert',
            createdAt: now
          });
          outboxReq.onsuccess = () => resolve(stamped);
          outboxReq.onerror = () => reject(outboxReq.error);
        };
      } catch (e) {
        reject(e);
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Удаляет запись. Для sync-сторов ставит метку 'delete' в outbox.
 * Всё синхронно — транзакция не успевает закрыться.
 */
export function deleteWithSync(tx, storeName, id) {
  return new Promise((resolve, reject) => {
    const store = tx.objectStore(storeName);
    const delReq = store.delete(id);
    delReq.onerror = () => reject(delReq.error);

    delReq.onsuccess = () => {
      if (!SYNCABLE.has(storeName)) {
        return resolve();
      }
      const outboxReq = tx.objectStore('syncOutbox').put({
        id: generateId(),
        storeName,
        entityId: id,
        operation: 'delete',
        createdAt: new Date().toISOString()
      });
      outboxReq.onsuccess = () => resolve();
      outboxReq.onerror = () => reject(outboxReq.error);
    };
  });
}
