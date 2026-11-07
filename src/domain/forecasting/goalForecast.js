/* ==========================================================================
   Прогноз достижения цели.
   Симулирует накопления с учетом точного графика взносов, доходности и инфляции.
   ========================================================================== */

/**
 * Рассчитывает будущую стоимость цели с учетом инфляции.
 * targetMonth = targetAmount * (1 + monthlyInflation)^(monthIndex - 1)
 */
function applyInflation(targetAmountMinor, monthlyInflation, monthIndex) {
  if (monthlyInflation === 0) return targetAmountMinor;
  return Math.round(targetAmountMinor * Math.pow(1 + monthlyInflation, monthIndex - 1));
}

export function forecastGoal(goal, initialBalanceMinor, futurePlannedOps, generalInflationRate, startMonth, maxMonths = 600) {
  // 1. Проверки на корректность
  if (!startMonth || !goal || goal.targetAmountMinor <= 0) {
    return { status: 'invalid_input', monthsToGoal: null, forecastDate: null, simulationLog: [] };
  }

  // 2. Проверка режима auto без срока
  if (goal.planMode === 'auto' && !goal.deadlineMonth) {
    return { status: 'insufficient_data', monthsToGoal: null, forecastDate: null, simulationLog: [] };
  }

  // 3. Определение инфляции
  let inflationPercent = 0;
  if (goal.category === 'long') {
    if (goal.individualInflationRate !== null) {
      inflationPercent = goal.individualInflationRate;
    } else if (generalInflationRate !== null) {
      inflationPercent = generalInflationRate;
    } else {
      return { status: 'insufficient_data', monthsToGoal: null, forecastDate: null, simulationLog: [] };
    }
  }
  
  // 4. Расчет месячных ставок
  const annualRate = goal.annualRate !== null ? goal.annualRate : 0;
  const monthlyRate = Math.pow(1 + annualRate / 100, 1 / 12) - 1;
  const monthlyInflation = inflationPercent === 0 ? 0 : Math.pow(1 + inflationPercent / 100, 1 / 12) - 1;

  // 5. Симуляция
  let balance = initialBalanceMinor;
  let currentLog = [];
  let status = 'horizon_exceeded';
  let monthsToGoal = null;
  let forecastDate = null;
  let currentTarget = goal.targetAmountMinor;

  let [year, month] = startMonth.split('-').map(Number);
  const opsMap = new Map(futurePlannedOps.map(op => [op.plannedMonth, op.plannedAmountMinor]));

  for (let i = 1; i <= maxMonths; i++) {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    
    // Текущая цель с учетом инфляции (для 1-го месяца инфляция 0)
    currentTarget = applyInflation(goal.targetAmountMinor, monthlyInflation, i);
    
    // Проверка на старте (если баланс уже больше)
    if (balance >= currentTarget) {
      status = 'already_achieved';
      monthsToGoal = i - 1;
      break;
    }

    // Шаг 1: Начисление процентов на остаток
    const interestMinor = Math.round(balance * monthlyRate);
    balance += interestMinor;

    // Шаг 2: Добавление взноса
    const contributionMinor = opsMap.get(monthStr) || 0;
    balance += contributionMinor;

    currentLog.push({
      month: monthStr,
      balanceStart: balance - interestMinor - contributionMinor,
      interestMinor,
      contributionMinor,
      balanceEnd: balance,
      targetMinor: currentTarget
    });

    // Шаг 3: Проверка достижения
    if (balance >= currentTarget) {
      status = 'projected';
      monthsToGoal = i;
      forecastDate = monthStr;
      break;
    }

    // Проверка на просрочку (если дошли до месяца дедлайна, а цели нет)
    if (goal.deadlineMonth && monthStr === goal.deadlineMonth && balance < currentTarget) {
      status = 'deadline_passed';
      break;
    }

    // Переход к следующему месяцу
    month++;
    if (month > 12) { month = 1; year++; }
  }

  // Если график пуст, и цель не достигнута — это no_plan
  if (status === 'horizon_exceeded' && futurePlannedOps.length === 0 && balance < currentTarget) {
    status = 'no_plan';
  }

  return {
    status,
    monthsToGoal,
    forecastDate,
    targetWithInflationMinor: currentTarget,
    simulationLog: currentLog
  };
}
