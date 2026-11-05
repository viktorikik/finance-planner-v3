/* ==========================================================================
   Логика отмены денежных операций.
   Реализует паттерн "compute-then-commit": не меняет базу напрямую,
   а возвращает список записей для создания и обновления.
   ========================================================================== */
import { generateId } from '../shared/ids.js';
import { AlreadyReversedError, InvariantViolationError } from '../shared/errors.js';
import { calculatePositionBalance, findDescendantPositions } from './moneyPositions.js';

/**
 * Планирует отмену перемещения денег.
 * 
 * @param {string} movementId - ID перемещения
 * @param {Object} state - текущее состояние { moneyMovements, moneyEntries }
 * @returns {Object} - { newEntries, updatedEntries, updatedMovements, cancellationGroupId }
 */
export function planMovementReversal(movementId, state) {
  const { moneyMovements, moneyEntries } = state;
  
  const movement = moneyMovements.find(m => m.id === movementId);
  if (!movement) throw new Error('Перемещение не найдено');
  if (movement.reversalStatus !== 'active') throw new AlreadyReversedError();
  
  const cancellationGroupId = generateId();
  const newEntries = [];
  const updatedEntries = [];
  const updatedMovements = [];
  
  // 1. Находим исходные записи перемещения
  const originalDebit = moneyEntries.find(e => e.movementId === movementId && e.entryType === 'debit' && e.entryStatus !== 'reversed');
  const originalCredit = moneyEntries.find(e => e.movementId === movementId && e.entryType === 'credit' && e.entryStatus !== 'reversed');
  
  if (!originalDebit || !originalCredit) {
    throw new InvariantViolationError('Нарушена целостность перемещения: не найдены активные debit/credit');
  }

  const sourcePositionId = originalDebit.consumesPositionId; // Куда вернутся деньги
  const destPositionId = originalCredit.positionId;         // Откуда заберем деньги
  
  // 2. Строим граф потомков от destPositionId
  const descendants = findDescendantPositions(destPositionId, moneyEntries);
  
  // Включаем саму destPositionId в список для обработки
  const allNodes = [destPositionId, ...descendants];
  
  // 3. Схлопываем листья (идем с конца, от самых глубоких детей к корню)
  const sortedNodes = allNodes.reverse();
  
  for (const posId of sortedNodes) {
    const balance = calculatePositionBalance(posId, moneyEntries);
    
    if (balance < 0) {
      throw new InvariantViolationError(`Отрицательный баланс позиции ${posId}`);
    }
    
    if (balance > 0) {
      const posEntry = moneyEntries.find(e => e.positionId === posId && e.entryType === 'credit');
      
      // Если это destPosition (корень), мы возвращаем всё в исходную sourcePositionId
      const parentId = posId === destPositionId ? sourcePositionId : posEntry.parentPositionId;
      
      if (!parentId) {
        throw new InvariantViolationError(`Нет родителя для возврата денег из позиции ${posId}`);
      }
      
      // Создаем компенсирующий debit (забираем из текущей позиции)
      newEntries.push({
        id: generateId(),
        entryType: 'debit',
        locationType: posEntry.locationType,
        locationId: posEntry.locationId,
        amountMinor: balance,
        consumesPositionId: posId,
        entryStatus: 'reversal',
        reversalGroupId: cancellationGroupId,
        effectiveReceivedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });
      
      // Находим данные родителя для credit
      const parentEntry = moneyEntries.find(e => e.positionId === parentId && e.entryType === 'credit');
      
      // Создаем компенсирующий credit (возвращаем в родительскую позицию)
      newEntries.push({
        id: generateId(),
        entryType: 'credit',
        locationType: parentEntry ? parentEntry.locationType : movement.sourceLocation.type,
        locationId: parentEntry ? parentEntry.locationId : movement.sourceLocation.id,
        amountMinor: balance,
        positionId: generateId(), // Новая позиция
        parentPositionId: null,   // Восстановление не создает дочернюю связь
        restoresPositionId: parentId, // Ссылка на восстанавливаемую позицию
        moneyLotId: posEntry.moneyLotId,
        entryStatus: 'reversal',
        reversalGroupId: cancellationGroupId,
        // Унаследованная дата поступления (чтобы FIFO/LIFO не сломались)
        effectiveReceivedAt: parentEntry ? parentEntry.effectiveReceivedAt : movement.actualDate,
        createdAt: new Date().toISOString()
      });
      
      // Помечаем исходную запись как отмененную
      for (const e of moneyEntries) {
        if (e.positionId === posId && e.entryType === 'credit' && e.entryStatus === 'active') {
          updatedEntries.push({ ...e, entryStatus: 'reversed', reversalGroupId: cancellationGroupId });
        }
      }
    }
  }

  // Помечаем исходное перемещение
  updatedMovements.push({
    ...movement,
    reversalStatus: 'fully_reversed',
    reversedBy: cancellationGroupId
  });

  return {
    newEntries,
    updatedEntries,
    updatedMovements,
    cancellationGroupId
  };
}
