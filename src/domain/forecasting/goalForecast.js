/* ==========================================================================
   Прогноз достижения цели.
   Симулирует накопления с учетом точного графика взносов, доходности и инфляции.
   ========================================================================== */

function applyInflation(targetAmountMinor, monthlyInflation, monthIndex) {
  if (monthlyInflation === 0) return targetAmountMinor;
  return Math.round(targetAmountMinor * Math.pow(1 + monthlyInflation, monthIndex - 1));
}

export function forecastGoal(goal, initialBalanceMinor, futurePlannedOps, generalInflationRate, startMonth, maxMonths = 600) {
  if (!startMonth || !goal || goal.targetAmountMinor <= 0) {
    return { status: 'invalid_input', monthsToGoal: null, forecastDate: null, simulationLog: [] };
  }

  if (goal.planMode === 'auto' && !goal.deadlineMonth) {
    return { status: 'insufficient_data', monthsToGoal: null, forecastDate: null, simulationLog: [] };
  }

  // Ранняя проверка, если дедлайн уже прошел
  if (goal.deadlineMonth && startMonth > goal.deadlineMonth) {
    return { status: 'deadline_passed', monthsToGoal: null, forecastDate: null, simulationLog: [] };
  }

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
  
  const annualRate = goal.annualRate !== null ? goal.annualRate : 0;
  const monthlyRate = Math.pow(1 + annualRate / 100, 1 / 12) - 1;
  const monthlyInflation = inflationPercent === 0 ? 0 : Math.pow(1 + inflationPercent / 100, 1 / 12) - 1;

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
    currentTarget = applyInflation(goal.targetAmountMinor, monthlyInflation, i);
    
    if (balance >= currentTarget) {
      status = 'already_achieved';
      monthsToGoal = i - 1;
      break;
    }

    const interestMinor = Math.round(balance * monthlyRate);
    balance += interestMinor;

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

    if (balance >= currentTarget) {
      status = 'projected';
      monthsToGoal = i;
      forecastDate = monthStr;
      break;
    }

    // Если достигли дедлайна, а цели нет
    if (goal.deadlineMonth && monthStr === goal.deadlineMonth && balance < currentTarget) {
      status = futurePlannedOps.length === 0 ? 'no_plan' : 'deadline_passed';
      break;
    }

    month++;
    if (month > 12) { month = 1; year++; }
  }

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
