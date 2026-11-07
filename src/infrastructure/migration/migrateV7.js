/* ==========================================================================
   Миграция данных из v7 (v2.1) в v8.2 (v3.0).
   Строго по правилам из документации (Приложение Б).
   ========================================================================== */
import { generateId } from '../../domain/shared/ids.js';

/**
 * Преобразует старый JSON v7 в структуры v8.2.
 * 
 * @param {Object} oldData - Объект из старого бэкапа
 * @returns {Object} - План миграции (массивы для записи в БД)
 */
export function migrateV7toV8(oldData) {
  const now = new Date().toISOString();
  const plan = {
    goals: [],
    plannedIncomeItems: [],
    plannedExpenseItems: [],
    actualContributions: [],
    initialContributions: [],
    moneyLots: [],
    moneyEntries: []
  };

  // 1. Перенос доходов
  if (Array.isArray(oldData.monthlyIncomes)) {
    oldData.monthlyIncomes.forEach(inc => {
      plan.plannedIncomeItems.push({
        id: inc.id || generateId(),
        name: inc.name,
        amountMinor: (inc.amount || 0) * 100, // В копейки
        type: 'regular',
        isActive: true,
        createdAt: now,
        updatedAt: now
      });
    });
  }

  // 2. Перенос расходов
  if (Array.isArray(oldData.expenses)) {
    oldData.expenses.forEach(exp => {
      plan.plannedExpenseItems.push({
        id: exp.id || generateId(),
        name: exp.name,
        amountMinor: (exp.amount || 0) * 100,
        type: 'regular',
        isActive: true,
        createdAt: now,
        updatedAt: now
      });
    });
  }

  // 3. Перенос целей
  const allOldGoals = [
    ...(oldData.goals || []).map(g => ({ ...g, category: 'long' })),
    ...(oldData.shortGoals || []).map(g => ({ ...g, category: 'short' }))
  ];

  allOldGoals.forEach(oldGoal => {
    const goalId = oldGoal.id || generateId();
    
    // 3.1. Создаем цель
    plan.goals.push({
      id: goalId,
      name: oldGoal.name,
      category: oldGoal.category,
      targetAmountMinor: (oldGoal.target || 0) * 100,
      deadlineMonth: oldGoal.deadline || null,
      planMode: 'auto',
      manualMonthlyAmountMinor: null,
      annualRate: Number(oldGoal.rate) || 0,
      indexationRate: Number(oldGoal.indexRate) || 0,
      individualInflationRate: null,
      status: 'active',
      achievedAt: null,
      sortOrder: Date.now(),
      createdAt: now,
      updatedAt: now
    });

    // 3.2. Начальный остаток (если был 'saved')
    if (oldGoal.saved > 0) {
      const savedMinor = oldGoal.saved * 100;
      const contribId = generateId();
      const lotId = generateId();
      
      // Если есть дата сохранения, берем её, иначе сегодня
      const savedDate = oldGoal.savedDate ? new Date(oldGoal.savedDate).toISOString() : now;
      
      plan.initialContributions.push({
        id: contribId,
        location: { type: 'goal', id: goalId },
        amountMinor: savedMinor,
        actualDate: oldGoal.savedDate || null,
        registeredAt: now,
        comment: 'Мигрировано из поля saved',
        reversalStatus: 'active',
        createdAt: now
      });

      plan.moneyLots.push({
        id: lotId,
        sourceType: 'initial',
        sourceRecordId: contribId,
        initialAmountMinor: savedMinor,
        originDate: oldGoal.savedDate || null,
        createdAt: now
      });

      plan.moneyEntries.push({
        id: generateId(),
        entryType: 'credit',
        locationType: 'goal',
        locationId: goalId,
        moneyLotId: lotId,
        positionId: generateId(),
        parentPositionId: null,
        amountMinor: savedMinor,
        sourceRecordType: 'initial',
        sourceRecordId: contribId,
        // ИСПРАВЛЕНО: Берем историческую дату, а не now
        effectiveReceivedAt: savedDate, 
        entryStatus: 'active',
        actualDate: oldGoal.savedDate || now.slice(0, 10),
        registeredAt: now,
        createdAt: now
      });
    }

    // 3.3. Взносы (старые contributions)
    if (Array.isArray(oldGoal.contributions)) {
      oldGoal.contributions.forEach(oldContrib => {
        const amountMinor = (oldContrib.amount || 0) * 100;
        if (amountMinor <= 0) return; // Пропускаем пустые

        const contribId = generateId();
        const lotId = generateId();
        const type = oldContrib.plannedMonth ? 'planned' : 'additional';
        
        // ИСПРАВЛЕНО: Берем историческую дату взноса
        const contribDate = oldContrib.date ? new Date(oldContrib.date).toISOString() : now;

        plan.actualContributions.push({
          id: contribId,
          goalId: goalId,
          amountMinor: amountMinor,
          actualDate: oldContrib.date || now.slice(0, 10),
          registeredAt: now,
          type: type,
          plannedOperationId: null, // По правилу миграции не создаем фиктивные планы
          comment: oldContrib.plannedMonth ? `Миграция, plannedMonth: ${oldContrib.plannedMonth}` : 'Миграция',
          reversalStatus: 'active',
          createdAt: now
        });

        plan.moneyLots.push({
          id: lotId,
          sourceType: 'contribution',
          sourceRecordId: contribId,
          initialAmountMinor: amountMinor,
          originDate: oldContrib.date || now.slice(0, 10),
          createdAt: now
        });

        plan.moneyEntries.push({
          id: generateId(),
          entryType: 'credit',
          locationType: 'goal',
          locationId: goalId,
          moneyLotId: lotId,
          positionId: generateId(),
          parentPositionId: null,
          amountMinor: amountMinor,
          sourceRecordType: 'contribution',
          sourceRecordId: contribId,
          // ИСПРАВЛЕНО: Берем историческую дату
          effectiveReceivedAt: contribDate,
          entryStatus: 'active',
          actualDate: oldContrib.date || now.slice(0, 10),
          registeredAt: now,
          createdAt: now
        });
      });
    }
  });

  return plan;
}
