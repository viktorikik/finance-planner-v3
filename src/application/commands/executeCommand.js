/* ==========================================================================
   Исполнитель команд.
   Связывает доменную логику с базой данных IndexedDB.
   ========================================================================== */
import { getFromStore, getAllFromStore, putIntoStore } from '../../infrastructure/database/transaction.js';
import { planContribution } from '../../domain/money/contributions.js';
import { planMoneyTransfer } from '../../domain/money/operations.js';
import { planMovementReversal } from '../../domain/money/reversals.js';
import { planGoalCreate } from '../../domain/planning/goals.js';
import { planPlannedOperationCreate } from '../../domain/planning/plannedOperations.js';
import { DuplicateCommandError } from '../../domain/shared/errors.js';

export async function executeCommand(db, command) {
  const { commandId, commandType, payload } = command;

  // Определяем stores в зависимости от команды
  let stores = ['processedCommands', 'auditLog'];
  
  if (commandType.startsWith('contribution') || commandType === 'money.transfer' || commandType === 'money.reverse') {
    stores.push('actualContributions', 'moneyLots', 'moneyEntries', 'moneyMovements');
  }
  if (commandType.startsWith('goal') || commandType === 'plannedOperation.create') {
    stores.push('goals', 'plannedOperations');
  }

  const tx = db.transaction(stores, 'readwrite');

  try {
    const existingCommand = await getFromStore('processedCommands', commandId, tx);
    if (existingCommand) {
      tx.abort();
      throw new DuplicateCommandError(`Команда ${commandId} уже выполнена`);
    }

    let plan;
    let entityType = 'unknown';
    let entityId = null;

    // Загружаем стейт, если нужно
    let state = null;
    if (commandType === 'money.transfer' || commandType === 'money.reverse') {
      state = {
        moneyLots: await getAllFromStore('moneyLots', tx),
        moneyEntries: await getAllFromStore('moneyEntries', tx),
        moneyMovements: await getAllFromStore('moneyMovements', tx)
      };
    }

    // Маршрутизация
    switch (commandType) {
      case 'contribution.create':
        plan = planContribution(payload);
        entityType = 'contribution';
        entityId = plan.newContributions[0].id;
        break;
      case 'money.transfer':
        plan = planMoneyTransfer(payload, state);
        entityType = 'movement';
        entityId = plan.newMovements[0].id;
        break;
      case 'money.reverse':
        plan = planMovementReversal(payload.movementId, state);
        entityType = 'movement';
        entityId = payload.movementId;
        break;
      case 'goal.create':
        plan = planGoalCreate(payload);
        entityType = 'goal';
        entityId = plan.newGoals[0].id;
        break;
      case 'plannedOperation.create':
        plan = planPlannedOperationCreate(payload);
        entityType = 'plannedOperation';
        entityId = plan.newPlannedOperations[0].id;
        break;
      default:
        throw new Error(`Неизвестный тип: ${commandType}`);
    }

    // Сохранение
    const saveItems = async (storeName, items) => {
      if (items && items.length > 0) {
        for (const item of items) await putIntoStore(storeName, item, tx);
      }
    };

    await saveItems('actualContributions', plan.newContributions);
    await saveItems('moneyLots', plan.newLots);
    await saveItems('moneyEntries', plan.newEntries);
    await saveItems('moneyMovements', plan.newMovements);
    await saveItems('moneyEntries', plan.updatedEntries);
    await saveItems('moneyMovements', plan.updatedMovements);
    await saveItems('goals', plan.newGoals);
    await saveItems('plannedOperations', plan.newPlannedOperations);

    await putIntoStore('processedCommands', {
      commandId,
      commandType,
      committedAt: new Date().toISOString(),
      resultHash: 'dummy-hash'
    }, tx);

    await putIntoStore('auditLog', {
      id: crypto.randomUUID(),
      eventType: 'command.completed',
      entityType,
      entityId,
      occurredAt: new Date().toISOString(),
      details: { commandType }
    }, tx);

    return { success: true, data: plan };

  } catch (error) {
    try { tx.abort(); } catch (e) {} 
    throw error;
  }
}
