/* ==========================================================================
   Тесты планирования перемещений.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { planMoneyTransfer } from '../../src/domain/money/operations.js';

describe('Stage 3.1 — Money Operations', () => {
  it('Планирует перемещение из цели в пул (LIFO)', () => {
    const state = {
      moneyEntries: [
        { id: 'e1', entryType: 'credit', positionId: 'p1', amountMinor: 100, entryStatus: 'active', moneyLotId: 'lot1', locationType: 'goal', locationId: 'g1', effectiveReceivedAt: '2026-01-01T10:00:00Z' },
        { id: 'e2', entryType: 'credit', positionId: 'p2', amountMinor: 200, entryStatus: 'active', moneyLotId: 'lot1', locationType: 'goal', locationId: 'g1', effectiveReceivedAt: '2026-01-02T10:00:00Z' }
      ]
    };

    const params = {
      from: { type: 'goal', id: 'g1' },
      to: { type: 'pool', id: 'main' },
      amountMinor: 150,
      actualDate: '2026-11-05',
      movementType: 'goalToPool'
    };

    const plan = planMoneyTransfer(params, state);

    // Должно создаться 1 debit и 1 credit
    expect(plan.newEntries.length).toBe(2);
    
    const debit = plan.newEntries.find(e => e.entryType === 'debit');
    const credit = plan.newEntries.find(e => e.entryType === 'credit');

    // LIFO: берет самые новые деньги (p2)
    expect(debit.consumesPositionId).toBe('p2');
    expect(debit.amountMinor).toBe(150);

    // Приход в пул
    expect(credit.locationType).toBe('pool');
    expect(credit.parentPositionId).toBe('p2');
    expect(credit.amountMinor).toBe(150);
    
    expect(plan.newMovements[0].amountMinor).toBe(150);
  });
});
