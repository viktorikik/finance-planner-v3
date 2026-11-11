/* ==========================================================================
   Экран «Бюджет». Управление доходами и расходами.
   Добавлены поля для привязки к календарю (dayOfMonth / date).
   ========================================================================== */
import { getAllFromStore } from '../../../infrastructure/database/transaction.js';
import { executeCommand } from '../../../application/commands/executeCommand.js';
import { calculateMonthlyBudget } from '../../../domain/budget/monthlyBudget.js';
import { generateId } from '../../../domain/shared/ids.js';

const formatMoney = (minor) => (minor / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export async function renderBudgetScreen(container, db) {
  const now = new Date();
  let currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  async function render() {
    container.innerHTML = '<div class="loading">Загрузка бюджета...</div>';

    let goals = [], plannedOperations = [], plannedTransactions = [];

    try {
      const tx = db.transaction(['goals', 'plannedOperations', 'plannedTransactions'], 'readonly');
      goals = await getAllFromStore('goals', tx);
      plannedOperations = await getAllFromStore('plannedOperations', tx);
      plannedTransactions = await getAllFromStore('plannedTransactions', tx);
    } catch (err) {
      console.warn('[BudgetScreen] Ошибка загрузки:', err);
      container.innerHTML = `<div class="card"><p class="muted">Ошибка загрузки базы данных. Обновите страницу.</p></div>`;
      return;
    }

    const budget = calculateMonthlyBudget(currentMonth, { goals, plannedOperations, plannedTransactions });

    container.innerHTML = `
      <div style="display:flex; align-items:center; margin-bottom: 16px; gap: 12px;">
        <button class="btn-icon" onclick="window.location.hash='/plan'" style="font-size: 24px; color: var(--text);">←</button>
        <h2 style="margin: 0; font-size: 20px;">Бюджет</h2>
      </div>

      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h2>Месяц</h2>
          <input type="month" id="budget-month-picker" value="${currentMonth}" style="width:auto; padding:8px; font-size:14px;">
        </div>

        <div class="budget-summary" style="background:var(--card-2); padding:16px; border-radius:12px; margin-bottom:16px;">
          <div class="summary-row"><span class="muted">Доходы:</span> <span style="color:var(--green)">+${formatMoney(budget.totalIncome)} ₽</span></div>
          <div class="summary-row"><span class="muted">Расходы:</span> <span style="color:var(--red)">-${formatMoney(budget.totalExpense)} ₽</span></div>
          <div class="summary-row"><span class="muted">Взносы в цели:</span> <span style="color:var(--yellow)">-${formatMoney(budget.totalContribution)} ₽</span></div>
          <div class="summary-row" style="border-top:1px solid var(--border); margin-top:8px; padding-top:8px; font-weight:bold;">
            <span>Остаток:</span> 
            <span style="color: ${budget.balance < 0 ? 'var(--red)' : 'var(--green)'}">
              ${formatMoney(budget.balance)} ₽
            </span>
          </div>
        </div>

        <div class="actions-row">
          <button class="btn btn-outline" id="btn-add-income">+ Доход</button>
          <button class="btn btn-outline" id="btn-add-expense">+ Расход</button>
        </div>
      </div>

      <div class="card">
        <h2>Список операций</h2>
        ${renderTransactionsList(budget.incomes, budget.inactiveIncomes, 'Доходы', 'income')}
        ${renderTransactionsList(budget.expenses, budget.inactiveExpenses, 'Расходы', 'expense')}
        ${(!budget.incomes.length && !budget.expenses.length && !budget.inactiveIncomes.length && !budget.inactiveExpenses.length) ? '<p class="muted">Нет запланированных доходов или расходов на этот месяц.</p>' : ''}
      </div>

      <div id="tx-form-container"></div>
    `;

    document.getElementById('budget-month-picker').addEventListener('change', (e) => {
      currentMonth = e.target.value;
      render();
    });

    document.getElementById('btn-add-income').addEventListener('click', () => showForm('income'));
    document.getElementById('btn-add-expense').addEventListener('click', () => showForm('expense'));

    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Удалить эту операцию полностью?')) return;
        await executeCommand(db, {
          commandId: generateId(),
          commandType: 'plannedTransaction.delete',
          payload: { id: btn.dataset.id }
        });
        render();
      });
    });

    container.querySelectorAll('[data-action="toggle"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const isActive = btn.dataset.active === 'true';
        await executeCommand(db, {
          commandId: generateId(),
          commandType: 'plannedTransaction.update',
          payload: { id, isActive: !isActive }
        });
        render();
      });
    });

    container.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const txId = btn.dataset.id;
        const allTxs = [...budget.incomes, ...budget.expenses, ...budget.inactiveIncomes, ...budget.inactiveExpenses];
        const tx = allTxs.find(t => t.id === txId);
        if (tx) showForm(tx.type, tx);
      });
    });
  }

  function renderTransactionsList(activeItems, inactiveItems, title, type) {
    const allItems = [...activeItems, ...inactiveItems];
    if (!allItems.length) return '';
    
    return `
      <div style="margin-bottom: 16px;">
        <h3 style="font-size:14px; color:var(--muted); margin-bottom:8px;">${title}</h3>
        ${allItems.map(tx => {
          const isInactive = tx.isActive === false;
          const dateInfo = tx.dayOfMonth ? `${tx.dayOfMonth}-е число` : (tx.date ? new Date(tx.date).toLocaleDateString('ru-RU') : 'Без даты');
          return `
          <div class="event-item" style="border-left-color: ${type === 'income' ? 'var(--green)' : 'var(--red)'}; opacity: ${isInactive ? '0.5' : '1'};">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div class="event-title" style="${isInactive ? 'text-decoration: line-through;' : ''}">${tx.title}</div>
                <div class="event-meta">
                  ${formatMoney(tx.amountMinor)} ₽ • ${tx.frequency === 'regular' ? 'Регулярно' : 'Разово'} • ${dateInfo}
                </div>
              </div>
              <div style="display:flex; gap:8px; align-items: center;">
                <button class="btn-icon" data-action="edit" data-id="${tx.id}" title="Редактировать" style="color: var(--muted);">
                  ✏️
                </button>
                <button class="btn-icon" data-action="toggle" data-id="${tx.id}" data-active="${tx.isActive !== false}" title="${tx.isActive !== false ? 'Отключить' : 'Включить'}">
                  ${tx.isActive !== false ? '👁️' : '🙈'}
                </button>
                <button class="btn-icon delete" data-action="delete" data-id="${tx.id}">✕</button>
              </div>
            </div>
          </div>
        `}).join('')}
      </div>
    `;
  }

  function showForm(type, existingTx = null) {
    const formContainer = document.getElementById('tx-form-container');
    const isIncome = type === 'income';
    
    const titleVal = existingTx ? existingTx.title : '';
    const amountVal = existingTx ? existingTx.amountMinor / 100 : '';
    const freqVal = existingTx ? existingTx.frequency : 'regular';
    const startMonthVal = existingTx ? existingTx.startMonth : currentMonth;
    const endMonthVal = existingTx && existingTx.endMonth ? existingTx.endMonth : '';
    const dayOfMonthVal = existingTx && existingTx.dayOfMonth ? existingTx.dayOfMonth : '';
    const dateVal = existingTx && existingTx.date ? existingTx.date : '';

    formContainer.innerHTML = `
      <div class="card" style="border-color: ${isIncome ? 'var(--green)' : 'var(--red)'}">
        <h2>${existingTx ? 'Редактировать' : 'Добавить'} ${isIncome ? 'доход' : 'расход'}</h2>
        <form id="tx-form" class="create-goal-form">
          <input type="text" id="tx-title" placeholder="Название" value="${titleVal}" required>
          <input type="number" id="tx-amount" placeholder="Сумма (в рублях)" value="${amountVal}" required min="1" step="0.01">
          
          <div class="form-row-bottom">
            <select id="tx-frequency">
              <option value="regular" ${freqVal === 'regular' ? 'selected' : ''}>Регулярный</option>
              <option value="one-time" ${freqVal === 'one-time' ? 'selected' : ''}>Разовый</option>
            </select>
            <input type="month" id="tx-start-month" value="${startMonthVal}" required>
          </div>

          <div id="regular-fields" style="display: ${freqVal === 'regular' ? 'flex' : 'none'}; flex-direction: column; gap: 8px;">
             <div class="form-group">
                <label>День месяца (для календаря, 1-31):</label>
                <input type="number" id="tx-day-of-month" value="${dayOfMonthVal}" placeholder="Например, 5" min="1" max="31">
             </div>
             <div class="form-group">
                <label>Месяц окончания (необязательно):</label>
                <input type="month" id="tx-end-month" value="${endMonthVal}">
             </div>
          </div>

          <div id="one-time-fields" style="display: ${freqVal === 'one-time' ? 'flex' : 'none'}; flex-direction: column; gap: 8px;">
             <div class="form-group">
                <label>Конкретная дата (для календаря):</label>
                <input type="date" id="tx-date" value="${dateVal}">
             </div>
          </div>

          <button type="submit" class="btn" style="margin-top:8px;">Сохранить</button>
          <button type="button" class="btn btn-outline" id="btn-cancel" style="margin-top:8px;">Отмена</button>
        </form>
      </div>
    `;

    const freqSelect = document.getElementById('tx-frequency');
    const regFields = document.getElementById('regular-fields');
    const oneTimeFields = document.getElementById('one-time-fields');
    
    freqSelect.addEventListener('change', (e) => {
      const isReg = e.target.value === 'regular';
      regFields.style.display = isReg ? 'flex' : 'none';
      oneTimeFields.style.display = isReg ? 'none' : 'flex';
    });

    document.getElementById('btn-cancel').addEventListener('click', () => formContainer.innerHTML = '');

    document.getElementById('tx-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('tx-title').value;
      const amountMinor = Math.round(parseFloat(document.getElementById('tx-amount').value) * 100);
      const frequency = freqSelect.value;
      const startMonth = document.getElementById('tx-start-month').value;
      
      const dayOfMonthVal = document.getElementById('tx-day-of-month').value;
      const endMonthVal = document.getElementById('tx-end-month').value;
      const dateVal = document.getElementById('tx-date').value;

      const dayOfMonth = frequency === 'regular' && dayOfMonthVal ? parseInt(dayOfMonthVal, 10) : null;
      const endMonth = frequency === 'regular' ? endMonthVal || null : null;
      const date = frequency === 'one-time' ? dateVal || null : null;

      try {
        if (existingTx) {
          await executeCommand(db, {
            commandId: generateId(),
            commandType: 'plannedTransaction.update',
            payload: { id: existingTx.id, title, amountMinor, frequency, startMonth, endMonth, dayOfMonth, date }
          });
        } else {
          await executeCommand(db, {
            commandId: generateId(),
            commandType: 'plannedTransaction.create',
            payload: { type, title, amountMinor, frequency, startMonth, endMonth, dayOfMonth, date }
          });
        }
        formContainer.innerHTML = '';
        render();
      } catch (err) {
        alert('Ошибка: ' + err.message);
      }
    });
  }

  await render();
}
