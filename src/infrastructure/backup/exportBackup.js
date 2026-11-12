/* ==========================================================================
   Утилита для экспорта и импорта всей базы данных (Бэкап).
   ========================================================================== */
import { STORES, DB_VERSION } from '../database/dbSchema.js';
import { getAllFromStore, putIntoStore } from '../database/transaction.js';
import { InvalidBackupError } from '../../domain/shared/errors.js';
import { planCategoriesSeed, planSettingsSeed } from '../migration/migrateV12toV13.js';

export async function generateBackup(db) {
  const backup = {
    version: DB_VERSION, // Теперь пишется реальная версия 13
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

export async function restoreBackup(db, backup) {
  if (!backup || typeof backup !== 'object' || !backup.version) {
    throw new InvalidBackupError('Неверный формат файла бэкапа: отсутствует версия или структура.');
  }

  if (backup.version > DB_VERSION) {
    throw new InvalidBackupError(`Файл создан в более новой версии приложения (v${backup.version}). Пожалуйста, обновите приложение.`);
  }

  // Если версия старая (например, 8), мы можем безопасно загрузить данные,
  // а затем прогнать сидинг для новых таблиц, которых нет в старом бэкапе.
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
    const items = backup.data?.[storeName] || [];
    for (const item of items) {
      await putIntoStore(storeName, item, tx);
    }
  }

  // 3. Проверяем, были ли восстановлены категории и настройки.
  // Если бэкап старый (v8-v12), их не будет. Восстанавливаем дефолт (Q4 - вариант b).
  if (!backup.data?.categories || backup.data.categories.length === 0) {
    console.log('[Restore] В бэкапе нет категорий. Восстанавливаем дефолтные...');
    const cats = planCategoriesSeed();
    for (const cat of cats) await putIntoStore('categories', cat, tx);
  }
  
  if (!backup.data?.settings || backup.data.settings.length === 0) {
    const sets = planSettingsSeed();
    for (const set of sets) await putIntoStore('settings', set, tx);
  }

  // Устанавливаем флаги миграции, чтобы они не запустились повторно при следующем старте
  const now = new Date().toISOString();
  await putIntoStore('meta', { id: 'migration_v8_done', value: true, at: now }, tx);
  await putIntoStore('meta', { id: 'seed_v13_done', value: true, at: now }, tx);
}
