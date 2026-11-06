/* ==========================================================================
   Модуль статистики: расчёт нормы сбережений.
   Формула: (Новые фактические взносы / Фактические доходы) * 100%.
   ========================================================================== */

/**
 * Рассчитывает норму сбережений.
 * 
 * @param {Array} actualIncomes - Массив фактических доходов пользователя
 * @param {Array} actualContributions - Массив фактических взносов
 * @returns {number|null} - Процент (например, 15.5) или null, если нет доходов
 */
export function calculateSavingsRate(actualIncomes, actualContributions) {
  // Инвариант 4.10.1: Плановые доходы не считаются фактическими (фильтруем только actualIncomes)
  // Инвариант 4.10.5: Отсутствие данных != 0
  const totalIncomes = actualIncomes.reduce((sum, inc) => sum + inc.amountMinor, 0);
  
  if (totalIncomes <= 0) {
    return null; // Недостаточно данных
  }

  // Инвариант 4.10.3: Внутренние перемещения не считаются сбережениями (фильтруем только взносы)
  // Инвариант 4.10.4: Начальные остатки не считаются новыми взносами (в типе 'initial')
  // Инвариант 4.10.2: Доход от накоплений не входит в числитель (он в investmentIncomes, а не здесь)
  const totalNewContributions = actualContributions
    .filter(c => c.reversalStatus === 'active' && c.type !== 'initial')
    .reduce((sum, c) => sum + c.amountMinor, 0);

  return (totalNewContributions / totalIncomes) * 100;
}
