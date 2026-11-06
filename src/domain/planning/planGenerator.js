/* ==========================================================================
   Генератор равномерного плана взносов до дедлайна цели.
   ========================================================================== */
import { generateId } from '../shared/ids.js';

/**
 * Рассчитывает график платежей.
 * @param {Object} goal - Объект цели (targetAmountMinor, deadlineMonth)
 * @param {number} currentBalanceMinor - Сколько уже накоплено
 * @param {string} currentMonth - YYYY-MM (текущий месяц)
 * @returns {Object} - { newPlannedOperations: [] }
 */
export function generatePlanForGoal(goal, currentBalanceMinor, currentMonth) {
  if (!goal.deadlineMonth) {
    throw new Error('У цели не установлен дедлайн (месяц), автогенерация невозможна.');
  }

  const remainingMinor = goal.targetAmountMinor - currentBalanceMinor;
  if (remainingMinor <= 0) {
    throw new Error('Цель уже достигнута, план не требуется.');
  }

  // Считаем количество месяцев (включая текущий и месяц дедлайна)
  const [startYear, startMonth] = currentMonth.split('-').map(Number);
  const [endYear, endMonth] = goal.deadlineMonth.split('-').map(Number);
  
  const monthsDiff = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
  
  if (monthsDiff <= 0) {
    throw new Error('Дедлайн уже прошел. Установите будущую дату цели.');
  }

  // Базовая сумма в месяц и остаток (копейки)
  const baseAmount = Math.floor(remainingMinor / monthsDiff);
  const remainder = remainingMinor % monthsDiff;

  const newPlannedOperations = [];
  const now = new Date().toISOString();

  for (let i = 0; i < monthsDiff; i++) {
    // Вычисляем месяц для текущего взноса
    const d = new Date(startYear, startMonth - 1 + i, 1);
    const plannedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    // Первый месяц забирает весь остаток от деления
    const amountMinor = i === 0 ? baseAmount + remainder : baseAmount;
    
    // Если сумма 0 (например, цель почти достигнута), пропускаем
    if (amountMinor <= 0) continue;

    newPlannedOperations.push({
      id: generateId(),
      goalId: goal.id,
      plannedMonth,
      plannedDate: `${plannedMonth}-01`,
      plannedAmountMinor: amountMinor,
      source: 'generated',
      state: 'scheduled',
      createdAt: now,
      updatedAt: now
    });
  }

  return { newPlannedOperations };
}
