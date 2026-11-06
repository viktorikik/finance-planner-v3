/* ==========================================================================
   Экспорт резервной копии.
   Собирает все данные из IndexedDB в единый JSON-объект.
   ========================================================================== */
import { getAllFromStore } from '../database/transaction.js';
import { DB_VERSION } from '../database/dbSchema.js';

/**
 * Генерирует объект резервной копии.
 * 
 * @param {IDBDatabase} db - Экземпляр базы данных
 * @param {string} appVersion - Версия приложения
 * @returns {Promise<Object>} - Готовый объект для сохранения в файл
 */
export async function generateBackup(db, appVersion = '3.0.0') {
  // Список всех таблиц, которые нужно сохранить
  const storesToBackup = [
    'goals', 'plannedOperations', 'plannedIncomeItems', 'plannedExpenseItems',
    'actualIncomes', 'actualContributions', 'initialContributions', 'investmentIncomes',
    'moneyLots', 'moneyMovements', 'moneyEntries',
    'pool', 'parameterHistory', 'auditLog', 'processedCommands', 'settings', 'meta'
  ];

  const tx = db.transaction(storesToBackup, 'readonly');
  const data = {};

  for (const storeName of storesToBackup) {
    data[storeName] = await getAllFromStore(storeName, tx);
  }

  return {
    format: 'finance-planner-backup',
    schemaVersion: DB_VERSION,
    appVersion: appVersion,
    exportedAt: new Date().toISOString(),
    data
  };
}
