/* ==========================================================================
   Экран «Бюджет». Управление доходами, расходами и фактом + Годовой прогноз
   + Аналитика по категориям (из БД). Формы вынесены в модальные окна.
   ========================================================================== */
import { getAllFromStore } from '../../../infrastructure/database/transaction.js';
import { executeCommand } from '../../../application/commands/executeCommand.js';
import { calculateMonthlyBudget } from '../../../domain/budget/monthlyBudget.js';
import { calculateYearlyBudget } from '../../../domain/budget/yearlyBudget.js';
import { calculateBudgetExecution } from '../../../domain/budget/budgetExecution.js';
import { calculateCategoryAnalytics } from '../../../domain/budget/categoryAnalytics.js';
import { generateId } from '../../../domain/shared/ids.js';

const formatMoney = (minor) => (minor / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Функция для компактного отображения больших чисел в таблице
const formatCompactMoney = (minor) => {
  const rub = minor / 100;
  if (Math.abs(rub) >= 1000000) return (rub / 1000000).toFixed(1) + ' млн';
  if (Math.abs(rub) >= 100000) return Math.round(rub / 1000) + ' тыс.';
  return rub.toLocaleString('ru-RU');
};

// SVG-иконки
const ICON_EDIT = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
const ICON_HIDE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
const ICON_SHOW = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const ICON_DELETE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const ICON_TRASH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;

export async function renderBudgetScreen(container, db) {
  const now = new Date();
  let currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let isYearlyViewVisible = false;

  let allCategories = [];
  let categoriesMeta = {};

  async function render() {
    container.innerHTML = '<div class="loading">Загрузка бюджета...</div>';

    let goals = [], plannedOperations = [], plannedTransactions = [], actualTransactions = [];

    try {
      const tx = db.transaction(['goals', 'plannedOperations', 'plannedTransactions', 'actualTransactions', 'categories'], 'readonly');
      goals = await getAllFromStore('goals', tx);
      plannedOperations = await getAllFromStore('plannedOperations', tx);
      plannedTransactions = await getAllFromStore('plannedTransactions', tx);
      actualTransactions = await getAllFromStore('actualTransactions', tx);
      allCategories = await getAllFromStore('categories', tx);
    } catch (err) {
      console.warn('[BudgetScreen] Ошибка загрузки:', err);
      container.innerHTML = `<div class="card"><p class="muted">Ошибка загрузки базы данных. Обновите страницу.</p></div>`;
      return;
    }

    categoriesMeta = {};
    for (const cat of allCategories) {
      categoriesMeta[cat.id] = { name: cat.name, color: cat.color, emoji: cat.emoji };
    }

    const state = { goals, plannedOperations, plannedTransactions, actualTransactions };
    const execution = calculateBudgetExecution(currentMonth, state);
    const { plan, factIncomes, factExpenses, totalFactIncome, totalFactExpense } = execution;
    const analytics = calculateCategoryAnalytics(currentMonth, state, categoriesMeta);

    let yearlyHtml = '';
    if (isYearlyViewVisible) {
      const yearlyData = calculateYearlyBudget(currentMonth, state);

      const yearTotals = yearlyData.reduce((acc, item) => {
        acc.income += item.totalIncome;
        acc.expense += item.totalExpense;
        acc.contribution += item.totalContribution;
        acc.balance += item.balance;
        return acc;
      }, { income: 0, expense: 0, contribution: 0, balance: 0 });

      yearlyHtml = `
        <div class="card" style="margin-top: 16px; background: rgba(124,92,255,0.05); border-color: var(--accent);">
          <h2 style="color: var(--accent); margin-bottom: 4px;">Прогноз на 12 месяцев (План)</h2>
          <p style="font-size: 12px; color: var(--muted); margin-bottom: 12px;">Нажмите на строку месяца, чтобы открыть детали.</p>

          <div class="yearly-table">
            ${yearlyData.map(item => {
              const [y, m] = item.month.split('-').map(Number);
              const monthName = new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'short' });
              const yearShort = String(y).slice(2);
              const isNegative = item.balance < 0;
              const balanceColor = isNegative ? 'var(--red)' : 'var(--green)';
              const totalExp = item.totalExpense + item.totalContribution;

              return `
                <div class="yearly-row ${isNegative ? 'yearly-row-negative' : ''}" data-month="${item.month}">
                  <div class="yearly-row-top">
                    <span class="yearly-month">${monthName} <span style="color:var(--muted); font-size:11px;">'${yearShort}</span></span>
                    <span class="yearly-balance" style="color:${balanceColor};">${item.balance > 0 ? '+' : ''}${formatCompactMoney(item.balance)} ₽</span>
                  </div>
                  <div class="yearly-row-bottom">
                    <span class="yearly-income">Доход: +${formatCompactMoney(item.totalIncome)}</span>
                    <span class="yearly-expense">Расход: -${formatCompactMoney(totalExp)}</span>
                  </div>
                </div>
              `;
            }).join('')}

            <div class="yearly-row yearly-total-row">
              <div class="yearly-row-top">
                <span class="yearly-month">Итого за год</span>
                <span class="yearly-balance" style="color:${yearTotals.balance < 0 ? 'var(--red)' : 'var(--green)'};">
                  ${yearTotals.balance > 0 ? '+' : ''}${formatCompactMoney(yearTotals.balance)} ₽
                </span>
              </div>
              <div class="yearly-row-bottom">
                <span class="yearly-income">Доход: +${formatCompactMoney(yearTotals.income)}</span>
                <span class="yearly-expense">Расход: -${formatCompactMoney(yearTotals.expense + yearTotals.contribution)}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // Расчет остатков
    const factBalance = totalFactIncome - totalFactExpense;
    const planBalance = plan.totalIncome - plan.totalExpense - (plan.totalContribution || 0);
    
    const isFactNegative = factBalance < 0;
    const isPlanNegative = planBalance < 0;

    let summaryHtml = `
      <div class="budget-summary" style="background:var(--card-2); padding:16px; border-radius:12px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--muted); margin-bottom:8px; border-bottom:1px solid var(--border); padding-bottom:4px;">
          <span>Категория</span>
          <span>План / <b>Факт</b></span>
        </div>
        <div class="summary-row">
          <span class="muted">Доходы:</span>
          <span>+${formatMoney(plan.totalIncome)} / <b style="color:var(--green)">+${formatMoney(totalFactIncome)}</b></span>
        </div>
        <div class="summary-row">
          <span class="muted">Расходы:</span>
          <span>-${formatMoney(plan.totalExpense)} / <b style="color:var(--red)">-${formatMoney(totalFactExpense)}</b></span>
        </div>
        <div class="summary-row">
          <span class="muted">Взносы в цели:</span>
          <span>-${formatMoney(plan.totalContribution || 0)}</span>
        </div>
        <div class="summary-row" style="border-top:1px solid var(--border); margin-top:8px; padding-top:8px; font-weight:bold;">
          <span>Остаток:</span>
          <span>
            <span style="color: ${isPlanNegative ? 'var(--red)' : 'var(--green)'}">${formatMoney(planBalance)}</span>
            /
            <span style="color: ${isFactNegative ? 'var(--red)' : 'var(--green)'}">${formatMoney(factBalance)}</span> ₽
          </span>
        </div>
      </div>
    `;

    let analyticsHtml = '';
    if (analytics.categories.length > 0) {
      const sourceLabel = analytics.source === 'fact' ? 'по фактическим тратам' : 'по плану (фактов пока нет)';
      analyticsHtml = `
        <div class="card" style="margin-top: 16px;">
          <h2 style="margin-bottom: 4px;">Куда уходят деньги</h2>
          <p style="font-size: 12px; color: var(--muted); margin-bottom: 16px;">${sourceLabel}</p>

          ${analytics.categories.map(cat => `
            <div style="margin-bottom: 14px;">
              <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:6px;">
                <span style="font-weight:600; color:${cat.color};">${cat.emoji || ''} ${cat.name}</span>
                <span style="color:var(--muted);">${formatMoney(cat.amountMinor)} ₽ · ${cat.percent.toFixed(0)}%</span>
              </div>
              <div style="height:8px; background:var(--border); border-radius:4px; overflow:hidden;">
                <div style="height:100%; width:${cat.percent}%; background:${cat.color}; border-radius:4px; transition: width 0.3s;"></div>
              </div>
            </div>
          `).join('')}

          <div style="display:flex; justify-content:space-between; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border); font-weight: 700;">
            <span>Итого</span>
            <span>${formatMoney(analytics.totalMinor)} ₽</span>
          </div>
        </div>
      `;
    }

    const activePlanIds = new Set([
      ...plan.incomes, 
      ...plan.expenses, 
      ...plan.inactiveIncomes, 
      ...plan.inactiveExpenses
    ].map(t => t.id));

    container.innerHTML = `
      <h2 style="margin: 0 0 16px 0; font-size: 20px;">Бюджет</h2>

      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h2>Месяц</h2>
          <input type="month" id="budget-month-picker" value="${currentMonth}" style="width:auto; padding:8px; font-size:14px;">
        </div>

        ${summaryHtml}

        <div class="actions-row" style="margin-bottom: 8px;">
          <button class="btn btn-outline" id="btn-add-income">+ План доход</button>
          <button class="btn btn-outline" id="btn-add-expense">+ План расход</button>
        </div>
        <div class="actions-row" style="margin-bottom: 8px;">
          <button class="btn" id="btn-add-fact-income" style="background:var(--green); color:#000;">+ Факт доход</button>
          <button class="btn" id="btn-add-fact-expense" style="background:var(--red);">+ Факт расход</button>
        </div>

        <button class="btn btn-text" id="btn-toggle-yearly" style="width: 100%; margin-top: 8px; border: 1px dashed var(--border); padding: 10px;">
          ${isYearlyViewVisible ? 'Скрыть прогноз на год' : '📅 Показать прогноз на 12 месяцев'}
        </button>
      </div>

      ${yearlyHtml}
      ${analyticsHtml}

      <div class="card">
        <h2>Плановые операции</h2>
        ${renderTransactionsList(plan.incomes, plan.inactiveIncomes, 'План: Доходы', 'income', factIncomes)}
        ${renderTransactionsList(plan.expenses, plan.inactiveExpenses, 'План: Расходы', 'expense', factExpenses)}
        ${(!plan.incomes.length && !plan.expenses.length) ? '<p class="muted">Нет плановых операций.</p>' : ''}
      </div>

      <div class="card">
        <h2>Фактические операции (без плана)</h2>
        ${renderStandaloneFacts(factIncomes, factExpenses, activePlanIds)}
      </div>

      <div class="modal-overlay" id="form-modal">
        <div class="modal-content" id="form-modal-content"></div>
      </div>
    `;

    initSwipe(container);

    document.getElementById('budget-month-picker').addEventListener('change', (e) => {
      currentMonth = e.target.value;
      render();
    });

    document.getElementById('btn-toggle-yearly').addEventListener('click', () => {
      isYearlyViewVisible = !isYearlyViewVisible;
      render();
    });

    container.querySelectorAll('.yearly-row[data-month]').forEach(row => {
      row.addEventListener('click', () => {
        currentMonth = row.dataset.month;
        isYearlyViewVisible = false;
        render();
      });
    });

    document.getElementById('btn-add-income').addEventListener('click', () => showPlannedForm('income'));
    document.getElementById('btn-add-expense').addEventListener('click', () => showPlannedForm('expense'));
    document.getElementById('btn-add-fact-income').addEventListener('click', () => showFactForm('income'));
    document.getElementById('btn-add-fact-expense').addEventListener('click', () => showFactForm('expense'));

    container.querySelectorAll('[data-action="add-fact-to-plan"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const planId = btn.dataset.planId;
        const allPlans = [...plan.incomes, ...plan.expenses];
        const plannedTx = allPlans.find(t => t.id === planId);
        if (plannedTx) showFactForm(plannedTx.type, plannedTx);
      });
    });

    container.querySelectorAll('[data-action="toggle"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
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
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const txId = btn.dataset.id;
        const allTxs = [...plan.incomes, ...plan.expenses, ...plan.inactiveIncomes, ...plan.inactiveExpenses];
        const tx = allTxs.find(t => t.id === txId);
        if (tx) showPlannedForm(tx.type, tx);
      });
    });

    document.getElementById('form-modal').addEventListener('click', (e) => {
      if (e.target.id === 'form-modal') {
        e.target.classList.remove('active');
      }
    });
  }

  function initSwipe(container) {
    container.querySelectorAll('.swipe-wrapper').forEach(wrapper => {
      const item = wrapper.querySelector('.swipe-item');
      let startX = 0;
      let currentX = 0;
      let isDragging = false;
      let isOpen = false;
      const threshold = 40;
      const openDistance = -80;

      const deleteBtn = wrapper.querySelector('.swipe-action');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const type = deleteBtn.dataset.type;
          const id = deleteBtn.dataset.id;
          if (type === 'plan') {
            if (!confirm('Удалить этот план? (Факты останутся)')) return;
            await executeCommand(db, { commandId: generateId(), commandType: 'plannedTransaction.delete', payload: { id } });
          } else {
            if (!confirm('Удалить этот факт?')) return;
            await executeCommand(db, { commandId: generateId(), commandType: 'actualTransaction.delete', payload: { id } });
          }
          render();
        });
      }

      const desktopDelete = wrapper.querySelector('.desktop-delete');
      if (desktopDelete) {
        desktopDelete.addEventListener('click', async (e) => {
          e.stopPropagation();
          const type = desktopDelete.dataset.type;
          const id = desktopDelete.dataset.id;
          if (type === 'plan') {
            if (!confirm('Удалить этот план? (Факты останутся)')) return;
            await executeCommand(db, { commandId: generateId(), commandType: 'plannedTransaction.delete', payload: { id } });
          } else {
            if (!confirm('Удалить этот факт?')) return;
            await executeCommand(db, { commandId: generateId(), commandType: 'actualTransaction.delete', payload: { id } });
          }
          render();
        });
      }

      item.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
        item.style.transition = 'none';
      }, { passive: true });

      item.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const deltaX = e.touches[0].clientX - startX;
        
        if (deltaX > 0 && !isOpen) {
          currentX = 0;
        } else if (deltaX < 0 && isOpen) {
          currentX = Math.max(openDistance + deltaX, openDistance);
        } else {
          currentX = Math.min(0, deltaX);
        }
        item.style.transform = `translateX(${currentX}px)`;
      }, { passive: true });

      item.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        item.style.transition = 'transform 0.3s ease';
        
        if (currentX < -threshold) {
          item.style.transform = `translateX(${openDistance}px)`;
          isOpen = true;
          currentX = openDistance;
        } else {
          item.style.transform = 'translateX(0)';
          isOpen = false;
          currentX = 0;
        }
      });

      document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target) && isOpen) {
          item.style.transform = 'translateX(0)';
          isOpen = false;
          currentX = 0;
        }
      });
    });
  }

  function renderTransactionsList(activeItems, inactiveItems, title, type, allFactItems) {
    const allItems = [...activeItems, ...inactiveItems];
    if (!allItems.length) return '';

    return `
      <div style="margin-bottom: 16px;">
        <h3 style="font-size:14px; color:var(--muted); margin-bottom:8px;">${title}</h3>
        ${allItems.map(tx => {
          const isInactive = tx.isActive === false;
          const dateInfo = tx.dayOfMonth ? `${tx.dayOfMonth}-е число` : (tx.date ? new Date(tx.date).toLocaleDateString('ru-RU') : 'Без даты');

          const linkedFacts = allFactItems.filter(f => f.plannedTransactionId === tx.id);
          const totalLinkedFact = linkedFacts.reduce((sum, f) => sum + f.amountMinor, 0);

          return `
          <div class="swipe-wrapper" style="margin-bottom: 12px;">
            <div class="swipe-action" data-type="plan" data-id="${tx.id}">Удалить</div>
            <div class="event-item swipe-item" style="border-left-color: ${type === 'income' ? 'var(--green)' : 'var(--red)'}; opacity: ${isInactive ? '0.5' : '1'};">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div class="event-title" style="${isInactive ? 'text-decoration: line-through;' : ''}">${tx.title}</div>
                  <div class="event-meta">
                    План: ${formatMoney(tx.amountMinor)} ₽ • ${tx.frequency === 'regular' ? 'Регулярно' : 'Разово'} • ${dateInfo}
                  </div>
                  ${linkedFacts.length > 0 ? `<div class="event-meta" style="color:var(--green)">Внесено факт: ${formatMoney(totalLinkedFact)} ₽</div>` : ''}
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; align-items: flex-end;">
                  <button class="btn btn-small btn-outline" data-action="add-fact-to-plan" data-plan-id="${tx.id}" style="padding: 6px 10px; font-size: 12px;">+ Факт</button>
                  <div style="display:flex; gap:8px; align-items: center;">
                    <button class="btn-icon" data-action="edit" data-id="${tx.id}" title="Редактировать" style="color: var(--muted); display:flex; align-items:center; justify-content:center;">${ICON_EDIT}</button>
                    <button class="btn-icon" data-action="toggle" data-id="${tx.id}" data-active="${tx.isActive !== false}" title="${tx.isActive !== false ? 'Отключить' : 'Включить'}" style="display:flex; align-items:center; justify-content:center;">
                      ${tx.isActive !== false ? ICON_SHOW : ICON_HIDE}
                    </button>
                    <button class="btn-icon desktop-delete" data-type="plan" data-id="${tx.id}" title="Удалить" style="color: var(--red); display:flex; align-items:center; justify-content:center;">${ICON_TRASH}</button>
                  </div>
                </div>
              </div>

              ${linkedFacts.length > 0 ? `
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border);">
                  ${linkedFacts.map(f => `
                    <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--muted); margin-bottom: 4px;">
                      <span>Факт: ${new Date(f.actualDate).toLocaleDateString('ru-RU')}</span>
                      <span style="display:flex; gap:8px; align-items:center;">
                        <b style="color:var(--text)">${formatMoney(f.amountMinor)} ₽</b>
                        <button class="btn-icon desktop-delete" data-type="fact" data-id="${f.id}" style="color:var(--red); display:flex; align-items:center; justify-content:center;">${ICON_TRASH}</button>
                      </span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          </div>
        `}).join('')}
      </div>
    `;
  }

  function renderStandaloneFacts(factsIn, factsEx, activePlanIds) {
    const standalone = [...factsIn, ...factsEx].filter(f => !f.plannedTransactionId || !activePlanIds.has(f.plannedTransactionId));
    if (!standalone.length) return '<p class="muted">Нет внеплановых фактов.</p>';

    return standalone.map(f => `
      <div class="swipe-wrapper" style="margin-bottom: 8px;">
        <div class="swipe-action" data-type="fact" data-id="${f.id}">Удалить</div>
        <div class="event-item swipe-item" style="border-left-color: ${f.type === 'income' ? 'var(--green)' : 'var(--red)'};">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div class="event-title">${f.title}</div>
              <div class="event-meta">${new Date(f.actualDate).toLocaleDateString('ru-RU')}</div>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <b style="color:${f.type === 'income' ? 'var(--green)' : 'var(--red)'}">${formatMoney(f.amountMinor)} ₽</b>
              <button class="btn-icon desktop-delete" data-type="fact" data-id="${f.id}" style="color:var(--red); display:flex; align-items:center; justify-content:center;">${ICON_TRASH}</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  function getCategoriesForType(type) {
    return allCategories
      .filter(c => c.type === type && !c.isArchived)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function showPlannedForm(type, existingTx = null) {
    const modal = document.getElementById('form-modal');
    const content = document.getElementById('form-modal-content');
    const isIncome = type === 'income';

    const titleVal = existingTx ? existingTx.title : '';
    const amountVal = existingTx ? existingTx.amountMinor / 100 : '';
    const freqVal = existingTx ? existingTx.frequency : 'regular';
    const startMonthVal = existingTx ? existingTx.startMonth : currentMonth;
    const endMonthVal = existingTx && existingTx.endMonth ? existingTx.endMonth : '';
    const dayOfMonthVal = existingTx && existingTx.dayOfMonth ? existingTx.dayOfMonth : '';
    const dateVal = existingTx && existingTx.date ? existingTx.date : '';
    const categoryVal = existingTx && existingTx.category ? existingTx.category : '';

    const categories = getCategoriesForType(type);

    content.innerHTML = `
      <h3 style="color: ${isIncome ? 'var(--green)' : 'var(--red)'};">${existingTx ? 'Редактировать план' : 'Добавить план'}: ${isIncome ? 'Доход' : 'Расход'}</h3>
      <form id="tx-form" class="create-goal-form" style="margin-top: 16px;">
        <input type="text" id="tx-title" placeholder="Название" value="${titleVal}" required>
        <input type="number" id="tx-amount" placeholder="Сумма (в рублях)" value="${amountVal}" required min="1" step="0.01">

        <select id="tx-category">
          ${categories.map(c => `<option value="${c.id}" ${categoryVal === c.id ? 'selected' : ''}>${c.emoji || ''} ${c.name}</option>`).join('')}
        </select>

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

        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" class="btn btn-outline" id="btn-cancel">Отмена</button>
          <button type="submit" class="btn">Сохранить</button>
        </div>
      </form>
    `;
    modal.classList.add('active');

    const freqSelect = document.getElementById('tx-frequency');
    const regFields = document.getElementById('regular-fields');
    const oneTimeFields = document.getElementById('one-time-fields');

    freqSelect.addEventListener('change', (e) => {
      const isReg = e.target.value === 'regular';
      regFields.style.display = isReg ? 'flex' : 'none';
      oneTimeFields.style.display = isReg ? 'none' : 'flex';
    });

    document.getElementById('btn-cancel').addEventListener('click', () => modal.classList.remove('active'));

    document.getElementById('tx-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('tx-title').value;
      const amountMinor = Math.round(parseFloat(document.getElementById('tx-amount').value) * 100);
      const frequency = freqSelect.value;
      const startMonth = document.getElementById('tx-start-month').value;
      const category = document.getElementById('tx-category').value;

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
            payload: { id: existingTx.id, title, amountMinor, frequency, startMonth, endMonth, dayOfMonth, date, category }
          });
        } else {
          await executeCommand(db, {
            commandId: generateId(),
            commandType: 'plannedTransaction.create',
            payload: { type, title, amountMinor, frequency, startMonth, endMonth, dayOfMonth, date, category }
          });
        }
        modal.classList.remove('active');
        render();
      } catch (err) {
        alert('Ошибка: ' + err.message);
      }
    });
  }

  function showFactForm(type, plannedTx = null) {
    const modal = document.getElementById('form-modal');
    const content = document.getElementById('form-modal-content');
    const isIncome = type === 'income';
    const today = new Date().toISOString().slice(0, 10);

    const titleVal = plannedTx ? plannedTx.title : '';
    const amountVal = plannedTx ? plannedTx.amountMinor / 100 : '';
    const categoryVal = plannedTx && plannedTx.category ? plannedTx.category : '';

    const categories = getCategoriesForType(type);

    content.innerHTML = `
      <h3 style="color: ${isIncome ? 'var(--green)' : 'var(--red)'};">Внести факт: ${isIncome ? 'Доход' : 'Расход'}</h3>
      <form id="fact-form" class="create-goal-form" style="margin-top: 16px;">
        <input type="text" id="fact-title" placeholder="Название" value="${titleVal}" required>
        <input type="number" id="fact-amount" placeholder="Фактическая сумма (₽)" value="${amountVal}" required min="1" step="0.01">
        <select id="fact-category">
          ${categories.map(c => `<option value="${c.id}" ${categoryVal === c.id ? 'selected' : ''}>${c.emoji || ''} ${c.name}</option>`).join('')}
        </select>
        <div class="form-group">
          <label>Дата фактической операции:</label>
          <input type="date" id="fact-date" value="${today}" required>
        </div>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" class="btn btn-outline" id="btn-cancel-fact">Отмена</button>
          <button type="submit" class="btn">Сохранить</button>
        </div>
      </form>
    `;
    modal.classList.add('active');

    document.getElementById('btn-cancel-fact').addEventListener('click', () => modal.classList.remove('active'));

    document.getElementById('fact-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('fact-title').value;
      const amountMinor = Math.round(parseFloat(document.getElementById('fact-amount').value) * 100);
      const actualDate = document.getElementById('fact-date').value;
      const category = document.getElementById('fact-category').value;

      try {
        await executeCommand(db, {
          commandId: generateId(),
          commandType: 'actualTransaction.create',
          payload: {
            type,
            title,
            amountMinor,
            actualDate,
            category,
            plannedTransactionId: plannedTx ? plannedTx.id : null
          }
        });
        modal.classList.remove('active');
        render();
      } catch (err) {
        alert('Ошибка: ' + err.message);
      }
    });
  }

  await render();
}
