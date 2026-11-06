/* ==========================================================================
   Тесты статистики и агрегатов.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { calculateSavingsRate } from '../../src/domain/statistics/savingsRate.js';
import { calculateTotalAccumulated, calculateGoalBalance } from '../../src/domain/statistics/balances.js';

describe('Stage 6 — Statistics', () => {
  it('Считает норму сбережений (Сценарий 2)', () => {
    const incomes = [{ amountMinor: 100000 }]; // 1000 руб
    const contributions = [{ amountMinor: 20000, type: 'additional', reversalStatus: 'active' }]; // 200 руб

    const rate = calculateSavingsRate(incomes, contributions);
    expect(rate).toBe(20); // 20%
  });

  it('Возвращает null, если нет доходов (Инвариант 4.10.5)', () => {
    const rate = calculateSavingsRate([], []);
    expect(rate).toBeNull();
  });

  it('Считает общий баланс по журналу', () => {
    const entries = [
      // Взнос 1000 в цель g1
      { id: 'e1', entryType: 'credit', positionId: 'p1', amountMinor: 1000, entryStatus: 'active', locationType: 'goal', locationId: 'g1' },
      // Перевод 400 в пул
      { id: 'e2', entryType: 'debit', consumesPositionId: 'p1', amountMinor: 400, entryStatus: 'active' },
      { id: 'e3', entryType: 'credit', positionId: 'p2', amountMinor: 400, entryStatus: 'active', locationType: 'pool', locationId: 'main' }
    ];

    const total = calculateTotalAccumulated(entries);
    expect(total).toBe(1000); // 600 в цели + 400 в пуле

    const goalBal = calculateGoalBalance('g1', entries);
    expect(goalBal).toBe(600);
  });
});
