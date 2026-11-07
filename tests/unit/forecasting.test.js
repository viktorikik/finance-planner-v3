import { describe, it, expect } from 'vitest';
import { forecastGoal } from '../../src/domain/forecasting/goalForecast.js';
import { calculateRequiredContribution } from '../../src/domain/forecasting/calculateRequiredContribution.js';

describe('Forecasting Domain', () => {
  const baseGoal = {
    id: 'g1', name: 'Test', targetAmountMinor: 1000000, // 10 000 ₽
    category: 'long', deadlineMonth: '2027-12', annualRate: 0,
    individualInflationRate: null, indexationEnabled: false, indexationRate: 0,
    planMode: 'manual', manualMonthlyAmountMinor: 100000 // 1000 ₽
  };
  const startMonth = '2026-01';
  const genOps = (months, amount) => months.map(m => ({ plannedMonth: m, plannedAmountMinor: amount }));

  it('1. Базовый линейный рост (0%, 0%)', () => {
    const ops = genOps(['2026-01', '2026-02', '2026-03'], 300000); // 3000 ₽
    const res = forecastGoal(baseGoal, 0, ops, 0, startMonth, 600);
    expect(res.status).toBe('projected');
    expect(res.monthsToGoal).toBe(4); // 3 взноса по 3000 = 9000, 4-й = 12000 >= 10000
  });

  it('2. Округление доходности', () => {
    const goal = { ...baseGoal, annualRate: 15, targetAmountMinor: 100000, planMode: 'manual', manualMonthlyAmountMinor: 10000 }; // 1000 ₽
    const ops = genOps(['2026-01', '2026-02', '2026-03'], 10000);
    const res = forecastGoal(goal, 0, ops, 0, startMonth, 600);
    expect(res.status).toBe('projected');
    // Баланс не должен иметь дробных копеек
    expect(Number.isInteger(res.simulationLog[0].interestMinor)).toBe(true);
  });

  it('3. Инфляция: краткосрочная цель игнорирует', () => {
    const goal = { ...baseGoal, category: 'short', individualInflationRate: 10 };
    const ops = genOps(['2026-01', '2026-02', '2026-03'], 300000); 
    const res = forecastGoal(goal, 0, ops, 10, startMonth, 600);
    expect(res.targetWithInflationMinor).toBe(1000000); // Цель не выросла
  });

  it('4. Инфляция: долгосрочная с индивидуальной', () => {
    const goal = { ...baseGoal, individualInflationRate: 10 };
    const ops = genOps(['2026-01', '2026-02', '2026-03', '2026-04'], 300000); 
    const res = forecastGoal(goal, 0, ops, 5, startMonth, 600);
    // 1-й мес: цель 1000000, баланс 300000
    // 2-й мес: цель 1000000 * (1+0.1)^(1/12), баланс 600000
    // ...
    expect(res.status).toBe('projected');
    expect(res.targetWithInflationMinor).toBeGreaterThan(1000000);
  });

  it('5. Инфляция: долгосрочная с общей (глобальной)', () => {
    const goal = { ...baseGoal, individualInflationRate: null };
    const ops = genOps(['2026-01', '2026-02', '2026-03', '2026-04'], 300000); 
    const res = forecastGoal(goal, 0, ops, 10, startMonth, 600);
    expect(res.targetWithInflationMinor).toBeGreaterThan(1000000);
  });

  it('6. Инфляция: общая null, индивидуальная null', () => {
    const goal = { ...baseGoal, individualInflationRate: null };
    const res = forecastGoal(goal, 0, [], null, startMonth, 600);
    expect(res.status).toBe('insufficient_data'); // Не хватает данных об инфляции
  });

  it('7. Взнос не получает проценты в первый месяц', () => {
    const goal = { ...baseGoal, annualRate: 12, targetAmountMinor: 200000 }; // 2000 ₽
    const ops = genOps(['2026-01'], 2000); // 20 ₽ (в копейках 2000)
    const res = forecastGoal(goal, 0, ops, 0, startMonth, 600);
    // Если бы взнос получал процент, баланс стал бы > 2000. Но он должен быть ровно 2000.
    expect(res.simulationLog[0].interestMinor).toBe(0);
    expect(res.simulationLog[0].balanceEnd).toBe(2000);
  });

  it('8. Включение startMonth и deadlineMonth', () => {
    const goal = { ...baseGoal, deadlineMonth: '2026-01', targetAmountMinor: 1000000 };
    const ops = genOps(['2026-01'], 1000000); // 10000 ₽
    const res = forecastGoal(goal, 0, ops, 0, startMonth, 600);
    expect(res.status).toBe('projected');
    expect(res.monthsToGoal).toBe(1);
  });

  it('9. Просроченный дедлайн', () => {
    const goal = { ...baseGoal, deadlineMonth: '2025-12' };
    const res = forecastGoal(goal, 0, [], 0, startMonth, 600);
    expect(res.status).toBe('deadline_passed');
  });

  it('10. Автоматический режим без срока -> insufficient_data', () => {
    const goal = { ...baseGoal, planMode: 'auto', deadlineMonth: null };
    const res = forecastGoal(goal, 0, [], 0, startMonth, 600);
    expect(res.status).toBe('insufficient_data');
  });

  it('11. Manual без срока -> ok, если есть взнос', () => {
    const goal = { ...baseGoal, planMode: 'manual', deadlineMonth: null };
    const ops = genOps(['2026-01', '2026-02', '2026-03', '2026-04'], 300000);
    const res = forecastGoal(goal, 0, ops, 0, startMonth, 600);
    expect(res.status).toBe('projected');
  });

  it('12. Биномиальный поиск: минимальность с точностью до копейки', () => {
    const goal = { ...baseGoal, planMode: 'auto', annualRate: 10, targetAmountMinor: 1000000 }; // 10k
    const res = calculateRequiredContribution(goal, 0, 0, startMonth, '2026-12', 1);
    expect(res.status).toBe('success');
    // Проверяем, что найденный взнос РОВНО покрывает цель, а на 1 копейку меньше - нет
    const ops1 = genOps(Array.from({length: 12}, (_,i) => `2026-${String(i+1).padStart(2,'0')}`), res.requiredBaseContributionMinor);
    const check1 = forecastGoal(goal, 0, ops1, 0, startMonth, 600);
    expect(check1.status).toBe('projected');
    
    const ops2 = genOps(Array.from({length: 12}, (_,i) => `2026-${String(i+1).padStart(2,'0')}`), res.requiredBaseContributionMinor - 1);
    const check2 = forecastGoal(goal, 0, ops2, 0, startMonth, 600);
    expect(check2.status).toBe('horizon_exceeded'); // не хватило
  });

  it('13. Индексация: первый взнос меняется ровно на 13-й месяц', () => {
    const goal = { ...baseGoal, indexationEnabled: true, indexationRate: 10, planMode: 'auto', annualRate: 0, deadlineMonth: '2027-12' };
    const res = calculateRequiredContribution(goal, 0, 0, startMonth, '2027-12', 1);
    expect(res.status).toBe('success');
    const schedule = res.requiredSchedule;
    // Первые 12 одинаковые, 13-й больше на 10%
    const base = schedule[0].amountMinor;
    expect(schedule[11].amountMinor).toBe(base); // 12-й
    expect(schedule[12].amountMinor).toBe(Math.round(base * 1.1)); // 13-й
  });

  it('14. Проверка через forecastGoal: план достигает цели', () => {
    const goal = { ...baseGoal, planMode: 'auto', annualRate: 10, deadlineMonth: '2026-12' };
    const res = calculateRequiredContribution(goal, 0, 0, startMonth, '2026-12', 1);
    const ops = genOps(Array.from({length: 12}, (_,i) => `2026-${String(i+1).padStart(2,'0')}`), res.requiredBaseContributionMinor);
    const check = forecastGoal(goal, 0, ops, 0, startMonth, 600);
    expect(check.status).toBe('projected');
    expect(check.monthsToGoal).toBeLessThanOrEqual(12);
  });

  it('15. Точный график: разные суммы', () => {
    const goal = { ...baseGoal, targetAmountMinor: 15000 }; // 150 ₽
    const ops = [
      { plannedMonth: '2026-01', plannedAmountMinor: 5000 },
      { plannedMonth: '2026-02', plannedAmountMinor: 10000 }
    ];
    const res = forecastGoal(goal, 0, ops, 0, startMonth, 600);
    expect(res.monthsToGoal).toBe(2);
  });

  it('16. Отсутствие повторной индексации в futurePlannedOps', () => {
    const goal = { ...baseGoal, indexationEnabled: true, indexationRate: 10 };
    // Суммы уже с индексацией (10к, 11к)
    const ops = [
      { plannedMonth: '2026-01', plannedAmountMinor: 10000 },
      { plannedMonth: '2026-02', plannedAmountMinor: 11000 }
    ];
    const res = forecastGoal(goal, 0, ops, 0, startMonth, 600);
    expect(res.simulationLog[1].contributionMinor).toBe(11000); // Не 12100
  });

  it('17. Инфляция после достижения (в calculateRequiredContribution)', () => {
    // Если цель достигается в середине, взнос все равно должен быть достаточным для ИТОГОВОЙ цели к дедлайну
    const goal = { ...baseGoal, category: 'long', individualInflationRate: 12, targetAmountMinor: 1000000, annualRate: 0 };
    const res = calculateRequiredContribution(goal, 0, 0, startMonth, '2026-12', 1);
    // Из-за инфляции цель к декабрю вырастет, взнос будет больше, чем 1000000/12
    expect(res.requiredBaseContributionMinor).toBeGreaterThan(1000000 / 12);
  });

  it('18. no_plan: график пуст', () => {
    const goal = { ...baseGoal, planMode: 'manual', manualMonthlyAmountMinor: 0 };
    const res = forecastGoal(goal, 0, [], 0, startMonth, 600);
    expect(res.status).toBe('no_plan');
  });

  it('19. auto без срока -> insufficient_data в calculateRequiredContribution', () => {
    const goal = { ...baseGoal, planMode: 'auto', deadlineMonth: null };
    const res = calculateRequiredContribution(goal, 0, 0, startMonth, null, 1);
    expect(res.status).toBe('insufficient_data');
  });
});
