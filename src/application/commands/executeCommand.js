/* ==========================================================================
   Исполнитель команд.
   - С Батча 2: сохранения и удаления проходят через saveWithSync/deleteWithSync.
   - С Батча 3-fix: saveItems использует Promise.all, чтобы все get стартовали
     параллельно — это критично для Safari/iPhone (транзакция не успевает
     закрыться между последовательными await).
   - Добавлен обработчик actualIncome.delete.
   ========================================================================== */
import { getFromStore, getAllFromStore, putIntoStore } from '../../infrastructure/database/transaction.js';
import { STORES } from '../../infrastructure/database/dbSchema.js';
import { saveWithSync, deleteWithSync } from '../../sync/entitySync.js';
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

  // syncOutbox нужен в базовой транзакции всегда — чтобы sync-aware put/delete работали.
  let stores = ['processedCommands', 'auditLog', 'goals', 'plannedOperations', 'syncOutbox'];

  if (
    commandType.startsWith('contribution') ||
    commandType === 'money.transfer' ||
    commandType === 'money.reverse' ||
    commandType === 'goal.delete' ||
    commandType === 'goal.achieve' ||
    commandType === 'plannedOperation.generate' ||
    commandType === 'actualIncome.create' ||
    commandType === 'actualIncome.delete'
  ) {
    stores.push('actualContributions', 'moneyLots', 'moneyEntries', 'moneyMovements', 'actualIncomes', 'settings');
  }

  if (commandType === 'plannedOperation.update') {
    stores.push('moneyEntries', 'settings');
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
      case 'actualIncome.delete':
        await deleteWithSync(tx, 'actualIncomes', payload.id);
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
          targetAmountMinor: payload.targetAmountMinor !== undefined ? Math.round(payload.targetAmountMinor) : goalToUpdate.targetAmountMinor,
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

      case 'plannedOperation.update': {
        const opToUpdate = await getFromStore('plannedOperations', payload.operationId, tx);
        if (!opToUpdate) throw new Error('Операция не найдена');

        const newAmount = Math.round(payload.plannedAmountMinor);
        const updatedOp = { ...opToUpdate, plannedAmountMinor: newAmount, updatedAt: new Date().toISOString() };
        plan.newPlannedOperations.push(updatedOp);

        if (payload.recalculateRest) {
          const goal = await getFromStore('goals', opToUpdate.goalId, tx);
          if (goal && goal.deadlineMonth) {
            const allOps = await getAllFromStore('plannedOperations', tx);
            const goalOps = allOps.filter(o => o.goalId === goal.id && o.state === 'scheduled');

            const futureOps = goalOps.filter(o => o.plannedMonth > opToUpdate.plannedMonth);

            if (futureOps.length > 0) {
              const allEntries = await getAllFromStore('moneyEntries', tx);
              const currentBalance = calculateGoalBalance(goal.id, allEntries);

              const pastOps = goalOps.filter(o => o.plannedMonth <= opToUpdate.plannedMonth);
              const pastSum = pastOps.reduce((sum, o) => sum + (o.id === opToUpdate.id ? newAmount : o.plannedAmountMinor), 0);

              const simulatedBalance = currentBalance + pastSum;

              const nextMonthDate = new Date(opToUpdate.plannedMonth + '-01');
              nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
              const nextMonthStr = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;

              if (nextMonthStr <= goal.deadlineMonth) {
                const settingsReq = tx.objectStore('settings').get('generalInflationRate');
                const generalInflationSetting = await new Promise((resolve) => {
                  settingsReq.onsuccess = () => resolve(settingsReq.result ? settingsReq.result.value : 5);
                  settingsReq.onerror = () => resolve(5);
                });

                const tempGoal = { ...goal, startMonth: nextMonthStr };
                const newPlan = generatePlanForGoal(tempGoal, simulatedBalance, nextMonthStr, generalInflationSetting);

                for (const op of futureOps) {
                  await deleteWithSync(tx, 'plannedOperations', op.id);
                }

                if (newPlan.newPlannedOperations) {
                  plan.newPlannedOperations.push(...newPlan.newPlannedOperations);
                }
              }
            }
          }
        }
        break;
      }

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
        await deleteWithSync(tx, 'plannedOperations', payload.operationId);
        break;

      case 'plannedOperation.clearForGoal':
        const allOpsForGoal = await getAllFromStore('plannedOperations', tx);
        const opsToDelete = allOpsForGoal.filter(op => op.goalId === payload.goalId);
        for (const op of opsToDelete) {
          await deleteWithSync(tx, 'plannedOperations', op.id);
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
        await deleteWithSync(tx, 'goals', payload.goalId);
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
          await saveWithSync(tx, 'actualTransactions', { ...fact, plannedTransactionId: null });
        }
        await deleteWithSync(tx, 'plannedTransactions', payload.id);
        break;

      case 'actualTransaction.create':
        plan = planActualTransactionCreate(payload);
        break;

      case 'actualTransaction.delete':
        await deleteWithSync(tx, 'actualTransactions', payload.id);
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
        await deleteWithSync(tx, 'categories', payload.id);
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
        await putIntoStore('syncMeta', {
          id: 'forceCloudReset', value: true, at: new Date().toISOString()
        }, tx);
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
        for (const cat of defaultCats) await saveWithSync(tx, 'categories', cat);

        const defaultSets = planSettingsSeed();
        for (const set of defaultSets) await saveWithSync(tx, 'settings', set);

        await putIntoStore('syncMeta', {
          id: 'forceCloudReset', value: true, at: new Date().toISOString()
        }, tx);
        break;
      }

      default:
        throw new Error(`Неизвестный тип: ${commandType}`);
    }

    // Параллельный запуск всех get — критично для Safari.
    const saveItems = async (storeName, items) => {
      if (!items || items.length === 0) return;
      await Promise.all(items.map(item => saveWithSync(tx, storeName, item)));
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
