/* ==========================================================================
   Логика управления плановыми операциями.
   ========================================================================== */
import { generateId } from '../shared/ids.js';

/**
 * Планирует создание плановой операции.
 * 
 * @param {Object} params 
 * @param {string} params.goalId - ID цели
 * @param {string} params.plannedMonth - YYYY-MM
 * @param {number} params.plannedAmountMinor - Плановая сумма
 * @returns {Object} - { newPlannedOperations }
 */
export function planPlannedOperationCreate(params) {
  const { goalId, plannedMonth, plannedAmountMinor } = params;
  const now = new Date().toISOString();

  const newOp = {
    id: generateId(),
    goalId,
    plannedMonth,
    plannedDate: `${plannedMonth}-01`, // По умолчанию 1-е число
    plannedAmountMinor,
    source: 'generated',
    state: 'scheduled',
    createdAt: now,
    updatedAt: now
  };

  return { newPlannedOperations: [newOp] };
}
