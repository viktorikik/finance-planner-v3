/* ==========================================================================
   Тесты создания взносов и проверки инвариантов.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { planContribution } from '../../src/domain/money/contributions.js';
import { checkInvariants } from '../../src/domain/validation/invariants.js';
import { DomainError, InvariantViolationError } from '../../src/domain/shared/errors.js';

describe('Stage 3.2 — Contributions & Invariants', () => {
  it('Успешно планирует взнос (Сценарий 1)', () => {
    const plan = planContribution({
      goalId: 'g1',
      amountMinor: 50000,
      actualDate: '2026-11-05',
      type: 'additional'
    });

    // Проверки структуры плана
    expect(plan.newContributions.length).toBe(1);
    expect(plan.newLots.length).toBe(1);
    expect(plan.newEntries.length).toBe(1);

    const contrib = plan.newContributions[0];
    const lot = plan.newLots[0];
    const entry = plan.newEntries[0];

    // Проверка связей
    expect(lot.sourceRecordId).toBe(contrib.id);
    expect(entry.sourceRecordId).toBe(contrib.id);
    expect(entry.positionId).toBeDefined();
    expect(entry.amountMinor).toBe(50000);
    expect(entry.entryStatus).toBe('active');
  });

  it('Выбрасывает ошибку при нулевой или отрицательной сумме', () => {
    expect(() => planContribution({
      goalId: 'g1',
      amountMinor: 0,
      actualDate: '2026-11-05',
      type: 'additional'
    })).toThrow(DomainError);
  });

  it('Инварианты проходят на корректном состоянии', () => {
    const state = {
      moneyLots: [
        { id: 'lot1', initialAmountMinor: 1000 }
      ],
      moneyEntries: [
        { id: 'e1', entryType: 'credit', positionId: 'p1', moneyLotId: 'lot1', amountMinor: 1000, entryStatus: 'active' },
        { id: 'e2', entryType: 'debit', consumesPositionId: 'p1', amountMinor: 400, entryStatus: 'active' }
      ]
    };

    expect(checkInvariants(state)).toBe(true);
  });

  it('Инварианты ловят отрицательный баланс', () => {
    const state = {
      moneyLots: [
        { id: 'lot1', initialAmountMinor: 1000 }
      ],
      moneyEntries: [
        { id: 'e1', entryType: 'credit', positionId: 'p1', moneyLotId: 'lot1', amountMinor: 1000, entryStatus: 'active' },
        // Списание больше, чем есть
        { id: 'e2', entryType: 'debit', consumesPositionId: 'p1', amountMinor: 1500, entryStatus: 'active' }
      ]
    };

    expect(() => checkInvariants(state)).toThrow(InvariantViolationError);
  });
});
