/* ==========================================================================
   Проверка инвариантов (целостности) базы данных.
   Согласно invariants.md v1.0.
   ========================================================================== */
import { InvariantViolationError } from '../shared/errors.js';
import { calculatePositionBalance } from '../money/moneyPositions.js';

/**
 * Проверяет базовые инварианты денежной системы.
 * Вызывается после любой транзакции (или в тестах).
 * 
 * @param {Object} state - Текущее состояние { moneyEntries, moneyLots }
 */
export function checkInvariants(state) {
  const { moneyEntries, moneyLots } = state;

  if (!moneyEntries || !moneyLots) {
    throw new InvariantViolationError('Отсутствуют обязательные коллекции для проверки');
  }

  // Инвариант 4.3.6: Баланс любой позиции не может быть отрицательным
  const uniquePositions = [...new Set(moneyEntries.filter(e => e.entryType === 'credit').map(e => e.positionId))];
  
  for (const posId of uniquePositions) {
    const balance = calculatePositionBalance(posId, moneyEntries);
    if (balance < 0) {
      throw new InvariantViolationError(`Отрицательный баланс позиции ${posId}: ${balance}`);
    }
  }

  // Инвариант 4.3.7: Сумма остатков всех позиций партии <= initialAmountMinor
  for (const lot of moneyLots) {
    const lotPositions = moneyEntries
      .filter(e => e.moneyLotId === lot.id && e.entryType === 'credit')
      .map(e => e.positionId);
      
    const uniqueLotPositions = [...new Set(lotPositions)];
    let totalLotBalance = 0;
    
    for (const posId of uniqueLotPositions) {
      totalLotBalance += calculatePositionBalance(posId, moneyEntries);
    }

    if (totalLotBalance > lot.initialAmountMinor) {
      throw new InvariantViolationError(
        `Сумма остатков партии ${lot.id} (${totalLotBalance}) превышает первоначальную (${lot.initialAmountMinor})`
      );
    }
  }

  return true;
}
