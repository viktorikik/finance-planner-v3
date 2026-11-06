/* ==========================================================================
   Тесты планирования.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { planGoalCreate } from '../../src/domain/planning/goals.js';
import { calculateExecutionStatus } from '../../src/domain/planning/executionStatus.js';

describe('Stage 4 — Planning', () => {
  it('Создает цель', () => {
    const plan = planGoalCreate({
      name: 'Отпуск',
      category: 'short',
      targetAmountMinor: 10000000,
      deadlineMonth: '2027-06'
    });

    expect(plan.newGoals.length).toBe(1);
    expect(plan.newGoals[0].status).toBe('active');
    expect(plan.newGoals[0].targetAmountMinor).toBe(10000000);
  });

  it('Считает статус выполнения', () => {
    const plannedOp = { id: 'op-1', plannedAmountMinor: 10000, plannedDate: '2026-11-01' };
    const contributions = [
      { plannedOperationId: 'op-1', amountMinor: 6000, reversalStatus: 'active' },
      { plannedOperationId: 'op-1', amountMinor: 4000, reversalStatus: 'active' }
    ];

    const status = calculateExecutionStatus(plannedOp, contributions);
    expect(status.actualAmountMinor).toBe(10000);
    expect(status.status).toBe('completed');
    expect(status.remainingMinor).toBe(0);
  });
});
