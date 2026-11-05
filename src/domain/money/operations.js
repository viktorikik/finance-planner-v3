/* ==========================================================================
   Планирование операций с деньгами (перемещения).
   Использует compute-then-commit.
   ========================================================================== */
import { generateId } from '../shared/ids.js';
import { allocateFunds } from './allocation.js';

/**
 * Планирует перевод денег между местами хранения.
 * 
 * @param {Object} params 
 * @param {Object} params.from - { type: 'goal'|'pool', id: string }
 * @param {Object} params.to - { type: 'goal'|'pool', id: string }
 * @param {number} params.amountMinor - Сумма в копейках
 * @param {string} params.actualDate - Дата YYYY-MM-DD
 * @param {string} params.movementType - 'goalToPool' | 'poolToGoal' | 'goalToGoal'
 * @param {Object} state - Текущее состояние (moneyEntries)
 * @returns {Object} - План (newMovements, newEntries)
 */
export function planMoneyTransfer(params, state) {
  const { from, to, amountMinor, actualDate, movementType } = params;
  const { moneyEntries } = state;

  // 1. Находим все активные позиции в исходном месте хранения
  // Позиция считается доступной, если у неё есть credit и entryStatus === 'active'
  const sourcePositions = moneyEntries.filter(e => 
    e.entryType === 'credit' && 
    e.entryStatus === 'active' && 
    e.locationType === from.type && 
    e.locationId === from.id
  );

  // 2. Определяем стратегию: FIFO для пула, LIFO для целей
  const strategy = from.type === 'pool' ? 'FIFO' : 'LIFO';

  // 3. Распределяем суммы по позициям
  const allocations = allocateFunds(amountMinor, sourcePositions, strategy, moneyEntries);

  const movementId = generateId();
  const now = new Date().toISOString();
  const newEntries = [];

  // 4. Создаем debit записи для исходного места
  for (const alloc of allocations) {
    newEntries.push({
      id: generateId(),
      entryType: 'debit',
      locationType: from.type,
      locationId: from.id,
      amountMinor: alloc.amountMinor,
      consumesPositionId: alloc.positionId,
      movementId: movementId,
      entryStatus: 'active',
      effectiveReceivedAt: now,
      createdAt: now
    });
  }

  // 5. Создаем credit запись для места назначения
  // При переводе мы берем партию (moneyLot) из первой использованной позиции.
  // В реальной финансовой системе может быть смешивание партий,
  // но для v1 мы создаем одну новую позицию, унаследованную от первой.
  // (Для точного маппинга каждой партии потребуется создавать несколько credit записей).
  // В нашем случае мы создаем одну общую credit запись для упрощения (как в тестах),
  // привязывая её к первой партии. 
  
  // ВАЖНО: Для строгого соответствия инвариантам нужно создавать credit для каждой партии.
  // Сделаем это правильно:
  
  const sourceAllocationsMap = {};
  for (const alloc of allocations) {
    const sourcePos = sourcePositions.find(p => p.positionId === alloc.positionId);
    if (!sourceAllocationsMap[sourcePos.moneyLotId]) {
      sourceAllocationsMap[sourcePos.moneyLotId] = {
        amount: 0,
        effectiveReceivedAt: sourcePos.effectiveReceivedAt
      };
    }
    sourceAllocationsMap[sourcePos.moneyLotId].amount += alloc.amountMinor;
  }

  for (const [lotId, data] of Object.entries(sourceAllocationsMap)) {
    newEntries.push({
      id: generateId(),
      entryType: 'credit',
      locationType: to.type,
      locationId: to.id,
      amountMinor: data.amount,
      positionId: generateId(),
      parentPositionId: null, // При перемещении мы не создаем жесткую связь родитель-потомок, 
                              // если смешиваем партии. Но для отмены нужна связь.
                              // В нашей модели отмены мы находим детей по parentPositionId.
                              // Поэтому привяжем к первой позиции из аллокации.
      moneyLotId: lotId,
      movementId: movementId,
      entryStatus: 'active',
      effectiveReceivedAt: now, 
      createdAt: now
    });
  }

  // Примечание: для идеальной работы отмены (каскада) нужно, чтобы parentPositionId 
  // указывал на позицию, из которой пришли деньги.
  // Перезапишем создание credit для точного соответствия:
  
  newEntries.length = allocations.length; // Очищаем то, что создали выше (оставляем только debit)
  
  for (const alloc of allocations) {
    const sourcePos = sourcePositions.find(p => p.positionId === alloc.positionId);
    newEntries.push({
      id: generateId(),
      entryType: 'credit',
      locationType: to.type,
      locationId: to.id,
      amountMinor: alloc.amountMinor,
      positionId: generateId(),
      parentPositionId: alloc.positionId, // Жесткая связь для отмены
      moneyLotId: sourcePos.moneyLotId,
      movementId: movementId,
      entryStatus: 'active',
      effectiveReceivedAt: now, 
      createdAt: now
    });
  }

  // 6. Создаем саму запись перемещения
  const newMovement = {
    id: movementId,
    movementType: movementType,
    sourceLocation: from,
    destinationLocation: to,
    amountMinor: amountMinor,
    actualDate: actualDate,
    registeredAt: now,
    allocations: allocations.map(a => ({ positionId: a.positionId, amountMinor: a.amountMinor })),
    reversalStatus: 'active',
    reversedBy: null,
    reversalOfMovementId: null,
    cancellationGroupId: null,
    correctsId: null,
    comment: "",
    createdAt: now
  };

  return {
    newMovements: [newMovement],
    newEntries,
    updatedEntries: [],
    updatedMovements: []
  };
}
