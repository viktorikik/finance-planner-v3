/* ==========================================================================
   Автоматический запуск миграции при старте приложения.
   ========================================================================== */
import { getFromStore, putIntoStore } from '../database/transaction.js';
import { migrateV7toV8 } from './migrateV7.js';

export async function runMigrationIfNeeded(db) {
  // Таблицы, которые нужно открыть в транзакции
  const stores = [
    'meta', 'goals', 'plannedIncomeItems', 'plannedExpenseItems', 
    'actualContributions', 'initialContributions', 'moneyLots', 'moneyEntries'
  ];
  
  const tx = db.transaction(stores, 'readwrite');

  // 1. Проверяем, не делали ли мы уже миграцию
  const migrationFlag = await getFromStore('meta', 'migration_v8_done', tx);
  if (migrationFlag) {
    return; // Миграция уже была выполнена ранее
  }

  // 2. Ищем старые данные в localStorage
  // Сканируем популярные ключи, чтобы наверняка найти данные
  let oldData = null;
  const possibleKeys = ['financeData', 'finance_planner_data', 'planner_data', 'budget_data', 'data'];
  
  for (const key of possibleKeys) {
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // Проверяем, что это действительно старый формат (есть цели или доходы)
        if (parsed.goals || parsed.monthlyIncomes || parsed.shortGoals) {
          oldData = parsed;
          break;
        }
      } catch (e) {
        console.warn(`[Migration] Ошибка парсинга ключа ${key}`, e);
      }
    }
  }

  // 3. Если старых данных нет, просто ставим флаг и выходим
  if (!oldData) {
    await putIntoStore('meta', { 
      id: 'migration_v8_done', 
      value: true, 
      at: new Date().toISOString() 
    }, tx);
    return;
  }

  // 4. Запускаем миграцию
  console.log('[Migration] Найдены старые данные, начинаем перенос...');
  
  try {
    const plan = migrateV7toV8(oldData);
    
    const saveItems = async (storeName, items) => {
      if (items && items.length > 0) {
        for (const item of items) await putIntoStore(storeName, item, tx);
      }
    };

    await saveItems('goals', plan.goals);
    await saveItems('plannedIncomeItems', plan.plannedIncomeItems);
    await saveItems('plannedExpenseItems', plan.plannedExpenseItems);
    await saveItems('actualContributions', plan.actualContributions);
    await saveItems('initialContributions', plan.initialContributions);
    await saveItems('moneyLots', plan.moneyLots);
    await saveItems('moneyEntries', plan.moneyEntries);

    // Ставим флаг успеха
    await putIntoStore('meta', { 
      id: 'migration_v8_done', 
      value: true, 
      at: new Date().toISOString() 
    }, tx);

    // 5. Удаляем старые данные, чтобы не мигрировать их снова
    for (const key of possibleKeys) {
      localStorage.removeItem(key);
    }

    console.log('[Migration] Миграция успешно завершена!');
  } catch (error) {
    console.error('[Migration] Ошибка миграции:', error);
    // Транзакция откатится автоматически, флаг не поставится
    throw error;
  }
}
