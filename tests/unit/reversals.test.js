/* ==========================================================================
   Тесты логики отмены (каскад и позиции).
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { planMovementReversal } from '../../src/domain/money/reversals.js';
import { calculatePositionBalance } from '../../src/domain/money/moneyPositions.js';
import { AlreadyReversedError } from '../../src/domain/shared/errors.js';

describe('Stage 2.5 — Money Reversals', () => {
  it('T-03: Отмена простого перемещения', () => {
    // Взнос 1000 в цель A (позиция p1)
    // Перемещение M1: 400 из A в пул (позиция p2)
    
    const state = {
      moneyMovements: [
        { id: 'm1', reversalStatus: 'active', sourceLocation: { type: 'goal', id: 'A' }, destinationLocation: { type: 'pool', id: 'main' }, amountMinor: 400 }
      ],
      moneyEntries: [
        // Изначальный взнос
        { id: 'e1', entryType: 'credit', positionId: 'p1', amountMinor: 1000, entryStatus: 'active', moneyLotId: 'lot1', locationType: 'goal', locationId: 'A' },
        // Перемещение M1
        { id: 'e2', entryType: 'debit', consumesPositionId: 'p1', movementId: 'm1', amountMinor: 400, entryStatus: 'active' },
        { id: 'e3', entryType: 'credit', positionId: 'p2', parentPositionId: 'p1', movementId: 'm1', amountMinor: 400, entryStatus: 'active', moneyLotId: 'lot1', locationType: 'pool', locationId: 'main' }
      ]
    };

    const plan = planMovementReversal('m1', state);

    expect(plan.newEntries.length).toBe(2); // Компенсирующий debit и credit
    expect(plan.updatedEntries.length).toBe(1); // Запись e3 помечена как reversed
    expect(plan.updatedEntries[0].id).toBe('e3');
    expect(plan.updatedEntries[0].entryStatus).toBe('reversed');
    expect(plan.updatedMovements[0].reversalStatus).toBe('fully_reversed');

    // Проверяем, что восстановленный credit ссылается на p1
    const compCredit = plan.newEntries.find(e => e.entryType === 'credit');
    expect(compCredit.restoresPositionId).toBe('p1');
    expect(compCredit.amountMinor).toBe(400);
  });

  it('T-06: Каскадная отмена', () => {
    // M1: A -> pool (400)
    // M2: pool -> Б (200)
    // M3: Б -> pool (100)
    
    const state = {
      moneyMovements: [
        { id: 'm1', reversalStatus: 'active', sourceLocation: { type: 'goal', id: 'A' }, destinationLocation: { type: 'pool', id: 'main' } },
        { id: 'm2', reversalStatus: 'active', sourceLocation: { type: 'pool', id: 'main' }, destinationLocation: { type: 'goal', id: 'B' } },
        { id: 'm3', reversalStatus: 'active', sourceLocation: { type: 'goal', id: 'B' }, destinationLocation: { type: 'pool', id: 'main' } }
      ],
      moneyEntries: [
        // p1 в A
        { id: 'e1', entryType: 'credit', positionId: 'p1', amountMinor: 1000, entryStatus: 'active', moneyLotId: 'lot1', locationType: 'goal', locationId: 'A' },
        
        // M1: A -> pool
        { id: 'e2', entryType: 'debit', consumesPositionId: 'p1', movementId: 'm1', amountMinor: 400, entryStatus: 'active' },
        { id: 'e3', entryType: 'credit', positionId: 'p2', parentPositionId: 'p1', movementId: 'm1', amountMinor: 400, entryStatus: 'active', moneyLotId: 'lot1', locationType: 'pool', locationId: 'main' },
        
        // M2: pool -> B
        { id: 'e4', entryType: 'debit', consumesPositionId: 'p2', movementId: 'm2', amountMinor: 200, entryStatus: 'active' },
        { id: 'e5', entryType: 'credit', positionId: 'p3', parentPositionId: 'p2', movementId: 'm2', amountMinor: 200, entryStatus: 'active', moneyLotId: 'lot1', locationType: 'goal', locationId: 'B' },
        
        // M3: B -> pool
        { id: 'e6', entryType: 'debit', consumesPositionId: 'p3', movementId: 'm3', amountMinor: 100, entryStatus: 'active' },
        { id: 'e7', entryType: 'credit', positionId: 'p4', parentPositionId: 'p3', movementId: 'm3', amountMinor: 100, entryStatus: 'active', moneyLotId: 'lot1', locationType: 'pool', locationId: 'main' }
      ]
    };

    // Отменяем M1
    const plan = planMovementReversal('m1', state);

    // Ожидаем, что M2 и M3 схлопнутся
    // M3 (p4 -> p3): 100
    // M2 (p3 -> p2): 100 (остаток) + 100 (от M3) = 200
    // M1 (p2 -> p1): 200 (остаток) + 200 (от M2) = 400
    
    // Итого plan.newEntries: 
    // Для p4: debit(100), credit(100) -> p3
    // Для p3: debit(200), credit(200) -> p2
    // Для p2: debit(400), credit(400) -> p1
    // Всего 6 записей.
    
    expect(plan.newEntries.length).toBe(6);
    
    const compCredits = plan.newEntries.filter(e => e.entryType === 'credit');
    expect(compCredits.length).toBe(3);
    
    // Проверяем, что все деньги вернулись в p1
    const finalCredit = compCredits.find(e => e.restoresPositionId === 'p1');
    expect(finalCredit.amountMinor).toBe(400);
    
    // Проверяем, что e3, e5, e7 (исходные credit) помечены как reversed
    expect(plan.updatedEntries.length).toBe(3);
    expect(plan.updatedEntries.map(e => e.id).sort()).toEqual(['e3', 'e5', 'e7'].sort());
  });

  it('Запрет повторной отмены', () => {
    const state = {
      moneyMovements: [{ id: 'm1', reversalStatus: 'fully_reversed' }],
      moneyEntries: []
    };
    expect(() => planMovementReversal('m1', state)).toThrow(AlreadyReversedError);
  });
});
