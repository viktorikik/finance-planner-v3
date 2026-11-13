/* ==========================================================================
   Автоматический запуск миграции при старте приложения.
   Порядок: v7→v8 (localStorage → IndexedDB) → v12→v13 (seed) → v13→v14 (sync-поля).
   Шаг v13→v14 устойчив к ошибкам: при падении bootstrap НЕ роняется.
   ========================================================================== */
import { getFromStore, putIntoStore } from '../database/transaction.js';
import { migrateV7toV8 } from './migrateV7.js';
import { planCategoriesSeed, planSettingsSeed } from './migrateV12toV13.js';
import { migrateV13toV14 } from './migrateV13toV14.js';

function awaitTx(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function runMigrationIfNeeded(db) {
  // === ШАГ 1 + 2: v7→v8 и v12→v13 ===
  {
    const stores = [
      'meta', 'goals',
      'actualContributions', 'initialContributions', 'moneyLots', 'moneyEntries',
      'categories', 'settings'
    ];
    const tx = db.transaction(stores, 'readwrite');

    const migrationFlag = await getFromStore('meta', 'migration_v8_done', tx);
    if (!migrationFlag) {
      let oldData = null;
      const possibleKeys = ['financeData', 'finance_planner_data', 'planner_data', 'budget_data', 'data'];

      for (const key of possibleKeys) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.goals || parsed.monthlyIncomes || parsed.shortGoals) {
              oldData = parsed;
              break;
            }
          } catch (e) {
            console.warn(`[Migration] Ошибка парсинга ключа ${key}`, e);
          }
        }
      }

      if (!oldData) {
        await putIntoStore('meta', { id: 'migration_v8_done', value: true, at: new Date().toISOString() }, tx);
      } else {
        console.log('[Migration] Найдены старые данные, начинаем перенос...');
        try {
          const plan = migrateV7toV8(oldData);
          const saveItems = async (storeName, items) => {
            if (items && items.length > 0) {
              for (const item of items) await putIntoStore(storeName, item, tx);
            }
          };

          await saveItems('goals', plan.goals);
          await saveItems('actualContributions', plan.actualContributions);
          await saveItems('initialContributions', plan.initialContributions);
          await saveItems('moneyLots', plan.moneyLots);
          await saveItems('moneyEntries', plan.moneyEntries);

          await putIntoStore('meta', { id: 'migration_v8_done', value: true, at: new Date().toISOString() }, tx);
          for (const key of possibleKeys) localStorage.removeItem(key);
          console.log('[Migration] Миграция успешно завершена!');
        } catch (error) {
          console.error('[Migration] Ошибка миграции:', error);
          throw error;
        }
      }
    }

    const seedV13Flag = await getFromStore('meta', 'seed_v13_done', tx);
    if (!seedV13Flag) {
      console.log('[Migration] Инициализация категорий и настроек...');

      const categories = planCategoriesSeed();
      for (const cat of categories) {
        await putIntoStore('categories', cat, tx);
      }

      const settings = planSettingsSeed();
      for (const set of settings) {
        await putIntoStore('settings', set, tx);
      }

      await putIntoStore('meta', { id: 'seed_v13_done', value: true, at: new Date().toISOString() }, tx);
      console.log('[Migration] Категории и настройки успешно добавлены.');
    }

    await awaitTx(tx);
  }

  // === ШАГ 3: v13 → v14 (устойчиво к падению) ===
  try {
    const flagTx = db.transaction(['meta'], 'readonly');
    const v14Flag = await getFromStore('meta', 'migration_v14_done', flagTx);
    await awaitTx(flagTx);

    if (!v14Flag) {
      console.log('[Migration] Добавление полей синхронизации (v13 → v14)...');
      await migrateV13toV14(db);

      const markTx = db.transaction(['meta'], 'readwrite');
      await putIntoStore('meta', {
        id: 'migration_v14_done',
        value: true,
        at: new Date().toISOString()
      }, markTx);
      await awaitTx(markTx);

      console.log('[Migration] Поля синхронизации добавлены.');
    }
  } catch (err) {
    // НЕ роняем bootstrap: приложение запустится, пусть и без sync-полей.
    // При следующем запуске миграция попробует снова.
    console.error('[Migration] Ошибка миграции v13→v14 (продолжаем без неё):', err);
  }
}
