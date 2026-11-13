/* ==========================================================================
   Миграция v13 → v14.
   Добавляет к существующим записям в синхронизируемых сторах два поля:
   - _syncUpdatedAt — базовая временная метка (updatedAt || createdAt || now)
   - _fieldVersions — карта {поле: timestamp} с этой же меткой

   Миграция идемпотентна: если поле _syncUpdatedAt уже есть — запись пропускается.
   ========================================================================== */
import { SYNCABLE_STORES } from '../database/dbSchema.js';
import { requestToPromise } from '../database/transaction.js';

export async function migrateV13toV14(db) {
  const tx = db.transaction(SYNCABLE_STORES, 'readwrite');
  const now = new Date().toISOString();

  // === Фаза 1: читаем все записи ===
  const allRecords = {};
  for (const storeName of SYNCABLE_STORES) {
    const store = tx.objectStore(storeName);
    allRecords[storeName] = await requestToPromise(store.getAll());
  }

  // === Фаза 2: обновляем и записываем ===
  let migratedCount = 0;
  for (const storeName of SYNCABLE_STORES) {
    const store = tx.objectStore(storeName);
    for (const record of allRecords[storeName]) {
      if (record._syncUpdatedAt && record._fieldVersions) continue; // уже мигрировано

      const baseTime = record.updatedAt || record.createdAt || now;
      const fieldVersions = {};
      for (const key of Object.keys(record)) {
        if (key.startsWith('_')) continue;
        fieldVersions[key] = baseTime;
      }

      store.put({
        ...record,
        _syncUpdatedAt: baseTime,
        _fieldVersions: fieldVersions
      });
      migratedCount++;
    }
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  console.log(`[migrateV13toV14] Обновлено записей: ${migratedCount}`);
}
