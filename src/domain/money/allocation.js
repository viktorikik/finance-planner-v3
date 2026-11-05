/* ==========================================================================
   Алгоритмы распределения денежных средств (FIFO и LIFO).
   Определяет, из каких именно позиций списывать деньги.
   ========================================================================== */
import { calculatePositionBalance } from './moneyPositions.js';
import { InsufficientFundsError } from '../shared/errors.js';

/**
 * Выбирает позиции для списания.
 * 
 * @param {number} amountNeeded - Сколько всего нужно списать
 * @param {Array} availablePositions - Массив объектов позиций (из moneyEntries)
 * @param {string} strategy - 'FIFO' | 'LIFO'
 * @param {Array} allEntries - Все записи журнала (для расчета баланса)
 * @returns {Array} - Массив { positionId, amountMinor }
 */
export function allocateFunds(amountNeeded, availablePositions, strategy, allEntries) {
  let remaining = amountNeeded;
  const allocations = [];

  // 1. Считаем реальный остаток для каждой позиции
  const positionsWithBalance = availablePositions.map(pos => {
    // Находим исходную credit запись для этой позиции, чтобы взять дату
    const entry = allEntries.find(e => e.positionId === pos.positionId && e.entryType === 'credit');
    const balance = calculatePositionBalance(pos.positionId, allEntries);
    
    return { 
      positionId: pos.positionId, 
      balance,
      effectiveReceivedAt: entry ? entry.effectiveReceivedAt : null
    };
  }).filter(pos => pos.balance > 0);

  // 2. Сортируем по времени поступления (effectiveReceivedAt)
  positionsWithBalance.sort((a, b) => {
    const timeA = a.effectiveReceivedAt ? new Date(a.effectiveReceivedAt).getTime() : 0;
    const timeB = b.effectiveReceivedAt ? new Date(b.effectiveReceivedAt).getTime() : 0;
    
    if (timeA !== timeB) {
      return strategy === 'FIFO' ? timeA - timeB : timeB - timeA;
    }
    
    // Если время одинаковое — сортируем по ID для стабильности
    return a.positionId.localeCompare(b.positionId);
  });

  // 3. Набираем нужную сумму
  for (const pos of positionsWithBalance) {
    if (remaining <= 0) break;

    const take = Math.min(remaining, pos.balance);
    allocations.push({
      positionId: pos.positionId,
      amountMinor: take
    });
    remaining -= take;
  }

  // 4. Проверка: хватило ли денег
  if (remaining > 0) {
    throw new InsufficientFundsError(
      `Недостаточно средств. Не хватает: ${remaining} коп.`
    );
  }

  return allocations;
}
