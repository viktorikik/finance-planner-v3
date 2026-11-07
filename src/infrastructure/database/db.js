/* ==========================================================================
   Обёртка над IndexedDB.
   Отвечает за открытие базы, создание объектных хранилищ и индексов.
   ========================================================================== */
import { DB_NAME, DB_VERSION, STORES } from './dbSchema.js';

let dbInstance = null;

export function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Удаляем устаревшие таблицы, если они были созданы в промежуточных версиях
      if (db.objectStoreNames.contains('plannedIncomeItems')) {
        db.deleteObjectStore('plannedIncomeItems');
      }
      if (db.objectStoreNames.contains('plannedExpenseItems')) {
        db.deleteObjectStore('plannedExpenseItems');
      }

      // Проходим по всем актуальным хранилищам и создаем недостающие
      for (const [storeName, config] of Object.entries(STORES)) {
        let store;
        
        if (!db.objectStoreNames.contains(storeName)) {
          store = db.createObjectStore(storeName, { keyPath: config.keyPath });
        } else {
          store = event.target.transaction.objectStore(storeName);
        }

        if (config.indexes) {
          for (const index of config.indexes) {
            if (!store.indexNames.contains(index.name)) {
              store.createIndex(index.name, index.keyPath, { unique: index.unique || false });
            }
          }
        }
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      
      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
        console.warn('[DB] База данных закрыта из-за изменения версии.');
      };

      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('[DB] Ошибка открытия IndexedDB:', event.target.error);
      reject(event.target.error);
    };
  });
}

export function closeDB() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
