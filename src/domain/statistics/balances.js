/* ==========================================================================
   Модуль статистики: агрегация балансов.
   ========================================================================== */
import { calculatePositionBalance } from '../money/moneyPositions.js';

export function calculateTotalAccumulated(moneyEntries) {
  let total = 0;
  const uniquePositions = [...new Set(moneyEntries.filter(e => e.entryType === 'credit').map(e => e.positionId))];
  for (const posId of uniquePositions) {
    total += calculatePositionBalance(posId, moneyEntries);
  }
  return total;
}

export function calculateGoalBalance(goalId, moneyEntries) {
  let total = 0;
  const goalPositions = [...new Set(moneyEntries
    .filter(e => e.entryType === 'credit' && e.locationType === 'goal' && e.locationId === goalId)
    .map(e => e.positionId))];
  for (const posId of goalPositions) {
    total += calculatePositionBalance(posId, moneyEntries);
  }
  return total;
}

// НОВОЕ: Расчет баланса пула
export function calculatePoolBalance(moneyEntries) {
  let total = 0;
  const poolPositions = [...new Set(moneyEntries
    .filter(e => e.entryType === 'credit' && e.locationType === 'pool')
    .map(e => e.positionId))];
  for (const posId of poolPositions) {
    total += calculatePositionBalance(posId, moneyEntries);
  }
  return total;
}
