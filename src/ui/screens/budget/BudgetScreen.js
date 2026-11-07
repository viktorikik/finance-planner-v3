/* ==========================================================================
   Экран «Бюджет». Управление доходами и расходами.
   ========================================================================== */
import { getAllFromStore } from '../../../infrastructure/database/transaction.js';
import { executeCommand } from '../../../application/commands/executeCommand.js';
import { calculateMonthlyBudget } from '../../../domain/budget/monthlyBudget.js';
import { generateId } from '../../../domain/shared/ids.js';

// Хелпер для форматирования денег
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
      console.warn('[BudgetScreen] Ошибка загрузки (БД не обновлена):', err);
      container.innerHTML = `
        <div class="card" style="text-align:center; padding: 40px 20px;">
          <h2 style="color: var(--red); margin-bottom: 16px;">База данных обновляется</h2>
          <p class="muted">Пожалуйста, перезагрузите приложение (закройте его полностью и откройте заново), чтобы применились новые таблицы.</p>
          <button class="btn" onclick="window.location.reload()" style="margin-top: 16px;">Перезагрузить</button>
        </div>
      `;
      return;
    }

    const budget = calculateMonthlyBudget(currentMonth, { goals, plannedOperations, plannedTransactions });

    // HTML для экрана
    container.innerHTML = `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h2>Бюджет на месяц</h2>
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
        ${renderTransactionsList(budget.incomes, 'Доходы', 'income')}
        ${renderTransactionsList(budget.expenses, 'Расходы', 'expense')}
        ${(!budget.incomes.length && !budget.expenses.length) ? '<p class="muted">Нет запланированных доходов или расходов на этот месяц.</p>' : ''}
      </div>

      <div id="tx-form-container"></div>
    `;

    // Обработчики
    document.getElementById('budget-month-picker').addEventListener('change', (e) => {
      currentMonth = e.target.value;
      render();
    });

    document.getElementById('btn-add-income').addEventListener('click', () => showForm('income'));
    document.getElementById('btn-add-expense').addEventListener('click', () => showForm('expense'));

    // Обработчики для кнопок удаления/отключения
    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Удалить эту операцию?')) return;
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
  }

  function renderTransactionsList(items, title, type) {
    if (!items.length) return '';
    return `
      <div style="margin-bottom: 16px;">
        <h3 style="font-size:14px; color:var(--muted); margin-bottom:8px;">${title}</h3>
        ${items.map(tx => `
          <div class="event-item" style="border-left-color: ${type === 'income' ? 'var(--green)' : 'var(--red)'}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div class="event-title">${tx.title}</div>
                <div class="event-meta">
                  ${formatMoney(tx.amountMinor)} ₽ • ${tx.frequency === 'regular' ? 'Регулярно' : 'Разово'}
                </div>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn-icon" data-action="toggle" data-id="${tx.id}" data-active="${tx.isActive}" title="${tx.isActive ? 'Отключить' : 'Включить'}">
                  ${tx.isActive ? '👁️' : '🙈'}
                </button>
                <button class="btn-icon delete" data-action="delete" data-id="${tx.id}">✕</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function showForm(type) {
    const formContainer = document.getElementById('tx-form-container');
    const isIncome = type === 'income';
    formContainer.innerHTML = `
      <div class="card" style="border-color: ${isIncome ? 'var(--green)' : 'var(--red)'}">
        <h2>Добавить ${isIncome ? 'доход' : 'расход'}</h2>
        <form id="tx-form" class="create-goal-form">
          <input type="text" id="tx-title" placeholder="Название (например, Зарплата или Аренда)" required>
          <input type="number" id="tx-amount" placeholder="Сумма (в рублях)" required min="1">
          
          <div class="form-row-bottom">
            <select id="tx-frequency">
              <option value="regular">Регулярный (каждый месяц)</option>
              <option value="one-time">Разовый (только один месяц)</option>
            </select>
            <input type="month" id="tx-start-month" value="${currentMonth}" required>
          </div>
          
          <input type="month" id="tx-end-month" style="display:none;" placeholder="Месяц окончания (необязательно)">

          <button type="submit" class="btn" style="margin-top:8px;">Сохранить</button>
          <button type="button" class="btn btn-outline" id="btn-cancel" style="margin-top:8px;">Отмена</button>
        </form>
      </div>
    `;

    const freqSelect = document.getElementById('tx-frequency');
    const endMonthInput = document.getElementById('tx-end-month');
    
    freqSelect.addEventListener('change', (e) => {
      endMonthInput.style.display = e.target.value === 'regular' ? 'block' : 'none';
    });

    document.getElementById('btn-cancel').addEventListener('click', () => formContainer.innerHTML = '');

    document.getElementById('tx-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('tx-title').value;
      const amountMinor = Math.round(parseFloat(document.getElementById('tx-amount').value) * 100);
      const frequency = freqSelect.value;
      const startMonth = document.getElementById('tx-start-month').value;
      const endMonth = frequency === 'regular' ? endMonthInput.value || null : null;

      try {
        await executeCommand(db, {
          commandId: generateId(),
          commandType: 'plannedTransaction.create',
          payload: { type, title, amountMinor, frequency, startMonth, endMonth }
        });
        formContainer.innerHTML = '';
        render();
      } catch (err) {
        alert('Ошибка: ' + err.message);
      }
    });
  }

  await render();
}
