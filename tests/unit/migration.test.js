/* ==========================================================================
   Тесты миграции данных v7 -> v8.2.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { migrateV7toV8 } from '../../src/infrastructure/migration/migrateV7.js';

describe('Stage 7 — Migration', () => {
  it('Мигрирует старый бэкап без потери денег', () => {
    const oldData = {
      monthlyIncomes: [{ id: '1', name: 'ЗП', amount: 100000 }],
      goals: [
        {
          id: 'g1',
          name: 'Машина',
          target: 500000,
          saved: 100000, // Начальный остаток
          contributions: [
            { id: 'c1', date: '2026-01-01', amount: 50000, plannedMonth: '2026-01' } // Плановый
          ]
        }
      ]
    };

    const plan = migrateV7toV8(oldData);

    // 1. Доходы
    expect(plan.plannedIncomeItems.length).toBe(1);
    expect(plan.plannedIncomeItems[0].amountMinor).toBe(10000000); // В копейках!

    // 2. Цели
    expect(plan.goals.length).toBe(1);
    expect(plan.goals[0].targetAmountMinor).toBe(50000000);

    // 3. Начальный остаток (saved) -> initialContributions
    expect(plan.initialContributions.length).toBe(1);
    expect(plan.initialContributions[0].amountMinor).toBe(10000000); // 100 000 руб

    // 4. Взносы (contributions) -> actualContributions
    expect(plan.actualContributions.length).toBe(1);
    expect(plan.actualContributions[0].amountMinor).toBe(5000000); // 50 000 руб
    expect(plan.actualContributions[0].type).toBe('planned');
    // Проверяем, что не создали фейковый план
    expect(plan.actualContributions[0].plannedOperationId).toBeNull();

    // 5. Проверка балансов (создались ли правильные партии)
    // 2 записи: одна для saved (initial), одна для взноса (contribution)
    expect(plan.moneyEntries.length).toBe(2);
    expect(plan.moneyLots.length).toBe(2);
  });
});
