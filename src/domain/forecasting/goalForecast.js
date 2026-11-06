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
  
  let currentMonthlyContrib = plannedMonthlyMinor;

  while (months < maxMonths) {
    months++;
    
    // 1. Начисляем проценты на остаток на начало месяца
    balance += balance * monthlyRate;

    // 2. Добавляем плановый взнос за этот месяц
    balance += currentMonthlyContrib;

    // 3. Индексируем взнос раз в 12 месяцев (для следующих периодов)
    if (months % 12 === 0) {
      currentMonthlyContrib += currentMonthlyContrib * (goal.indexationRate / 100);
    }

    // 4. Считаем целевую сумму с учетом инфляции на текущий месяц
    const targetWithInflation = applyInflation(goal.targetAmountMinor, inflation, months);

    // 5. Проверяем, достигли ли цели ПОСЛЕ всех начислений за месяц
    if (balance >= targetWithInflation) {
      break;
    }
  }

  if (months >= maxMonths) {
    return { monthsToGoal: null, forecastDate: null, isAchievable: false };
  }

  // Рассчитываем прогнозную дату
  const now = new Date();
  const forecastDate = new Date(now.getFullYear(), now.getMonth() + months, 1);
  const forecastDateStr = `${forecastDate.getFullYear()}-${String(forecastDate.getMonth() + 1).padStart(2, '0')}`;

  return {
    monthsToGoal: months,
    forecastDate: forecastDateStr,
    isAchievable: true
  };
}
