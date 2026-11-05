/* ==========================================================================
   Исполнитель команд.
   Связывает доменную логику (compute-then-commit) с базой данных.
   Обеспечивает атомарность и идемпотентность.
   ========================================================================== */
import { getFromStore, getAllFromStore, putIntoStore } from '../../infrastructure/database/transaction.js';
import { planContribution } from '../../domain/money/contributions.js';
import { checkInvariants } from '../../domain/validation/invariants.js';
import { DuplicateCommandError } from '../../domain/shared/errors.js';

/**
 * Выполняет бизнес-команду в транзакции IndexedDB.
 * 
 * @param {IDBDatabase} db - Экземпляр базы данных
 * @param {Object} command - { commandId, commandType, payload }
 */
export async function executeCommand(db, command) {
  const { commandId, commandType, payload } = command;

  // 1. Определяем, какие stores нужны для этой команды
  // Для создания взноса нужны: actualContributions, moneyLots, moneyEntries, processedCommands, auditLog
  const stores = ['actualContributions', 'moneyLots', 'moneyEntries', 'processedCommands', 'auditLog'];
  
  // 2. Открываем одну транзакцию на чтение и запись для всех этих stores
  const tx = db.transaction(stores, 'readwrite');

  try {
    // 3. Проверка идемпотентности (защита от двойного клика)
    const existingCommand = await getFromStore('processedCommands', commandId, tx);
    if (existingCommand) {
      tx.abort();
      throw new DuplicateCommandError(`Команда ${commandId} уже была выполнена`);
    }

    // 4. Загружаем необходимый стейт для доменной функции
    // В реальном приложении мы бы использовали индексы, чтобы загрузить только нужное.
    // Для простоты на этом этапе загружаем все.
    const state = {
      moneyLots: await getAllFromStore('moneyLots', tx),
      moneyEntries: await getAllFromStore('moneyEntries', tx)
    };

    let plan;

    // 5. Маршрутизация команд (пока только одна)
    if (commandType === 'contribution.create') {
      plan = planContribution(payload);
    } else {
      throw new Error(`Неизвестный тип команды: ${commandType}`);
    }

    // 6. Проверка инвариантов ДО записи (с учетом планируемых изменений)
    // (В полноценной версии мы бы "примеряли" plan к state, но пока проверим только текущий state)
    checkInvariants(state);

    // 7. Применение плана (сохранение в БД)
    // Сохраняем взносы
    if (plan.newContributions) {
      for (const item of plan.newContributions) {
        await putIntoStore('actualContributions', item, tx);
      }
    }
    // Сохраняем партии
    if (plan.newLots) {
      for (const item of plan.newLots) {
        await putIntoStore('moneyLots', item, tx);
      }
    }
    // Сохраняем записи журнала
    if (plan.newEntries) {
      for (const item of plan.newEntries) {
        await putIntoStore('moneyEntries', item, tx);
      }
    }

    // 8. Отмечаем команду как выполненную
    await putIntoStore('processedCommands', {
      commandId: commandId,
      commandType: commandType,
      committedAt: new Date().toISOString(),
      resultHash: 'dummy-hash-for-now' // В будущем здесь будет хеш payload
    }, tx);

    // 9. Записываем в аудит-лог
    await putIntoStore('auditLog', {
      id: crypto.randomUUID(),
      eventType: 'command.completed',
      entityType: 'contribution',
      entityId: plan.newContributions[0].id,
      occurredAt: new Date().toISOString(),
      details: { commandType }
    }, tx);

    // 10. Завершаем транзакцию (IndexedDB сделает это автоматически при отсутствии ошибок)
    return { success: true, data: plan };

  } catch (error) {
    // При любой ошибке транзакция откатывается автоматически
    try { tx.abort(); } catch (e) {} // Игнорируем ошибку, если транзакция уже закрыта
    throw error;
  }
}
