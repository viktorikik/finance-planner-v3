/* ==========================================================================
   Модуль прогнозирования: проценты, инфляция и капитализация.
   ========================================================================== */

/**
 * Преобразует годовую эффективную ставку в месячную.
 * Формула: (1 + r_annual)^(1/12) - 1
 * 
 * @param {number} annualRatePercent - Годовая ставка в процентах (например, 10)
 * @returns {number} - Месячная ставка в долях (например, 0.00797)
 */
export function getMonthlyRate(annualRatePercent) {
  if (!annualRatePercent || annualRatePercent === 0) return 0;
  const annualRateDecimal = annualRatePercent / 100;
  return Math.pow(1 + annualRateDecimal, 1 / 12) - 1;
}

/**
 * Рассчитывает будущую стоимость суммы с учетом инфляции.
 * Формула: S_t = S_0 * (1 + i)^t
 * 
 * @param {number} currentAmountMinor - Сумма в сегодняшних ценах (в копейках)
 * @param {number} annualInflationPercent - Годовая инфляция в процентах
 * @param {number} months - Количество месяцев
 * @returns {number} - Будущая стоимость (в копейках)
 */
export function applyInflation(currentAmountMinor, annualInflationPercent, months) {
  if (!annualInflationPercent || annualInflationPercent === 0) return currentAmountMinor;
  
  const years = months / 12;
  const futureValue = currentAmountMinor * Math.pow(1 + annualInflationPercent / 100, years);
  
  // Округляем до копеек
  return Math.round(futureValue);
}
