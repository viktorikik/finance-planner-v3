import { describe, it, expect } from 'vitest';
import { calculateMonthlyBudget } from '../../src/domain/budget/monthlyBudget.js';

describe('Domain: monthlyBudget', () => {
  const mockState = {
    goals: [
      { id: 'g1', status: 'active' },
      { id: 'g2', status: 'achieved' } // Не должна учитываться
    ],
    plannedOperations: [
      { id: 'op1', goalId: 'g1', plannedMonth: '2026-11', plannedAmountMinor: 10000 }, // 100 руб
      { id: 'op2', goalId: 'g2', plannedMonth: '2026-11', plannedAmountMinor: 50000 }, // Цель достигнута, не считаем
      { id: 'op3', goalId: 'g1', plannedMonth: '2026-12', plannedAmountMinor: 20000 }
    ],
    plannedTransactions: [
      // Регулярный доход 50000 (500 руб) с ноября 2026
      { id: 't1', type: 'income', amountMinor: 50000, frequency: 'regular', startMonth: '2026-11', isActive: true },
      // Регулярный расход 20000 (200 руб) с ноября 2026, но отключен
      { id: 't2', type: 'expense', amountMinor: 20000, frequency: 'regular', startMonth: '2026-11', isActive: false },
      // Разовый расход 30000 (300 руб) в ноябре 2026
      { id: 't3', type: 'expense', amountMinor: 30000, frequency: 'one-time', startMonth: '2026-11', isActive: true },
      // Регулярный расход 10000 (100 руб) с декабря 2026
      { id: 't4', type: 'expense', amountMinor: 10000, frequency: 'regular', startMonth: '2026-12', isActive: true }
    ]
  };

  it('должен корректно считать бюджет на ноябрь 2026', () => {
    const result = calculateMonthlyBudget('2026-11', mockState);
    
    expect(result.hasData).toBe(true);
    expect(result.totalIncome).toBe(50000); // t1
    expect(result.totalExpense).toBe(30000); // t3 (t2 отключен)
    expect(result.totalContribution).toBe(10000); // op1 (op2 игнорируется, op3 в другом месяце)
    
    // Баланс: 50000 - 30000 - 10000 = 10000
    expect(result.balance).toBe(10000);
  });

  it('должен корректно считать бюджет на декабрь 2026', () => {
    const result = calculateMonthlyBudget('2026-12', mockState);
    
    expect(result.hasData).toBe(true);
    expect(result.totalIncome).toBe(50000); // t1
    expect(result.totalExpense).toBe(10000); // t4
    expect(result.totalContribution).toBe(20000); // op3
    
    // Баланс: 50000 - 10000 - 20000 = 20000
    expect(result.balance).toBe(20000);
  });

  it('должен возвращать hasData: false для месяца без операций', () => {
    const result = calculateMonthlyBudget('2027-01', mockState);
    
    // В январе регулярный доход есть (t1), и регулярный расход тоже (t4), поэтому hasData: true
    expect(result.hasData).toBe(true);
    expect(result.totalIncome).toBe(50000); // t1
    expect(result.totalExpense).toBe(10000); // t4
    expect(result.totalContribution).toBe(0);
    
    // Баланс: 50000 - 10000 = 40000
    expect(result.balance).toBe(40000);

    const emptyState = { goals: [], plannedOperations: [], plannedTransactions: [] };
    const emptyResult = calculateMonthlyBudget('2027-01', emptyState);
    expect(emptyResult.hasData).toBe(false);
    expect(emptyResult.balance).toBe(0);
  });
});
