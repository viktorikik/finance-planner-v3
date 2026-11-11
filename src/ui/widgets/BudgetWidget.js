/* ==========================================================================
   Виджет бюджета для встраивания на экран «План».
   ========================================================================== */
import { getAllFromStore } from '../../infrastructure/database/transaction.js';
import { calculateBudgetExecution } from '../../domain/budget/budgetExecution.js';

const formatMoney = (minor) => (minor / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export async function renderBudgetWidget(container, db) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let execution = { plan: { hasData: false }, totalFactIncome: 0, totalFactExpense: 0 };

  try {
    const tx = db.transaction(['goals', 'plannedOperations', 'plannedTransactions', 'actualTransactions'], 'readonly');
    const goals = await getAllFromStore('goals', tx);
    const plannedOperations = await getAllFromStore('plannedOperations', tx);
    const plannedTransactions = await getAllFromStore('plannedTransactions', tx);
    const actualTransactions = await getAllFromStore('actualTransactions', tx);

    execution = calculateBudgetExecution(currentMonth, { goals, plannedOperations, plannedTransactions, actualTransactions });
  } catch (err) {
    console.warn('[BudgetWidget] Ошибка загрузки данных бюджета:', err);
  }

  const { plan, totalFactIncome, totalFactExpense } = execution;

  if (!plan.hasData && totalFactIncome === 0 && totalFactExpense === 0) {
    container.innerHTML = `
      <div class="card" style="padding: 16px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="window.location.hash='/budget'">
        <div>
          <div style="font-weight:600; font-size:14px; color:var(--text);">Бюджет на месяц</div>
          <div style="font-size:12px; color:var(--muted);">Данных пока нет</div>
        </div>
        <div style="font-size:20px; color:var(--muted);">→</div>
      </div>
    `;
    return;
  }

  // Если есть факты, показываем реальный остаток. Иначе - плановый.
  const hasFacts = totalFactIncome > 0 || totalFactExpense > 0;
  const balance = hasFacts ? (totalFactIncome - totalFactExpense) : plan.balance;
  const isNegative = balance < 0;
  const balanceColor = isNegative ? 'var(--red)' : 'var(--green)';
  
  const label = hasFacts ? 'Факт. остаток' : 'План. остаток';
  const incomeVal = hasFacts ? totalFactIncome : plan.totalIncome;
  const expenseVal = hasFacts ? totalFactExpense : (plan.totalExpense + plan.totalContribution);
  const subLabel = hasFacts ? 'Факт' : 'План';

  container.innerHTML = `
    <div class="card" style="padding: 16px; cursor:pointer;" onclick="window.location.hash='/budget'">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-weight:600; font-size:14px; color:var(--text); margin-bottom:4px;">Бюджет на месяц (${subLabel})</div>
          <div style="font-size:12px; color:var(--muted);">
            Доходы: +${formatMoney(incomeVal)} • Расходы: -${formatMoney(expenseVal)}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:700; font-size:18px; color:${balanceColor};">
            ${formatMoney(balance)} ₽
          </div>
          <div style="font-size:11px; color:${balanceColor};">${label}</div>
        </div>
      </div>
    </div>
  `;
}
