/* ==========================================================================
   Работа с денежными позициями.
   Вычисление балансов и поиск связей (графов) для каскадной отмены.
   ========================================================================== */

/**
 * Вычисляет баланс конкретной позиции на основе записей журнала.
 * 
 * @param {string} positionId - ID позиции
 * @param {Array} entries - массив всех moneyEntries
 * @returns {number} - текущий остаток
 */
export function calculatePositionBalance(positionId, entries) {
  let balance = 0;
  
  for (const entry of entries) {
    // Отмененные записи (reversed) не участвуют в балансе
    if (entry.entryStatus === 'reversed') continue;
    
    if (entry.entryType === 'credit' && entry.positionId === positionId) {
      balance += entry.amountMinor;
    }
    if (entry.entryType === 'debit' && entry.consumesPositionId === positionId) {
      balance -= entry.amountMinor;
    }
  }
  
  return balance;
}

/**
 * Находит всех потомков позиции (BFS).
 * Возвращает массив ID позиций, которые были созданы из данной (через перемещения).
 * 
 * @param {string} rootPositionId 
 * @param {Array} entries 
 * @returns {Array<string>} 
 */
export function findDescendantPositions(rootPositionId, entries) {
  const descendants = new Set();
  const queue = [rootPositionId];
  
  while (queue.length > 0) {
    const current = queue.shift();
    
    for (const entry of entries) {
      // Если запись активна и ссылается на текущую позицию как на родителя
      if (
        entry.entryType === 'credit' && 
        entry.entryStatus !== 'reversed' && 
        entry.parentPositionId === current
      ) {
        if (!descendants.has(entry.positionId)) {
          descendants.add(entry.positionId);
          queue.push(entry.positionId);
        }
      }
    }
  }
  
  return Array.from(descendants);
}
