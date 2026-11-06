/* ==========================================================================
   Исполнитель команд.
   Связывает доменную логику (compute-then-commit) с базой данных.
   Обеспечивает атомарность и идемпотентность.
   ========================================================================== */
import { getFromStore, getAllFromStore, putIntoStore } from '../../infrastructure/database/transaction.js';
import { planContribution } from '../../domain/money/contributions.js';
import { planMoneyTransfer } from '../../domain/money/operations.js';
import { planMovementReversal } from '../../domain/money/reversals.js';
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

  // 1. Определяем, какие stores нужны. 
  // Для безопасности открываем все основные денежные stores.
  const stores = [
    'actualContributions', 
    'moneyLots', 
    'moneyEntries', 
    'moneyMovements', 
    'processedCommands', 
    'auditLog'
  ];
  
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
    const state = {
      moneyLots: await getAllFromStore('moneyLots', tx),
      moneyEntries: await getAllFromStore('moneyEntries', tx),
      moneyMovements: await getAllFromStore('moneyMovements', tx)
    };

    let plan;
    let entityType = 'unknown';

    // 5. Маршрутизация команд
    switch (commandType) {
      case 'contribution.create':
        plan = planContribution(payload);
        entityType = 'contribution';
        break;
      case 'money.transfer':
        plan = planMoneyTransfer(payload, state);
        entityType = 'movement';
        break;
      case 'money.reverse':
        plan = planMovementReversal(payload.movementId, state);
        entityType = 'movement';
        break;
      default:
        throw new Error(`Неизвестный тип команды: ${commandType}`);
    }

    // 6. Применение плана (сохранение в БД)
    // Вспомогательная функция для сохранения массивов
    const saveItems = async (storeName, items) => {
      if (items && items.length > 0) {
        for (const item of items) {
          await putIntoStore(storeName, item, tx);
        }
      }
    };

    // Сохраняем новые записи
    await saveItems('actualContributions', plan.newContributions);
    await saveItems('moneyLots', plan.newLots);
    await saveItems('moneyEntries', plan.newEntries);
    await saveItems('moneyMovements', plan.newMovements);

    // Обновляем существующие записи
    await saveItems('moneyEntries', plan.updatedEntries);
    await saveItems('moneyMovements', plan.updatedMovements);

    // 7. Проверка инвариантов (можно добавить проверку стейта после применения плана)
    // checkInvariants({ ...state, moneyEntries: [...state.moneyEntries, ...(plan.newEntries || [])] });

    // 8. Отмечаем команду как выполненную
    await putIntoStore('processedCommands', {
      commandId: commandId,
      commandType: commandType,
      committedAt: new Date().toISOString(),
      resultHash: 'dummy-hash-for-now'
    }, tx);

    // 9. Записываем в аудит-лог
    await putIntoStore('auditLog', {
      id: crypto.randomUUID(),
      eventType: 'command.completed',
      entityType: entityType,
      entityId: commandId,
      occurredAt: new Date().toISOString(),
      details: { commandType }
    }, tx);

    // 10. Возвращаем успех
    return { success: true, data: plan };

  } catch (error) {
    // При любой ошибке транзакция откатывается автоматически
    try { tx.abort(); } catch (e) {} 
    throw error;
  }
}
