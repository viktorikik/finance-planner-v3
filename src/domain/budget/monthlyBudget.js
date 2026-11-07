/* ==========================================================================
   Чистая функция расчёта бюджета на конкретный месяц.
   Не знает о БД и DOM.
   ========================================================================== */

/**
 * Проверяет, активна ли плановая транзакция в указанном месяце.
 * @param {Object} tx - запись plannedTransactions
 * @param {string} month - 'YYYY-MM'
 * @returns {boolean}
 */
function isTransactionActiveInMonth(tx, month) {
  if (tx.isActive === false) return false;
  
  if (tx.frequency === 'one-time') {
    return tx.startMonth === month;
  }
  
  if (tx.frequency === 'regular') {
    // startMonth <= month
    if (tx.startMonth > month) return false;
    // если есть endMonth, проверяем, что month <= endMonth
    if (tx.endMonth && month > tx.endMonth) return false;
    return true;
  }
  
  return false;
}

/**
 * Рассчитывает бюджет на месяц.
 * @param {string} month - 'YYYY-MM'
 * @param {Object} state - { goals, plannedOperations, plannedTransactions }
 * @returns {Object} Плановые доходы, расходы, взносы и остаток.
 */
export function calculateMonthlyBudget(month, state) {
  const { goals = [], plannedOperations = [], plannedTransactions = [] } = state;

  // 1. Фильтруем активные цели
  const activeGoals = goals.filter(g => g.status === 'active');
  const activeGoalIds = new Set(activeGoals.map(g => g.id));

  // 2. Считаем плановые доходы и расходы
  const relevantTransactions = plannedTransactions.filter(tx => isTransactionActiveInMonth(tx, month));

  const incomes = relevantTransactions.filter(tx => tx.type === 'income');
  const expenses = relevantTransactions.filter(tx => tx.type === 'expense');

  const totalIncome = incomes.reduce((sum, tx) => sum + tx.amountMinor, 0);
  const totalExpense = expenses.reduce((sum, tx) => sum + tx.amountMinor, 0);

  // 3. Считаем плановые взносы по целям (на основе plannedOperations)
  const relevantOperations = plannedOperations.filter(op => 
    op.plannedMonth === month && 
    activeGoalIds.has(op.goalId)
  );

  const totalContribution = relevantOperations.reduce((sum, op) => sum + op.plannedAmountMinor, 0);

  // 4. Итоговый баланс
  // Баланс = Доходы - Расходы - Взносы в цели
  const balance = totalIncome - totalExpense - totalContribution;

  // 5. Есть ли вообще данные для этого месяца?
  // Если нет ни доходов, ни расходов, ни взносов — значит данных нет
  const hasData = relevantTransactions.length > 0 || relevantOperations.length > 0;

  return {
    incomes,
    expenses,
    contributions: relevantOperations,
    totalIncome,
    totalExpense,
    totalContribution,
    balance,
    hasData
  };
}
