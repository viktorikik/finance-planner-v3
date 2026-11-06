/* ==========================================================================
   Исполнитель команд.
   ========================================================================== */
import { getFromStore, getAllFromStore, putIntoStore } from '../../infrastructure/database/transaction.js';
import { planContribution } from '../../domain/money/contributions.js';
import { planMoneyTransfer } from '../../domain/money/operations.js';
import { planMovementReversal } from '../../domain/money/reversals.js';
import { planGoalCreate } from '../../domain/planning/goals.js';
import { planPlannedOperationCreate } from '../../domain/planning/plannedOperations.js';
import { DuplicateCommandError } from '../../domain/shared/errors.js';
import { calculateGoalBalance } from '../../domain/statistics/balances.js';

export async function executeCommand(db, command) {
  const { commandId, commandType, payload } = command;

  let stores = ['processedCommands', 'auditLog'];
  
  if (commandType.startsWith('contribution') || commandType === 'money.transfer' || commandType === 'money.reverse' || commandType === 'goal.delete') {
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

    let plan = { newEntries: [], newMovements: [] }; // Дефолтный пустой план
    let entityType = 'unknown';
    let entityId = null;

    // Загружаем состояние для команд, которым нужны деньги
    let state = null;
    if (['money.transfer', 'money.reverse', 'goal.delete'].includes(commandType)) {
      state = {
        moneyLots: await getAllFromStore('moneyLots', tx),
        moneyEntries: await getAllFromStore('moneyEntries', tx),
        moneyMovements: await getAllFromStore('moneyMovements', tx)
      };
    }

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
      case 'goal.delete':
        entityType = 'goal';
        entityId = payload.goalId;
        
        const goalToDelete = await getFromStore('goals', payload.goalId, tx);
        if (!goalToDelete) throw new Error('Цель не найдена');

        // Считаем баланс цели. Если он > 0, переводим в пул.
        const balance = calculateGoalBalance(payload.goalId, state.moneyEntries);
        if (balance > 0) {
          const transferPlan = planMoneyTransfer({
            from: { type: 'goal', id: payload.goalId },
            to: { type: 'pool', id: 'main' },
            amountMinor: balance,
            actualDate: new Date().toISOString().slice(0, 10),
            movementType: 'goalToPool'
          }, state);
          
          plan.newEntries = plan.newEntries.concat(transferPlan.newEntries);
          plan.newMovements = plan.newMovements.concat(transferPlan.newMovements);
        }

        // Физически удаляем цель из базы
        await new Promise((resolve, reject) => {
          const req = tx.objectStore('goals').delete(payload.goalId);
          req.onsuccess = resolve;
          req.onerror = () => reject(req.error);
        });
        break;
      case 'plannedOperation.create':
        plan = planPlannedOperationCreate(payload);
        entityType = 'plannedOperation';
        entityId = plan.newPlannedOperations[0].id;
        break;
      default:
        throw new Error(`Неизвестный тип: ${commandType}`);
    }

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

    return { success: true, data: plan };

  } catch (error) {
    try { tx.abort(); } catch (e) {} 
    throw error;
  }
}
