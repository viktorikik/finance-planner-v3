import { describe, it, expect } from 'vitest';
import { calculateMonthlyBudget } from '../../src/domain/budget/monthlyBudget.js';

describe('Domain: monthlyBudget', () => {
  const mockState = {
    goals: [
      { id: 'g1', status: 'active' },
      { id: 'g2', status: 'achieved' }
    ],
    plannedOperations: [
      { id: 'op1', goalId: 'g1', plannedMonth: '2026-11', plannedAmountMinor: 10000 },
      { id: 'op2', goalId: 'g2', plannedMonth: '2026-11', plannedAmountMinor: 50000 },
      { id: 'op3', goalId: 'g1', plannedMonth: '2026-12', plannedAmountMinor: 20000 }
    ],
    plannedTransactions: [
      { id: 't1', type: 'income', amountMinor: 50000, frequency: 'regular', startMonth: '2026-11', isActive: true },
      { id: 't2', type: 'expense', amountMinor: 20000, frequency: 'regular', startMonth: '2026-11', isActive: false },
      { id: 't3', type: 'expense', amountMinor: 30000, frequency: 'one-time', startMonth: '2026-11', isActive: true },
      { id: 't4', type: 'expense', amountMinor: 10000, frequency: 'regular', startMonth: '2026-12', isActive: true }
    ]
  };

  it('должен корректно считать бюджет на ноябрь 2026', () => {
    const result = calculateMonthlyBudget('2026-11', mockState);
    
    expect(result.hasData).toBe(true);
    expect(result.totalIncome).toBe(50000);
    expect(result.totalExpense).toBe(30000);
    expect(result.totalContribution).toBe(10000);
    expect(result.balance).toBe(10000);
  });

  it('должен корректно считать бюджет на декабрь 2026', () => {
    const result = calculateMonthlyBudget('2026-12', mockState);
    
    expect(result.hasData).toBe(true);
    expect(result.totalIncome).toBe(50000);
    expect(result.totalExpense).toBe(10000);
    expect(result.totalContribution).toBe(20000);
    expect(result.balance).toBe(20000);
  });

  it('должен корректно работать с пустым state', () => {
    const emptyState = { goals: [], plannedOperations: [], plannedTransactions: [] };
    const result = calculateMonthlyBudget('2027-01', emptyState);
    
    expect(result.hasData).toBe(false);
    expect(result.balance).toBe(0);
  });
});
