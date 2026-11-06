/* ==========================================================================
   Прогноз достижения цели.
   Показывает, за сколько месяцев цель будет достигнута при текущем плане.
   ========================================================================== */
import { getMonthlyRate, applyInflation } from './interest.js';

/**
 * Строит прогноз достижения цели.
 * 
 * @param {Object} goal - Параметры цели
 * @param {number} currentBalanceMinor - Текущий фактический остаток
 * @param {number} plannedMonthlyMinor - Плановый ежемесячный взнос
 * @param {number} generalInflationPercent - Общая инфляция (если нет индивидуальной)
 * @param {number} maxMonths - Максимальный горизонт прогноза (например, 600 мес = 50 лет)
 * @returns {Object} - { monthsToGoal, forecastDate, isAchievable }
 */
export function forecastGoal(goal, currentBalanceMinor, plannedMonthlyMinor, generalInflationPercent, maxMonths = 600) {
  // Если взносов нет и остаток меньше цели — цель недостижима
  if (plannedMonthlyMinor <= 0 && currentBalanceMinor < goal.targetAmountMinor) {
    return { monthsToGoal: null, forecastDate: null, isAchievable: false };
  }

  let balance = currentBalanceMinor;
  let months = 0;
  
  const monthlyRate = getMonthlyRate(goal.annualRate);
  const inflation = goal.individualInflationRate ?? generalInflationPercent;
  const monthlyIndexation = getMonthlyRate(goal.indexationRate);

  let currentMonthlyContrib = plannedMonthlyMinor;

  while (months < maxMonths) {
    months++;
    
    // 1. Целевая сумма с учетом инфляции на текущий месяц
    const targetWithInflation = applyInflation(goal.targetAmountMinor, inflation, months);

    // 2. Проверяем, достигли ли цели
    if (balance >= targetWithInflation) {
      break;
    }

    // 3. Начисляем проценты на текущий остаток
    balance += balance * monthlyRate;

    // 4. Добавляем плановый взнос
    balance += currentMonthlyContrib;

    // 5. Индексируем взнос раз в 12 месяцев
    if (months % 12 === 0) {
      currentMonthlyContrib += currentMonthlyContrib * (goal.indexationRate / 100);
    }
  }

  if (months >= maxMonths) {
    return { monthsToGoal: null, forecastDate: null, isAchievable: false };
  }

  // Рассчитываем дату
  const now = new Date();
  const forecastDate = new Date(now.getFullYear(), now.getMonth() + months, 1);
  const forecastDateStr = `${forecastDate.getFullYear()}-${String(forecastDate.getMonth() + 1).padStart(2, '0')}`;

  return {
    monthsToGoal: months,
    forecastDate: forecastDateStr,
    isAchievable: true
  };
}
