/* ==========================================================================
   Исполнитель команд.
   ========================================================================== */
import { getFromStore, getAllFromStore, putIntoStore } from '../../infrastructure/database/transaction.js';
import { planContribution } from '../../domain/money/contributions.js';
import { planMoneyTransfer } from '../../domain/money/operations.js';
import { planMovementReversal } from '../../domain/money/reversals.js';
import { planGoalCreate } from '../../domain/planning/goals.js';
import { planPlannedOperationCreate } from '../../domain/planning/plannedOperations.js';
import { generatePlanForGoal } from '../../domain/planning/planGenerator.js';
import { planActualIncomeCreate } from '../../domain/money/actualIncomes.js';
import { planPlannedTransactionCreate, planPlannedTransactionUpdate } from '../../domain/budget/plannedTransactions.js';
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
  
  if (
    commandType.startsWith('contribution') || 
    commandType === 'money.transfer' || 
    commandType === 'money.reverse' || 
    commandType === 'goal.delete' || 
    commandType === 'goal.achieve' ||
    commandType === 'plannedOperation.generate' ||
    commandType === 'actualIncome.create'
  ) {
    stores.push('actualContributions', 'moneyLots', 'moneyEntries', 'moneyMovements', 'actualIncomes');
  }

  if (commandType.startsWith('plannedTransaction.')) {
    stores.push('plannedTransactions');
  }

  const tx = db.transaction(stores, 'readwrite');

  try {
    const existingCommand = await getFromStore('processedCommands', commandId, tx);
    if (existingCommand) throw new DuplicateCommandError(`Команда ${commandId} уже выполнена`);

    let plan = { 
      newEntries: [], newMovements: [], newGoals: [], newPlannedOperations: [], 
      newActualIncomes: [], updatedEntries: [], updatedMovements: [], newPlannedTransactions: []
    };
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
        break;
      case 'actualIncome.create':
        plan = planActualIncomeCreate(payload);
        break;
      case 'money.transfer':
        plan = planMoneyTransfer(payload, state);
        break;
      case 'money.reverse':
        plan = planMovementReversal(payload.movementId, state);
        break;
      case 'goal.create':
        plan = planGoalCreate(payload);
        break;
      
      case 'goal.updateSettings':
        const goalToUpdate = await getFromStore('goals', payload.goalId, tx);
        if (!goalToUpdate) throw new Error('Цель не найдена');
        
        const updatedGoalSettings = {
          ...goalToUpdate,
          deadlineMonth: payload.deadlineMonth !== undefined ? payload.deadlineMonth : goalToUpdate.deadlineMonth,
          annualRate: payload.annualRate !== undefined ? payload.annualRate : goalToUpdate.annualRate,
          individualInflationRate: payload.individualInflationRate !== undefined ? payload.individualInflationRate : goalToUpdate.individualInflationRate,
          indexationEnabled: payload.indexationEnabled !== undefined ? payload.indexationEnabled : (goalToUpdate.indexationEnabled || false),
          indexationRate: payload.indexationRate !== undefined ? payload.indexationRate : (goalToUpdate.indexationRate || 0),
          planMode: payload.planMode !== undefined ? payload.planMode : (goalToUpdate.planMode || 'auto'),
          manualMonthlyAmountMinor: payload.manualMonthlyAmountMinor !== undefined ? payload.manualMonthlyAmountMinor : goalToUpdate.manualMonthlyAmountMinor,
          updatedAt: new Date().toISOString()
        };
        plan.newGoals.push(updatedGoalSettings);
        break;

      case 'plannedOperation.create':
        plan = planPlannedOperationCreate(payload);
        break;
      case 'plannedOperation.generate':
        const goalForGen = await getFromStore('goals', payload.goalId, tx);
        if (!goalForGen) throw new Error('Цель не найдена');
        const allEntries = await getAllFromStore('moneyEntries', tx);
        const currentBalance = calculateGoalBalance(goalForGen.id, allEntries);
        plan = generatePlanForGoal(goalForGen, currentBalance, payload.currentMonth);
        break;
      case 'plannedOperation.delete':
        await new Promise((resolve, reject) => {
          const req = tx.objectStore('plannedOperations').delete(payload.operationId);
          req.onsuccess = resolve;
          req.onerror = () => reject(req.error);
        });
        break;
      case 'plannedOperation.clearForGoal':
        const allOpsForGoal = await getAllFromStore('plannedOperations', tx);
        const opsToDelete = allOpsForGoal.filter(op => op.goalId === payload.goalId);
        for (const op of opsToDelete) {
          await new Promise((resolve, reject) => {
            const req = tx.objectStore('plannedOperations').delete(op.id);
            req.onsuccess = resolve;
            req.onerror = () => reject(req.error);
          });
        }
        break;
      case 'goal.achieve':
        const goalToAchieve = await getFromStore('goals', payload.goalId, tx);
        if (!goalToAchieve) throw new Error('Цель не найдена');
        plan.newEntries = burnGoalMoney(payload.goalId, state.moneyEntries);
        plan.newGoals.push({ ...goalToAchieve, status: 'achieved', achievedAt: new Date().toISOString().slice(0, 10) });
        break;
      case 'goal.delete':
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

      case 'plannedTransaction.create':
        plan = planPlannedTransactionCreate(payload);
        break;
      
      case 'plannedTransaction.update':
        const existingTx = await getFromStore('plannedTransactions', payload.id, tx);
        if (!existingTx) throw new Error('Транзакция не найдена');
        plan = planPlannedTransactionUpdate(payload, existingTx);
        break;
      
      case 'plannedTransaction.delete':
        await new Promise((resolve, reject) => {
          const req = tx.objectStore('plannedTransactions').delete(payload.id);
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
    await saveItems('actualIncomes', plan.newActualIncomes);
    await saveItems('moneyLots', plan.newLots);
    await saveItems('moneyEntries', plan.newEntries);
    await saveItems('moneyMovements', plan.newMovements);
    await saveItems('moneyEntries', plan.updatedEntries);
    await saveItems('moneyMovements', plan.updatedMovements);
    await saveItems('goals', plan.newGoals);
    await saveItems('plannedOperations', plan.newPlannedOperations);
    await saveItems('plannedTransactions', plan.newPlannedTransactions);

    await putIntoStore('processedCommands', {
      commandId, commandType, committedAt: new Date().toISOString(), resultHash: 'dummy-hash'
    }, tx);

    return { success: true, data: plan };

  } catch (error) {
    try { tx.abort(); } catch (e) {} 
    throw error;
  }
}
