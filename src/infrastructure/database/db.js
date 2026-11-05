/* ==========================================================================
   Обёртка над IndexedDB.
   Отвечает за открытие базы, создание объектных хранилищ и индексов.
   ========================================================================== */
import { DB_NAME, DB_VERSION, STORES } from './dbSchema.js';

let dbInstance = null;

/**
 * Открывает базу данных. Если база создаётся впервые (onupgradeneeded),
 * создаёт все object stores и индексы согласно схеме.
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Срабатывает при создании базы или изменении версии
    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Проходим по всем описанным хранилищам
      for (const [storeName, config] of Object.entries(STORES)) {
        let store;
        
        // Если хранилища ещё нет — создаём
        if (!db.objectStoreNames.contains(storeName)) {
          store = db.createObjectStore(storeName, { keyPath: config.keyPath });
        } else {
          // Если есть (при обновлении версии) — получаем доступ
          store = event.target.transaction.objectStore(storeName);
        }

        // Создаём индексы
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
      
      // Обработка внештатного закрытия (например, очистка данных браузером)
      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
        console.warn('[DB] База данных закрыта из-за изменения версии (возможно, открыта в другой вкладке).');
      };

      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('[DB] Ошибка открытия IndexedDB:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Закрывает соединение с базой. Полезно для тестов.
 */
export function closeDB() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
