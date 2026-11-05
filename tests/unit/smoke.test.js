/* ==========================================================================
   Smoke-тест Этапа 1.
   Проверяет, что Vitest запущен и что модули роутера импортируются
   без ошибок. Полноценные тесты финансовой логики — с Этапа 2.5.
   ========================================================================== */
import { describe, it, expect } from 'vitest';

describe('Stage 1 — environment', () => {
  it('vitest runs', () => {
    expect(1 + 1).toBe(2);
  });

  it('router module exports required functions', async () => {
    const router = await import('../../src/app/router.js');
    expect(typeof router.navigate).toBe('function');
    expect(typeof router.render).toBe('function');
    expect(typeof router.initRouter).toBe('function');
  });

  it('screens export render functions', async () => {
    const plan = await import('../../src/ui/screens/plan/PlanScreen.js');
    const cal = await import('../../src/ui/screens/calendar/CalendarScreen.js');
    const stats = await import('../../src/ui/screens/statistics/StatisticsScreen.js');
    const settings = await import('../../src/ui/screens/settings/SettingsScreen.js');

    expect(typeof plan.renderPlanScreen).toBe('function');
    expect(typeof cal.renderCalendarScreen).toBe('function');
    expect(typeof stats.renderStatisticsScreen).toBe('function');
    expect(typeof settings.renderSettingsScreen).toBe('function');
  });
});
