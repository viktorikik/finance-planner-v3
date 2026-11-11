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
    if (tx.startMonth > month) return false;
    if (tx.endMonth && month > tx.endMonth) return false;
    return true;
  }
  
  return false;
}

/**
 * Проверяет, попадает ли транзакция в указанный месяц (включая отключенные).
 */
function isTransactionInMonth(tx, month) {
  if (tx.frequency === 'one-time') return tx.startMonth === month;
  if (tx.frequency === 'regular') {
    if (tx.startMonth > month) return false;
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

  // 2. Отбираем транзакции для этого месяца (включая отключенные)
  const allMonthTransactions = plannedTransactions.filter(tx => isTransactionInMonth(tx, month));
  
  // 3. Считаем только активные транзакции
  const activeTransactions = allMonthTransactions.filter(tx => tx.isActive !== false);

  const incomes = activeTransactions.filter(tx => tx.type === 'income');
  const expenses = activeTransactions.filter(tx => tx.type === 'expense');
  
  // Для UI также возвращаем неактивные, чтобы их можно было включить обратно
  const inactiveIncomes = allMonthTransactions.filter(tx => tx.type === 'income' && tx.isActive === false);
  const inactiveExpenses = allMonthTransactions.filter(tx => tx.type === 'expense' && tx.isActive === false);

  const totalIncome = incomes.reduce((sum, tx) => sum + tx.amountMinor, 0);
  const totalExpense = expenses.reduce((sum, tx) => sum + tx.amountMinor, 0);

  // 4. Считаем плановые взносы по целям
  const relevantOperations = plannedOperations.filter(op => 
    op.plannedMonth === month && 
    activeGoalIds.has(op.goalId)
  );

  const totalContribution = relevantOperations.reduce((sum, op) => sum + op.plannedAmountMinor, 0);

  // 5. Итоговый баланс
  const balance = totalIncome - totalExpense - totalContribution;

  // 6. Есть ли вообще данные
  const hasData = allMonthTransactions.length > 0 || relevantOperations.length > 0;

  return {
    incomes,
    expenses,
    inactiveIncomes,
    inactiveExpenses,
    contributions: relevantOperations,
    totalIncome,
    totalExpense,
    totalContribution,
    balance,
    hasData
  };
}
