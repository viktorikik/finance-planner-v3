/* ==========================================================================
   Утилита для экспорта и импорта всей базы данных (Бэкап).
   ========================================================================== */
import { STORES } from '../database/dbSchema.js';
import { getAllFromStore, putIntoStore } from '../database/transaction.js';

/**
 * Собирает все данные из IndexedDB в один объект.
 * @param {IDBDatabase} db 
 * @returns {Object} - JSON-объект со всеми данными
 */
export async function generateBackup(db) {
  const backup = {
    version: 8, // DB_VERSION
    exportedAt: new Date().toISOString(),
    data: {}
  };

  const stores = Object.keys(STORES);
  const tx = db.transaction(stores, 'readonly');

  for (const storeName of stores) {
    backup.data[storeName] = await getAllFromStore(storeName, tx);
  }

  return backup;
}

/**
 * Полностью перезаписывает базу данных данными из бэкапа.
 * @param {IDBDatabase} db 
 * @param {Object} backup - Объект бэкапа
 */
export async function restoreBackup(db, backup) {
  if (!backup || !backup.data) {
    throw new Error('Неверный формат файла бэкапа');
  }

  const stores = Object.keys(STORES);
  const tx = db.transaction(stores, 'readwrite');

  // 1. Очищаем все таблицы
  for (const storeName of stores) {
    await new Promise((resolve, reject) => {
      const req = tx.objectStore(storeName).clear();
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
    });
  }

  // 2. Загружаем новые данные
  for (const storeName of stores) {
    const items = backup.data[storeName] || [];
    for (const item of items) {
      await putIntoStore(storeName, item, tx);
    }
  }
}
