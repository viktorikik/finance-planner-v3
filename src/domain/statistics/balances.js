/* ==========================================================================
   Модуль статистики: агрегация балансов.
   ========================================================================== */
import { calculatePositionBalance } from '../money/moneyPositions.js';

/**
 * Вычисляет общий остаток по всем местам хранения (цели + пул).
 * Использует только активные позиции.
 * 
 * @param {Array} moneyEntries - Все записи журнала
 * @returns {number} - Общая сумма накоплений в копейках
 */
export function calculateTotalAccumulated(moneyEntries) {
  let total = 0;
  
  // Находим все уникальные позиции, которые когда-либо создавались
  const uniquePositions = [...new Set(moneyEntries.filter(e => e.entryType === 'credit').map(e => e.positionId))];
  
  for (const posId of uniquePositions) {
    total += calculatePositionBalance(posId, moneyEntries);
  }
  
  return total;
}

/**
 * Вычисляет баланс конкретной цели.
 * 
 * @param {string} goalId - ID цели
 * @param {Array} moneyEntries - Все записи журнала
 * @returns {number} - Баланс цели
 */
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

/**
 * Вычисляет баланс общего пула.
 * 
 * @param {Array} moneyEntries - Все записи журнала
 * @returns {number} - Баланс пула
 */
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
