/* ==========================================================================
   Логика создания фактических доходов.
   ========================================================================== */
import { generateId } from '../shared/ids.js';
import { DomainError } from '../shared/errors.js';

/**
 * Планирует создание фактического дохода.
 * 
 * @param {Object} params 
 * @param {number} params.amountMinor - Сумма дохода в копейках
 * @param {string} params.actualDate - Фактическая дата (YYYY-MM-DD)
 * @param {string} params.category - Категория (salary, freelance, gift, other)
 * @returns {Object} - { newActualIncomes: [] }
 */
export function planActualIncomeCreate(params) {
  const { amountMinor, actualDate, category = 'other' } = params;

  if (!amountMinor || amountMinor <= 0) {
    throw new DomainError('INVALID_AMOUNT', 'Сумма дохода должна быть больше нуля');
  }

  const now = new Date().toISOString();
  
  const newIncome = {
    id: generateId(),
    amountMinor,
    actualDate,
    category,
    reversalStatus: 'active',
    createdAt: now
  };

  return { newActualIncomes: [newIncome] };
}
