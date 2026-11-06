/* ==========================================================================
   Исполнитель команд.
   ========================================================================== */
import { getFromStore, getAllFromStore, putIntoStore } from '../../infrastructure/database/transaction.js';
import { planContribution } from '../../domain/money/contributions.js';
import { planMoneyTransfer } from '../../domain/money/operations.js';
import { planMovementReversal } from '../../domain/money/reversals.js';
import { planGoalCreate } from '../../domain/planning/goals.js';
import { planPlannedOperationCreate } from '../../domain/planning/plannedOperations.js';
import { generatePlanForGoal } from '../../domain/planning/planGenerator.js'; // <-- НОВЫЙ ИМПОРТ
import { DuplicateCommandError } from '../../domain/shared/errors.js';
import { calculateGoalBalance } from '../../domain/statistics/balances.js';
import { calculatePositionBalance } from '../../domain/money/moneyPositions.js';
import { generateId } from '../../domain/shared/ids.js';

function burnGoalMoney(goalId, moneyEntries) {
  const newEntries = [];
  const now = new Date().toISOString();
  const goalPositions = [...new Set(moneyEntries.filter(e => e.entryType === 'credit' && e.locationType === 'goal' && e.locationId === goalId).map(e => e.positionId))];
  for (const posId of goalPositions) {
    const balance = calculatePositionBalance(posId, moneyEntries);
    if (balance > 0) {
      const posEntry = moneyEntries.find(e => e.positionId === posId && e.entryType === 'credit');
      newEntries.push({
        id: generateId(), entryType: 'debit', locationType: 'goal', locationId: goalId,
        amountMinor: balance, consumesPositionId: posId, moneyLotId: posEntry.moneyLotId,
        sourceRecordType: 'achievement', sourceRecordId: goalId, entryStatus: 'active',
        effectiveReceivedAt: now, createdAt: now
      });
    }
  }
  return newEntries;
}

export async function executeCommand(db, command) {
  const { commandId, commandType, payload } = command;

  let stores = ['processedCommands', 'auditLog', 'goals', 'plannedOperations'];
  
  if (commandType.startsWith('contribution') || commandType === 'money.transfer' || commandType === 'money.reverse' || commandType === 'goal.delete' || commandType === 'goal.achieve') {
    stores.push('actualContributions', 'moneyLots', 'moneyEntries', 'moneyMovements');
  }

  const tx = db.transaction(stores, 'readwrite');

  try {
    const existingCommand = await getFromStore('processedCommands', commandId, tx);
    if (existingCommand) throw new DuplicateCommandError(`Команда ${commandId} уже выполнена`);

    let plan = { newEntries: [], newMovements: [], newGoals: [], newPlannedOperations: [] };
    let entityType = 'unknown';
    let entityId = null;
    let state = null;

    if (['money.transfer', 'money.reverse', 'goal.delete', 'goal.achieve'].includes(commandType)) {
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
      case 'plannedOperation.create':
        plan = planPlannedOperationCreate(payload);
        entityType = 'plannedOperation';
        entityId = plan.newPlannedOperations[0].id;
        break;
      
      // НОВОЕ: Пакетная генерация плана
      case 'plannedOperation.generate':
        const goalForGen = await getFromStore('goals', payload.goalId, tx);
        if (!goalForGen) throw new Error('Цель не найдена');
        // Получаем текущий баланс цели
        const allEntries = await getAllFromStore('moneyEntries', tx);
        const currentBalance = calculateGoalBalance(goalForGen.id, allEntries);
        
        plan = generatePlanForGoal(goalForGen, currentBalance, payload.currentMonth);
        entityType = 'plannedOperations_batch';
        entityId = payload.goalId;
        break;

      // НОВОЕ: Удаление плановой операции
      case 'plannedOperation.delete':
        entityType = 'plannedOperation';
        entityId = payload.operationId;
        await new Promise((resolve, reject) => {
          const req = tx.objectStore('plannedOperations').delete(payload.operationId);
          req.onsuccess = resolve;
          req.onerror = () => reject(req.error);
        });
        break;

      case 'goal.achieve':
        entityType = 'goal';
        entityId = payload.goalId;
        const goalToAchieve = await getFromStore('goals', payload.goalId, tx);
        if (!goalToAchieve) throw new Error('Цель не найдена');
        plan.newEntries = burnGoalMoney(payload.goalId, state.moneyEntries);
        const updatedGoal = { ...goalToAchieve, status: 'achieved', achievedAt: new Date().toISOString().slice(0, 10) };
        plan.newGoals.push(updatedGoal);
        break;
      case 'goal.delete':
        entityType = 'goal';
        entityId = payload.goalId;
        const goalToDelete = await getFromStore('goals', payload.goalId, tx);
        if (!goalToDelete) throw new Error('Цель не найдена');
        const balance = calculateGoalBalance(payload.goalId, state.moneyEntries);
        if (balance > 0) {
          if (payload.moveToPool) {
            const transferPlan = planMoneyTransfer({
              from: { type: 'goal', id: payload.goalId }, to: { type: 'pool', id: 'main' },
              amountMinor: balance, actualDate: new Date().toISOString().slice(0, 10), movementType: 'goalToPool'
            }, state);
            plan.newEntries = plan.newEntries.concat(transferPlan.newEntries);
            plan.newMovements = plan.newMovements.concat(transferPlan.newMovements);
          } else {
            plan.newEntries = burnGoalMoney(payload.goalId, state.moneyEntries);
          }
        }
        await new Promise((resolve, reject) => {
          const req = tx.objectStore('goals').delete(payload.goalId);
          req.onsuccess = resolve;
          req.onerror = () => reject(req.error);
        });
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
    await saveItems('goals', plan.newGoals);
    await saveItems('plannedOperations', plan.newPlannedOperations);

    await putIntoStore('processedCommands', {
      commandId, commandType, committedAt: new Date().toISOString(), resultHash: 'dummy-hash'
    }, tx);

    return { success: true, data: plan };

  } catch (error) {
    try { tx.abort(); } catch (e) {} 
    throw error;
  }
}
