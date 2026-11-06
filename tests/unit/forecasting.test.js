/* ==========================================================================
   Тесты прогнозирования.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { getMonthlyRate, applyInflation } from '../../src/domain/forecasting/interest.js';
import { forecastGoal } from '../../src/domain/forecasting/goalForecast.js';

describe('Stage 5 — Forecasting', () => {
  it('Правильно считает эффективную месячную ставку', () => {
    // 12% годовых -> ~0.948% в месяц
    const rate = getMonthlyRate(12);
    expect(rate).toBeCloseTo(0.009488, 5);
    
    // 0% -> 0
    expect(getMonthlyRate(0)).toBe(0);
  });

  it('Правильно применяет инфляцию', () => {
    const amount = 1000000; // 10 000 руб
    const inflated = applyInflation(amount, 10, 12); // 10% на 1 год
    expect(inflated).toBe(1100000);
  });

  it('Строит прогноз достижения цели', () => {
    const goal = {
      targetAmountMinor: 1200000, // 12 000 руб
      annualRate: 0,
      indexationRate: 0,
      individualInflationRate: null
    };
    
    const currentBalance = 0;
    const plannedMonthly = 100000; // 1000 руб/мес
    const generalInflation = 0;

    const forecast = forecastGoal(goal, currentBalance, plannedMonthly, generalInflation);
    
    expect(forecast.isAchievable).toBe(true);
    expect(forecast.monthsToGoal).toBe(12); // 12 * 1000 = 12000
  });

  it('Возвращает null, если план не позволяет достичь цели', () => {
    const goal = {
      targetAmountMinor: 1200000,
      annualRate: 0,
      indexationRate: 0,
      individualInflationRate: null
    };
    
    const forecast = forecastGoal(goal, 0, 0, 0); // Нет взносов
    expect(forecast.isAchievable).toBe(false);
  });
});
