/* ==========================================================================
   Генератор плана взносов с учетом инфляции и ставки доходности.
   ========================================================================== */
import { generateId } from '../shared/ids.js';
import { calculateRequiredContribution } from '../forecasting/calculateRequiredContribution.js';

/**
 * Рассчитывает график платежей с учетом процентов и инфляции.
 * @param {Object} goal - Объект цели
 * @param {number} currentBalanceMinor - Сколько уже накоплено
 * @param {string} currentMonth - YYYY-MM (текущий месяц)
 * @param {number|null} generalInflationSetting - Общая инфляция из настроек
 * @returns {Object} - { newPlannedOperations: [] }
 */
export function generatePlanForGoal(goal, currentBalanceMinor, currentMonth, generalInflationSetting) {
  if (!goal.deadlineMonth) {
    throw new Error('У цели не установлен дедлайн (месяц), автогенерация невозможна.');
  }

  if (currentBalanceMinor >= goal.targetAmountMinor) {
    throw new Error('Цель уже достигнута, план не требуется.');
  }

  // Используем наш мощный движок прогнозирования для поиска нужного взноса
  const req = calculateRequiredContribution(
    goal, 
    currentBalanceMinor, 
    generalInflationSetting, 
    currentMonth, 
    goal.deadlineMonth
  );

  if (req.status !== 'success') {
    if (req.status === 'already_achieved') throw new Error('Цель уже достигнута.');
    if (req.status === 'deadline_passed') throw new Error('Дедлайн уже прошел. Установите будущую дату цели.');
    throw new Error('Не удалось рассчитать план. Проверьте настройки цели.');
  }

  const newPlannedOperations = [];
  const now = new Date().toISOString();

  // Берем готовый график из прогноза (он уже учитывает индексацию и проценты)
  for (const op of req.requiredSchedule) {
    if (op.plannedAmountMinor <= 0) continue;

    newPlannedOperations.push({
      id: generateId(),
      goalId: goal.id,
      plannedMonth: op.plannedMonth,
      plannedDate: `${op.plannedMonth}-01`,
      plannedAmountMinor: op.plannedAmountMinor,
      source: 'generated',
      state: 'scheduled',
      createdAt: now,
      updatedAt: now
    });
  }

  return { newPlannedOperations };
}
