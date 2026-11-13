/* ==========================================================================
   Миграция v13 → v14.
   Добавляет к существующим записям в синхронизируемых сторах поля
   _syncUpdatedAt и _fieldVersions.

   ВАЖНО (Safari/iPhone): все чтения запускаются параллельно, записи
   делаются внутри onsuccess от последнего чтения — транзакция остаётся
   активной на протяжении всей операции.
   ========================================================================== */
import { SYNCABLE_STORES } from '../database/dbSchema.js';

export function migrateV13toV14(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNCABLE_STORES, 'readwrite');
    const now = new Date().toISOString();
    const allRecords = {};
    let pending = SYNCABLE_STORES.length;
    let failed = false;

    function fail(err) {
      if (failed) return;
      failed = true;
      reject(err);
    }

    if (pending === 0) {
      resolve();
      return;
    }

    for (const storeName of SYNCABLE_STORES) {
      const req = tx.objectStore(storeName).getAll();
      req.onerror = () => fail(req.error);
      req.onsuccess = () => {
        allRecords[storeName] = req.result;
        pending--;
        if (pending > 0) return;

        // Все чтения завершены — делаем записи СИНХРОННО в этом же onsuccess.
        try {
          let migratedCount = 0;
          for (const sn of SYNCABLE_STORES) {
            const store = tx.objectStore(sn);
            for (const record of allRecords[sn]) {
              if (record._syncUpdatedAt && record._fieldVersions) continue;
              const baseTime = record.updatedAt || record.createdAt || now;
              const fieldVersions = {};
              for (const key of Object.keys(record)) {
                if (key.startsWith('_')) continue;
                fieldVersions[key] = baseTime;
              }
              store.put({ ...record, _syncUpdatedAt: baseTime, _fieldVersions: fieldVersions });
              migratedCount++;
            }
          }
          console.log(`[migrateV13toV14] Обновлено записей: ${migratedCount}`);
        } catch (e) {
          fail(e);
        }
      };
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error);
  });
}
