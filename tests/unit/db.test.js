/* ==========================================================================
   Тест инфраструктуры IndexedDB.
   Проверяет создание схемы и базовую запись/чтение.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'fake-indexeddb/auto'; // Подключаем имитацию IndexedDB для Node.js
import { openDB, closeDB } from '../../src/infrastructure/database/db.js';
import { STORES } from '../../src/infrastructure/database/dbSchema.js';

describe('Stage 2 — IndexedDB Infrastructure', () => {
  let db;

  beforeAll(async () => {
    // Открываем базу перед тестами
    db = await openDB();
  });

  afterAll(() => {
    // Закрываем после
    closeDB();
  });

  it('создаёт все необходимые object stores', () => {
    const expectedStores = Object.keys(STORES);
    const actualStores = Array.from(db.objectStoreNames);
    
    expect(actualStores.sort()).toEqual(expectedStores.sort());
  });

  it('создаёт индексы для moneyEntries', () => {
    const tx = db.transaction('moneyEntries', 'readonly');
    const store = tx.objectStore('moneyEntries');
    
    const indexes = Array.from(store.indexNames);
    expect(indexes).toContain('moneyLotId');
    expect(indexes).toContain('positionId');
    expect(indexes).toContain('parentPositionId');
  });

  it('успешно записывает и читает данные', async () => {
    const testGoal = { id: 'test-1', name: 'Тестовая цель', status: 'active' };

    // Запись
    await new Promise((resolve, reject) => {
      const tx = db.transaction('goals', 'readwrite');
      const store = tx.objectStore('goals');
      const req = store.add(testGoal);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    // Чтение
    const readData = await new Promise((resolve, reject) => {
      const tx = db.transaction('goals', 'readonly');
      const store = tx.objectStore('goals');
      const req = store.get('test-1');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    expect(readData).toEqual(testGoal);
  });
});
