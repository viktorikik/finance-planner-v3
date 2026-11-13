/* ==========================================================================
   Виджет «Бюджет» на экране «План».
   ========================================================================== */
import { getAllFromStore } from '../../infrastructure/database/transaction.js';
import { calculateMonthlyBudget } from '../../domain/budget/monthlyBudget.js';
import { navigate } from '../../app/router.js';
import { getSupabaseClient } from '../../supabaseClient.js';

export async function renderBudgetWidget(container, db, targetOwnerId = null) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const myId = user?.id;
  const ownerId = targetOwnerId || myId;

  const tx = db.transaction(['plannedTransactions', 'actualTransactions', 'plannedOperations', 'goals', 'moneyEntries'], 'readonly');
  
  const allPlannedTx = await getAllFromStore('plannedTransactions', tx);
  const allActualTx = await getAllFromStore('actualTransactions', tx);
  const allGoals = await getAllFromStore('goals', tx);
  const allPlannedOps = await getAllFromStore('plannedOperations', tx);
  const allEntries = await getAllFromStore('moneyEntries', tx);

  const plannedTx = allPlannedTx.filter(t => (t._ownerId || myId) === ownerId);
  const actualTx = allActualTx.filter(t => (t._ownerId || myId) === ownerId);
  const goals = allGoals.filter(g => (g._ownerId || myId) === ownerId);
  const plannedOps = allPlannedOps.filter(op => (op._ownerId || myId) === ownerId);
  const moneyEntries = allEntries.filter(e => (e._ownerId || myId) === ownerId);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // calculateMonthlyBudget требует передачу состояния (история)
  // Создаем адаптер для совместимости с текущим Domain
  const state = { plannedTransactions: plannedTx, actualTransactions: actualTx, goals, plannedOperations: plannedOps, moneyEntries };
  
  const budget = calculateMonthlyBudget(currentMonth, state);
  const formatRub = (kopeks) => (kopeks / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 });

  // Вычисляем остаток: Доходы (план) - Расходы (план) - Взносы (план)
  const plannedIncome = budget.plannedIncome || 0;
  const plannedExpense = budget.plannedExpense || 0;
  const plannedContributions = budget.plannedContributions || 0;
  const balance = plannedIncome - plannedExpense - plannedContributions;

  container.innerHTML = `
    <div class="card" style="cursor: pointer; border-color: var(--accent); background: rgba(124,92,255,0.05);" id="budget-widget-card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Бюджет на этот месяц</div>
          <div style="font-size: 20px; font-weight: 700; color: ${balance < 0 ? 'var(--red)' : 'var(--green)'};">
            ${balance < 0 ? '' : '+'}${formatRub(balance)} ₽
          </div>
        </div>
        <div style="color: var(--accent); font-size: 24px;">→</div>
      </div>
    </div>
  `;

  document.getElementById('budget-widget-card').addEventListener('click', () => {
    navigate('budget');
  });
}
