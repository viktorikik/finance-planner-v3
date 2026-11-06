/* ==========================================================================
   Вычисление статуса выполнения плановой операции.
   ========================================================================== */

/**
 * Рассчитывает, насколько выполнена плановая операция.
 * 
 * @param {Object} plannedOp - Объект плановой операции
 * @param {Array} allContributions - Все взносы из БД
 * @returns {Object} - { actualAmountMinor, remainingMinor, status }
 */
export function calculateExecutionStatus(plannedOp, allContributions) {
  // Суммируем только активные взносы, привязанные к этой операции
  const actualAmountMinor = allContributions
    .filter(c => 
      c.plannedOperationId === plannedOp.id && 
      c.reversalStatus === 'active'
    )
    .reduce((sum, c) => sum + c.amountMinor, 0);

  const remainingMinor = Math.max(0, plannedOp.plannedAmountMinor - actualAmountMinor);
  
  let status = 'notDue';
  const today = new Date().toISOString().slice(0, 10);
  
  if (actualAmountMinor >= plannedOp.plannedAmountMinor) {
    status = actualAmountMinor > plannedOp.plannedAmountMinor ? 'overfulfilled' : 'completed';
  } else if (actualAmountMinor > 0) {
    status = 'partial';
  } else if (plannedOp.plannedDate < today) {
    status = 'unpaid';
  }

  return {
    actualAmountMinor,
    remainingMinor,
    status
  };
}
