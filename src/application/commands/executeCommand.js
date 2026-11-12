/* ==========================================================================
   Исполнитель команд.
   ========================================================================== */
import { getFromStore, getAllFromStore, putIntoStore } from '../../infrastructure/database/transaction.js';
import { STORES } from '../../infrastructure/database/dbSchema.js';
import { planContribution } from '../../domain/money/contributions.js';
import { planMoneyTransfer } from '../../domain/money/operations.js';
import { planMovementReversal } from '../../domain/money/reversals.js';
import { planPlannedOperationCreate } from '../../domain/planning/plannedOperations.js';
import { generatePlanForGoal } from '../../domain/planning/planGenerator.js';
import { planActualIncomeCreate } from '../../domain/money/actualIncomes.js';
import { planPlannedTransactionCreate, planPlannedTransactionUpdate } from '../../domain/budget/plannedTransactions.js';
import { planActualTransactionCreate } from '../../domain/budget/actualTransactions.js';
import { planCategoryCreate, planCategoryUpdate, validateCategoryDeletion } from '../../domain/categories/categories.js';
import { planSettingsUpdate } from '../../domain/settings/settings.js';
import { DuplicateCommandError, CategoryNotFoundError, DataClearError } from '../../domain/shared/errors.js';
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
    stores.push('actualContributions', 'moneyLots', 'moneyEntries', 'moneyMovements', 'actualIncomes', 'settings');
  }

  if (commandType.startsWith('plannedTransaction.')) {
    stores.push('plannedTransactions', 'actualTransactions'); 
  }

  if (commandType.startsWith('actualTransaction.')) {
    stores.push('actualTransactions');
  }

  if (commandType.startsWith('category.')) {
    stores.push('categories', 'plannedTransactions', 'actualTransactions');
  }

  if (commandType === 'settings.update') {
    stores.push('settings');
  }

  if (commandType === 'data.clearFinancials' || commandType === 'data.factoryReset') {
    stores = [...new Set([...stores, ...Object.keys(STORES)])];
  }

  // Защита от дублирования таблиц в транзакции
  stores = [...new Set(stores)];

  const tx = db.transaction(stores, 'readwrite');

  try {
    const existingCommand = await getFromStore('processedCommands', commandId, tx);
    if (existingCommand) throw new DuplicateCommandError(`Команда ${commandId} уже выполнена`);

    let plan = { 
      newEntries: [], newMovements: [], newGoals: [], newPlannedOperations: [], 
      newActualIncomes: [], updatedEntries: [], updatedMovements: [], 
      newPlannedTransactions: [], newActualTransactions: [],
      newCategories: [], newSettings: []
    };
    let state = null;

    if (['money.transfer', 'money.reverse', 'goal.delete', 'goal.achieve'].includes(commandType)) {
      state = {
        moneyLots: await getAllFromStore('moneyLots', tx),
        moneyEntries: await getAllFromStore('moneyEntries', tx),
        moneyMovements: await getAllFromStore('moneyMovements', tx)
      };
    }

    if (commandType === 'category.delete') {
      state = {
        plannedTransactions: await getAllFromStore('plannedTransactions', tx),
        actualTransactions: await getAllFromStore('actualTransactions', tx)
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
        const newGoal = {
          id: generateId(), status: 'active', name: payload.name,
          targetAmountMinor: Math.round(payload.targetAmountMinor),
          category: payload.category || 'long',
          startMonth: payload.startMonth || new Date().toISOString().slice(0, 7),
          deadlineMonth: payload.deadlineMonth || null,
          annualRate: payload.annualRate !== undefined ? payload.annualRate : null,
          individualInflationRate: payload.individualInflationRate !== undefined ? payload.individualInflationRate : null,
          indexationEnabled: payload.indexationEnabled || false,
          indexationRate: payload.indexationRate || 0,
          planMode: payload.planMode || 'auto',
          manualMonthlyAmountMinor: payload.manualMonthlyAmountMinor || null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        };
        plan = { newGoals: [newGoal] };
        break;
      case 'goal.updateSettings':
        const goalToUpdate = await getFromStore('goals', payload.goalId, tx);
        if (!goalToUpdate) throw new Error('Цель не найдена');
        const updatedGoalSettings = {
          ...goalToUpdate,
          startMonth: payload.startMonth !== undefined ? payload.startMonth : goalToUpdate.startMonth,
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
        
        const settingsReq = tx.objectStore('settings').get('generalInflationRate');
        const generalInflationSetting = await new Promise((resolve) => {
           settingsReq.onsuccess = () => resolve(settingsReq.result ? settingsReq.result.value : 5);
           settingsReq.onerror = () => resolve(5);
        });
        plan = generatePlanForGoal(goalForGen, currentBalance, payload.currentMonth, generalInflationSetting);
        break;
      case 'plannedOperation.delete':
        await new Promise((resolve, reject) => {
          const req = tx.objectStore('plannedOperations').delete(payload.operationId);
          req.onsuccess = resolve; req.onerror = () => reject(req.error);
        });
        break;
      case 'plannedOperation.clearForGoal':
        const allOpsForGoal = await getAllFromStore('plannedOperations', tx);
        const opsToDelete = allOpsForGoal.filter(op => op.goalId === payload.goalId);
        for (const op of opsToDelete) {
          await new Promise((resolve, reject) => {
            const req = tx.objectStore('plannedOperations').delete(op.id);
            req.onsuccess = resolve; req.onerror = () => reject(req.error);
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
          req.onsuccess = resolve; req.onerror = () => reject(req.error);
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
        const allFactsToUnlink = await getAllFromStore('actualTransactions', tx);
        const linkedFacts = allFactsToUnlink.filter(f => f.plannedTransactionId === payload.id);
        for (const fact of linkedFacts) {
          await putIntoStore('actualTransactions', { ...fact, plannedTransactionId: null }, tx);
        }
        await new Promise((resolve, reject) => {
          const req = tx.objectStore('plannedTransactions').delete(payload.id);
          req.onsuccess = resolve; req.onerror = () => reject(req.error);
        });
        break;
      case 'actualTransaction.create':
        plan = planActualTransactionCreate(payload);
        break;
      case 'actualTransaction.delete':
        await new Promise((resolve, reject) => {
          const req = tx.objectStore('actualTransactions').delete(payload.id);
          req.onsuccess = resolve; req.onerror = () => reject(req.error);
        });
        break;

      case 'settings.update':
        const newSetting = planSettingsUpdate(payload.id, payload.value);
        plan.newSettings.push(newSetting);
        break;
      
      case 'category.create':
        const newCat = planCategoryCreate(payload);
        plan.newCategories.push(newCat);
        break;
      
      case 'category.update':
        const existingCat = await getFromStore('categories', payload.id, tx);
        if (!existingCat) throw new CategoryNotFoundError();
        plan.newCategories.push(planCategoryUpdate(existingCat, payload));
        break;
      
      case 'category.delete':
        const catToDelete = await getFromStore('categories', payload.id, tx);
        if (!catToDelete) throw new CategoryNotFoundError();
        validateCategoryDeletion(catToDelete, state);
        await new Promise((resolve, reject) => {
          const req = tx.objectStore('categories').delete(payload.id);
          req.onsuccess = resolve; req.onerror = () => reject(req.error);
        });
        break;

      case 'data.clearFinancials': {
        const financialStores = [
          'goals', 'plannedOperations', 'plannedTransactions', 'actualTransactions',
          'actualIncomes', 'actualContributions', 'initialContributions', 'investmentIncomes',
          'moneyLots', 'moneyMovements', 'moneyEntries', 'pool', 'parameterHistory', 'auditLog'
        ];
        for (const store of financialStores) {
          await new Promise((resolve, reject) => {
            const req = tx.objectStore(store).clear();
            req.onsuccess = resolve; req.onerror = () => reject(req.error);
          });
        }
        break;
      }
      
      case 'data.factoryReset': {
        const allStores = Object.keys(STORES).filter(s => s !== 'processedCommands');
        for (const store of allStores) {
          await new Promise((resolve, reject) => {
            const req = tx.objectStore(store).clear();
            req.onsuccess = resolve; req.onerror = () => reject(req.error);
          });
        }
        
        const { planCategoriesSeed, planSettingsSeed } = await import('../../infrastructure/migration/migrateV12toV13.js');
        const defaultCats = planCategoriesSeed();
        for (const cat of defaultCats) await putIntoStore('categories', cat, tx);
        
        const defaultSets = planSettingsSeed();
        for (const set of defaultSets) await putIntoStore('settings', set, tx);
        break;
      }

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
    await saveItems('actualTransactions', plan.newActualTransactions);
    await saveItems('categories', plan.newCategories);
    await saveItems('settings', plan.newSettings);

    await putIntoStore('processedCommands', {
      commandId, commandType, committedAt: new Date().toISOString(), resultHash: 'dummy-hash'
    }, tx);

    return { success: true, data: plan };

  } catch (error) {
    try { tx.abort(); } catch (e) {} 
    throw error;
  }
}
