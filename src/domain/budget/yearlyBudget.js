/* ==========================================================================
   Чистая функция расчёта бюджета на год (12 месяцев) вперед.
   ========================================================================== */
import { calculateMonthlyBudget } from './monthlyBudget.js';

/**
 * Считает бюджет на 12 месяцев вперед, начиная с указанного месяца.
 * @param {string} startMonth - 'YYYY-MM' (с какого месяца начинать)
 * @param {Object} state - { goals, plannedOperations, plannedTransactions }
 * @returns {Array<Object>} Массив из 12 объектов с данными по каждому месяцу
 */
export function calculateYearlyBudget(startMonth, state) {
  const [startYear, startMon] = startMonth.split('-').map(Number);
  const yearlyData = [];

  for (let i = 0; i < 12; i++) {
    // Вычисляем текущий месяц для итерации
    const d = new Date(startYear, startMon - 1 + i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    
    const budget = calculateMonthlyBudget(monthStr, state);
    
    yearlyData.push({
      month: monthStr,
      ...budget
    });
  }

  return yearlyData;
}
