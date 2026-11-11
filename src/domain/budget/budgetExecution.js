/* ==========================================================================
   Расчет исполнения бюджета (План vs Факт) за месяц.
   ========================================================================== */
import { calculateMonthlyBudget } from './monthlyBudget.js';

export function calculateBudgetExecution(month, state) {
  const { goals = [], plannedOperations = [], plannedTransactions = [], actualTransactions = [] } = state;

  // 1. Получаем плановые показатели
  const plan = calculateMonthlyBudget(month, { goals, plannedOperations, plannedTransactions });

  // 2. Фильтруем фактические операции за этот месяц
  const monthActuals = actualTransactions.filter(tx => tx.actualDate && tx.actualDate.startsWith(month));

  const factIncomes = monthActuals.filter(tx => tx.type === 'income');
  const factExpenses = monthActuals.filter(tx => tx.type === 'expense');

  const totalFactIncome = factIncomes.reduce((sum, tx) => sum + tx.amountMinor, 0);
  const totalFactExpense = factExpenses.reduce((sum, tx) => sum + tx.amountMinor, 0);

  // 3. Считаем отклонения (Fact - Plan)
  const incomeVariance = totalFactIncome - plan.totalIncome;
  const expenseVariance = totalFactExpense - plan.totalExpense;

  return {
    plan,
    factIncomes,
    factExpenses,
    totalFactIncome,
    totalFactExpense,
    incomeVariance, // Если > 0 — заработали больше, чем планировали
    expenseVariance, // Если > 0 — перерасход, если < 0 — экономия
  };
}
