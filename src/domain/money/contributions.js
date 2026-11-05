/* ==========================================================================
   Логика создания фактических взносов.
   Реализует паттерн "compute-then-commit".
   ========================================================================== */
import { generateId } from '../shared/ids.js';
import { DomainError } from '../shared/errors.js';

/**
 * Планирует создание фактического взноса в цель.
 * Создает запись взноса, денежную партию (lot) и приходную запись (credit).
 * 
 * @param {Object} params 
 * @param {string} params.goalId - ID цели
 * @param {number} params.amountMinor - Сумма взноса в копейках
 * @param {string} params.actualDate - Фактическая дата (YYYY-MM-DD)
 * @param {string} params.type - 'planned' | 'additional' | 'early'
 * @param {string|null} params.plannedOperationId - ID плановой операции (если есть)
 * @returns {Object} - План { newContributions, newLots, newEntries }
 */
export function planContribution(params) {
  const { goalId, amountMinor, actualDate, type, plannedOperationId = null } = params;

  // 1. Валидация (Инвариант 4.2.1: сумма должна быть > 0)
  if (!amountMinor || amountMinor <= 0) {
    throw new DomainError('INVALID_AMOUNT', 'Сумма взноса должна быть больше нуля');
  }

  const now = new Date().toISOString();
  const contributionId = generateId();
  const lotId = generateId();
  const positionId = generateId();

  // 2. Создаем фактический взнос
  const newContribution = {
    id: contributionId,
    goalId,
    amountMinor,
    actualDate,
    registeredAt: now,
    type,
    plannedOperationId,
    comment: "",
    reversalStatus: 'active',
    reversedBy: null,
    reversalOfRecordId: null,
    cancellationGroupId: null,
    correctsId: null,
    createdAt: now
  };

  // 3. Создаем денежную партию (источник происхождения)
  const newLot = {
    id: lotId,
    sourceType: 'contribution',
    sourceRecordId: contributionId,
    initialAmountMinor: amountMinor,
    originDate: actualDate,
    createdAt: now
  };

  // 4. Создаем запись в журнале (credit)
  const newEntry = {
    id: generateId(),
    entryType: 'credit',
    locationType: 'goal',
    locationId: goalId,
    moneyLotId: lotId,
    positionId: positionId,
    parentPositionId: null,
    restoresPositionId: null,
    consumesPositionId: null,
    amountMinor,
    sourceRecordType: 'contribution',
    sourceRecordId: contributionId,
    movementId: null,
    effectiveReceivedAt: now,
    entryStatus: 'active',
    reversalGroupId: null,
    actualDate,
    registeredAt: now,
    createdAt: now
  };

  return {
    newContributions: [newContribution],
    newLots: [newLot],
    newEntries: [newEntry],
    updatedEntries: [],
    updatedMovements: []
  };
}
