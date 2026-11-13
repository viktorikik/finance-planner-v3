/* ==========================================================================
   syncMeta.js — служебные метаданные синхронизации в сторе syncMeta.
   Хранит: lastSync (ISO-строка последней успешной синхронизации),
   forceCloudReset (флаг «удалить все облачные данные пользователя»).
   ========================================================================== */
import { getFromStore, putIntoStore } from '../infrastructure/database/transaction.js';

function awaitTx(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getLastSync(db) {
  const tx = db.transaction(['syncMeta'], 'readonly');
  const row = await getFromStore('syncMeta', 'lastSync', tx);
  await awaitTx(tx);
  return row?.value || null;
}

export async function setLastSync(db, iso) {
  const tx = db.transaction(['syncMeta'], 'readwrite');
  await putIntoStore('syncMeta', { id: 'lastSync', value: iso }, tx);
  await awaitTx(tx);
}

export async function getForceCloudReset(db) {
  const tx = db.transaction(['syncMeta'], 'readonly');
  const row = await getFromStore('syncMeta', 'forceCloudReset', tx);
  await awaitTx(tx);
  return Boolean(row?.value);
}

export async function clearForceCloudReset(db) {
  const tx = db.transaction(['syncMeta'], 'readwrite');
  await new Promise((resolve, reject) => {
    const req = tx.objectStore('syncMeta').delete('forceCloudReset');
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
  await awaitTx(tx);
}

export async function clearOutbox(db) {
  const tx = db.transaction(['syncOutbox'], 'readwrite');
  await new Promise((resolve, reject) => {
    const req = tx.objectStore('syncOutbox').clear();
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
  await awaitTx(tx);
}
