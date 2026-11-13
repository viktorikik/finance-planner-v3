/* ==========================================================================
   Экран «Бюджет». Управление доходами, расходами и фактом + Годовой прогноз
   + Аналитика по категориям. Формы вынесены в модальные окна.
   + Поддержка режима «Только чтение» (совместный доступ).
   + Добавлены стрелочки для переключения месяцев.
   + v4.4.5: имя друга в баннере read-only + валидация activeViewOwnerId.
   ========================================================================== */
import { getAllFromStore } from '../../../infrastructure/database/transaction.js';
import { executeCommand } from '../../../application/commands/executeCommand.js';
import { calculateYearlyBudget } from '../../../domain/budget/yearlyBudget.js';
import { calculateBudgetExecution } from '../../../domain/budget/budgetExecution.js';
import { calculateCategoryAnalytics } from '../../../domain/budget/categoryAnalytics.js';
import { generateId } from '../../../domain/shared/ids.js';
import { getSupabaseClient } from '../../../supabaseClient.js';
import { getActiveViewOwnerId, setActiveViewOwnerId } from '../../state.js';
import { resolveOwnerNames } from '../../utils/ownerNames.js';

const formatMoney = (minor) => (minor / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const formatCompactMoney = (minor) => {
  const rub = minor / 100;
  if (Math.abs(rub) >= 1000000) return (rub / 1000000).toFixed(1) + ' млн';
  if (Math.abs(rub) >= 100000) return Math.round(rub / 1000) + ' тыс.';
  return rub.toLocaleString('ru-RU');
};

function formatMonthTitle(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// SVG-иконки
const ICON_EDIT = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
const ICON_HIDE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
const ICON_SHOW = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const ICON_TRASH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;

export async function renderBudgetScreen(container, db) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const myId = user?.id;

  const now = new Date();
  let currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let isYearlyViewVisible = false;

  let allCategories = [];
  let categoriesMeta = {};

  // Кеш имени друга — чтобы не дёргать запрос при смене месяца
  let cachedFriendName = null;
  let cachedFriendOwnerId = null;

  async function render() {
    container.innerHTML = '<div class="loading">Загрузка бюджета...</div>';

    let goalsRaw = [], plannedOpsRaw = [], plannedTxRaw = [], actualTxRaw = [], catsRaw = [];

    try {
      const tx = db.transaction(['goals', 'plannedOperations', 'plannedTransactions', 'actualTransactions', 'categories'], 'readonly');
      goalsRaw = await getAllFromStore('goals', tx);
      plannedOpsRaw = await getAllFromStore('plannedOperations', tx);
      plannedTxRaw = await getAllFromStore('plannedTransactions', tx);
      actualTxRaw = await getAllFromStore('actualTransactions', tx);
      catsRaw = await getAllFromStore('categories', tx);
    } catch (err) {
      console.warn('[BudgetScreen] Ошибка загрузки:', err);
      container.innerHTML = `<div class="card"><p class="muted">Ошибка загрузки базы данных. Обновите страницу.</p></div>`;
      return;
    }

    // === Определение контекста + валидация activeViewOwnerId ===
    const ownerIdSet = new Set();
    [goalsRaw, plannedOpsRaw, plannedTxRaw, actualTxRaw, catsRaw].forEach(arr =>
      arr.forEach(x => { if (x._ownerId) ownerIdSet.add(x._ownerId); })
    );

    let targetOwnerId = getActiveViewOwnerId();
    if (!targetOwnerId || (targetOwnerId !== myId && !ownerIdSet.has(targetOwnerId))) {
      targetOwnerId = myId;
      setActiveViewOwnerId(null);
    }
    const isReadOnly = targetOwnerId !== myId;

    // === Имя друга (кешируем в closure, чтобы не дёргать при смене месяца) ===
    let friendName = null;
    if (isReadOnly) {
      if (cachedFriendOwnerId === targetOwnerId && cachedFriendName) {
        friendName = cachedFriendName;
      } else {
        const names = await resolveOwnerNames(supabase, [targetOwnerId]);
        friendName = names[targetOwnerId] || null;
        cachedFriendName = friendName;
        cachedFriendOwnerId = targetOwnerId;
      }
    } else {
      cachedFriendName = null;
      cachedFriendOwnerId = null;
    }

    // === Фильтрация данных ===
    const goals = goalsRaw.filter(g => (g._ownerId || myId) === targetOwnerId);
    const plannedOperations = plannedOpsRaw.filter(op => (op._ownerId || myId) === targetOwnerId);
    const plannedTransactions = plannedTxRaw.filter(t => (t._ownerId || myId) === targetOwnerId);
    const actualTransactions = actualTxRaw.filter(t => (t._ownerId || myId) === targetOwnerId);
    allCategories = catsRaw.filter(c => (c._ownerId || myId) === targetOwnerId);

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
                <span class="yearly-expense">Расход: -${formatCompactMoney(yearTotals
