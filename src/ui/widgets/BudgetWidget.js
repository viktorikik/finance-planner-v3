/* ==========================================================================
   Виджет бюджета для встраивания на экран «План».
   ========================================================================== */
import { getAllFromStore } from '../../infrastructure/database/transaction.js';
import { calculateMonthlyBudget } from '../../domain/budget/monthlyBudget.js';

const formatMoney = (minor) => (minor / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export async function renderBudgetWidget(container, db) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const tx = db.transaction(['goals', 'plannedOperations', 'plannedTransactions'], 'readonly');
  const goals = await getAllFromStore('goals', tx);
  const plannedOperations = await getAllFromStore('plannedOperations', tx);
  const plannedTransactions = await getAllFromStore('plannedTransactions', tx);

  const budget = calculateMonthlyBudget(currentMonth, { goals, plannedOperations, plannedTransactions });

  if (!budget.hasData) {
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

  const isNegative = budget.balance < 0;
  const balanceColor = isNegative ? 'var(--red)' : 'var(--green)';
  const balanceText = isNegative ? 'Дефицит бюджета' : 'В бюджете';

  container.innerHTML = `
    <div class="card" style="padding: 16px; cursor:pointer;" onclick="window.location.hash='/budget'">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-weight:600; font-size:14px; color:var(--text); margin-bottom:4px;">Бюджет на месяц</div>
          <div style="font-size:12px; color:var(--muted);">
            Доходы: +${formatMoney(budget.totalIncome)} • Расходы: -${formatMoney(budget.totalExpense + budget.totalContribution)}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:700; font-size:18px; color:${balanceColor};">
            ${formatMoney(budget.balance)} ₽
          </div>
          <div style="font-size:11px; color:${balanceColor};">${balanceText}</div>
        </div>
      </div>
    </div>
  `;
}
