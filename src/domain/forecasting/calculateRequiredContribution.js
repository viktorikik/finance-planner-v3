/* ==========================================================================
   Расчет необходимого взноса для достижения цели к дедлайну.
   Использует бинарный поиск и полную симуляцию до дедлайна.
   ========================================================================== */

function applyInflation(targetAmountMinor, monthlyInflation, monthIndex) {
  if (monthlyInflation === 0) return targetAmountMinor;
  return Math.round(targetAmountMinor * Math.pow(1 + monthlyInflation, monthIndex - 1));
}

/**
 * Внутренняя функция симуляции для бинарного поиска.
 * Возвращает итоговый баланс на момент дедлайна.
 */
function simulateToDeadline(goal, initialBalanceMinor, baseContributionMinor, monthlyRate, monthlyInflation, startMonth, deadlineMonth) {
  let balance = initialBalanceMinor;
  let [year, month] = startMonth.split('-').map(Number);
  const [dYear, dMonth] = deadlineMonth.split('-').map(Number);
  
  let monthsCount = (dYear - year) * 12 + (dMonth - month) + 1;
  if (monthsCount <= 0) return { balance: 0, monthsCount: 0 };

  for (let i = 1; i <= monthsCount; i++) {
    // Начисление процентов на остаток
    balance += Math.round(balance * monthlyRate);

    // Взнос
    let contribution = baseContributionMinor;
    if (goal.indexationEnabled) {
      const yearIndex = Math.floor((i - 1) / 12); // 1-12 мес = 0, 13-24 = 1...
      contribution = Math.round(baseContributionMinor * Math.pow(1 + goal.indexationRate / 100, yearIndex));
    }
    balance += contribution;

    month++;
    if (month > 12) { month = 1; year++; }
  }

  const targetAtDeadline = applyInflation(goal.targetAmountMinor, monthlyInflation, monthsCount);
  return { balance, targetAtDeadline, monthsCount };
}

export function calculateRequiredContribution(goal, initialBalanceMinor, generalInflationRate, startMonth, deadlineMonth, precisionMinor = 1) {
  // 1. Проверки
  if (!deadlineMonth || !startMonth) {
    return { status: 'insufficient_data', requiredBaseContributionMinor: null, requiredSchedule: [] };
  }

  if (goal.planMode === 'auto' && !goal.deadlineMonth) {
    return { status: 'insufficient_data', requiredBaseContributionMinor: null, requiredSchedule: [] };
  }

  const [sYear, sMonth] = startMonth.split('-').map(Number);
  const [dYear, dMonth] = deadlineMonth.split('-').map(Number);
  const monthsCount = (dYear - sYear) * 12 + (dMonth - sMonth) + 1;

  if (monthsCount <= 0) {
    return { status: 'deadline_passed', requiredBaseContributionMinor: null, requiredSchedule: [] };
  }

  // 2. Определение инфляции
  let inflationPercent = 0;
  if (goal.category === 'long') {
    if (goal.individualInflationRate !== null) {
      inflationPercent = goal.individualInflationRate;
    } else if (generalInflationRate !== null) {
      inflationPercent = generalInflationRate;
    } else {
      return { status: 'insufficient_data', requiredBaseContributionMinor: null, requiredSchedule: [] };
    }
  }

  const annualRate = goal.annualRate !== null ? goal.annualRate : 0;
  const monthlyRate = Math.pow(1 + annualRate / 100, 1 / 12) - 1;
  const monthlyInflation = inflationPercent === 0 ? 0 : Math.pow(1 + inflationPercent / 100, 1 / 12) - 1;

  // 3. Бинарный поиск
  let low = 0;
  let high = goal.targetAmountMinor; // Начальное предположение
  let bestContribution = null;

  // Проверяем, достигается ли цель вообще (расширяем high при необходимости)
  let sim = simulateToDeadline(goal, initialBalanceMinor, high, monthlyRate, monthlyInflation, startMonth, deadlineMonth);
  while (sim.balance < sim.targetAtDeadline && high < 1e12) {
    high *= 2;
    sim = simulateToDeadline(goal, initialBalanceMinor, high, monthlyRate, monthlyInflation, startMonth, deadlineMonth);
  }

  if (sim.balance < sim.targetAtDeadline) {
    return { status: 'unreachable', requiredBaseContributionMinor: null, requiredSchedule: [] };
  }

  // Запускаем бинарный поиск
  while (high - low > precisionMinor) {
    const mid = Math.floor((low + high) / 2);
    const testSim = simulateToDeadline(goal, initialBalanceMinor, mid, monthlyRate, monthlyInflation, startMonth, deadlineMonth);
    
    if (testSim.balance >= testSim.targetAtDeadline) {
      high = mid;
      bestContribution = mid;
    } else {
      low = mid;
    }
  }

  // 4. Генерация графика для UI
  const requiredSchedule = [];
  let [currYear, currMonth] = startMonth.split('-').map(Number);
  for (let i = 0; i < monthsCount; i++) {
    const monthStr = `${currYear}-${String(currMonth).padStart(2, '0')}`;
    let amount = bestContribution;
    if (goal.indexationEnabled) {
      const yearIndex = Math.floor(i / 12);
      amount = Math.round(bestContribution * Math.pow(1 + goal.indexationRate / 100, yearIndex));
    }
    requiredSchedule.push({ month: monthStr, amountMinor: amount });
    currMonth++;
    if (currMonth > 12) { currMonth = 1; currYear++; }
  }

  return {
    status: 'success',
    requiredBaseContributionMinor: bestContribution,
    requiredSchedule,
    targetAtDeadlineMinor: sim.targetAtDeadline
  };
}
