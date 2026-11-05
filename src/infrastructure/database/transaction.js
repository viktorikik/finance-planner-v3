/* ==========================================================================
   Утилиты для удобной работы с IndexedDB через async/await.
   ========================================================================== */

/**
 * Превращает IDBRequest в Promise.
 */
export function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Получает все записи из указанного store в рамках транзакции.
 */
export function getAllFromStore(storeName, transaction) {
  const store = transaction.objectStore(storeName);
  return requestToPromise(store.getAll());
}

/**
 * Добавляет или обновляет запись в указанном store.
 */
export function putIntoStore(storeName, value, transaction) {
  const store = transaction.objectStore(storeName);
  return requestToPromise(store.put(value));
}

/**
 * Получает одну запись по ключу.
 */
export function getFromStore(storeName, key, transaction) {
  const store = transaction.objectStore(storeName);
  return requestToPromise(store.get(key));
}
