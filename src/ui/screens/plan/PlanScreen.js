/* ==========================================================================
   Экран «План».
   - Поддержка совместного доступа (переключатель и read-only режим).
   ========================================================================== */
import { getAllFromStore } from '../../../infrastructure/database/transaction.js';
import { executeCommand } from '../../../application/commands/executeCommand.js';
import { calculateGoalBalance, calculateTotalAccumulated, calculatePoolBalance } from '../../../domain/statistics/balances.js';
import { forecastGoal } from '../../../domain/forecasting/goalForecast.js';
import { calculateRequiredContribution } from '../../../domain/forecasting/calculateRequiredContribution.js';
import { generateId } from '../../../domain/shared/ids.js';
import { renderBudgetWidget } from '../../widgets/BudgetWidget.js';
import { getSupabaseClient } from '../../../supabaseClient.js';
import { getActiveViewOwnerId, setActiveViewOwnerId } from '../../state.js';

const collapsedGoals = new Set();
const expandedPlans = new Set();
let currentFilter = 'all';
let isAmountHidden = typeof localStorage !== 'undefined' ? localStorage.getItem('hideAmounts') === 'true' : false;
let openSettingsGoalId = null;
let openTransferGoalId = null;
let isPoolTransferOpen = false;
const forecastCache = new Map();

const SVG_EYE_OPEN = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const SVG_EYE_CLOSED = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
const ICON_EDIT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;

function buildSchedule(balance, futureOps, annualRate) {
  let currentBalance = balance;
  const monthlyRate = annualRate ? (Math.pow(1 + annualRate / 100, 1/12) - 1) : 0;
  
  return futureOps.map(op => {
    const contribution = op.plannedAmountMinor;
    currentBalance += contribution;
    const interest = Math.round(currentBalance * monthlyRate);
    currentBalance += interest;
    
    return {
      id: op.id,
      month: op.plannedMonth,
      contribution,
      interest,
      total: currentBalance
    };
  });
}

export async function renderPlanScreen(container, db) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const myId = user?.id;

  const tx = db.transaction(['goals', 'moneyEntries', 'plannedOperations', 'actualIncomes', 'settings', 'categories'], 'readonly');
  const allGoalsRaw = await getAllFromStore('goals', tx);
  const allMoneyEntriesRaw = await getAllFromStore('moneyEntries', tx);
  const allPlannedOpsRaw = await getAllFromStore('plannedOperations', tx);
  const actualIncomesRaw = await getAllFromStore('actualIncomes', tx);
  const allCategoriesRaw = await getAllFromStore('categories', tx);
  
  const settingsTx = db.transaction(['settings'], 'readonly');
  const generalInflationSetting = await new Promise((resolve) => {
    const req = settingsTx.objectStore('settings').get('generalInflationRate');
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => resolve(null);
  });

  // === Определение контекста (Свои данные / Данные друга) ===
  const ownerIds = new Set(allGoalsRaw.map(g => g._ownerId || myId));
  const otherOwners = [...ownerIds].filter(id => id !== myId);

  let targetOwnerId = getActiveViewOwnerId();
  if (!targetOwnerId || (targetOwnerId !== myId && !ownerIds.has(targetOwnerId))) {
    targetOwnerId = myId;
    setActiveViewOwnerId(null);
  }
  const isReadOnly = targetOwnerId !== myId;

  // === Фильтрация данных ===
  const goals = allGoalsRaw.filter(g => (g._ownerId || myId) === targetOwnerId);
  const moneyEntries = allMoneyEntriesRaw.filter(e => (e._ownerId || myId) === targetOwnerId);
  const allPlannedOps = allPlannedOpsRaw.filter(op => (op._ownerId || myId) === targetOwnerId);
  const actualIncomes = actualIncomesRaw.filter(inc => (inc._ownerId || myId) === targetOwnerId);
  const allCategories = allCategoriesRaw.filter(cat => (cat._ownerId || myId) === targetOwnerId);

  const activeGoals = goals.filter(g => g.status === 'active');
  const achievedGoals = goals.filter(g => g.status === 'achieved');
  const totalAccumulated = calculateTotalAccumulated(moneyEntries);
  const poolBalance = calculatePoolBalance(moneyEntries);
  
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  const formatRub = (kopeks) => (kopeks / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 });
  
  const currentMonthIncomes = actualIncomes
    .filter(inc => inc.actualDate.startsWith(currentMonth))
    .reduce((sum, inc) => sum + inc.amountMinor, 0);

  let filteredGoals = activeGoals;
  if (currentFilter === 'short') filteredGoals = activeGoals.filter(g => g.category === 'short');
  if (currentFilter === 'long') filteredGoals = activeGoals.filter(g => g.category === 'long');
  
  filteredGoals.sort((a, b) => {
    if (a.category === 'short' && b.category === 'long') return -1;
    if (a.category === 'long' && b.category === 'short') return 1;
    return 0;
  });

  const activeIncomeCats = allCategories
    .filter(c => c.type === 'income' && !c.isArchived)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // === Переключатель контекста ===
  let switcherHtml = '';
  if (otherOwners.length > 0) {
    switcherHtml = `
      <section class="card" style="margin-bottom: 16px; padding: 12px; border-color: ${isReadOnly ? 'var(--yellow)' : 'var(--border)'}; background: ${isReadOnly ? 'rgba(255,200,87,0.05)' : 'var(--card)'};">
        <label style="font-size: 13px; color: var(--muted); margin-bottom: 8px; display: block; font-weight: 600;">Просмотр данных:</label>
        <select id="owner-switcher" style="width: 100%; font-weight: 600; background: var(--card-2);">
          <option value="${myId}" ${targetOwnerId === myId ? 'selected' : ''}>👤 Мои данные</option>
          ${otherOwners.map(id => `<option value="${id}" ${targetOwnerId === id ? 'selected' : ''}>👥 Данные друга (совместный доступ)</option>`).join('')}
        </select>
        ${isReadOnly ? '<div style="color: var(--yellow); font-size: 12px; margin-top: 8px; font-weight: 600;">🔒 Режим чтения. Вы видите данные, которыми с вами поделились.</div>' : ''}
      </section>
    `;
  }

  let html = `
    ${switcherHtml}

    <div style="text-align: center; margin-bottom: 20px; position: relative;">
      <div style="font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px;">Всего накоплено</div>
      <div style="font-size: 32px; font-weight: 800; color: var(--green);" class="${isAmountHidden ? 'blurred' : ''}">${formatRub(totalAccumulated)} ₽</div>
      <button id="toggle-eye" style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; opacity: 0.7; padding: 8px; color: var(--text);">
        ${isAmountHidden ? SVG_EYE_CLOSED : SVG_EYE_OPEN}
      </button>
    </div>

    <div id="budget-widget-container" style="margin-bottom: 16px;"></div>

    ${!isReadOnly ? `
    <section class="card" style="border-color: var(--border);">
      <h2 style="display: flex; justify-content: space-between; align-items: center;">
        <span>Доходы в этом месяце</span>
        <span style="color: var(--accent); font-size: 18px;" class="${isAmountHidden ? 'blurred' : ''}">+${formatRub(currentMonthIncomes)} ₽</span>
      </h2>
      <form id="add-income-form" style="display: flex; gap: 8px; align-items: center;">
        <input type="number" id="income-amount" placeholder="Сумма (₽)" required style="flex: 1; min-width: 0; padding: 10px 14px; font-size: 14px;">
        <select id="income-category" style="padding: 10px 14px; font-size: 14px; width: auto;">
          ${activeIncomeCats.map(c => `<option value="${c.id}">${c.emoji || ''} ${c.name}</option>`).join('')}
        </select>
        <button type="submit" class="btn btn-small" style="flex-shrink: 0;">+</button>
      </form>
    </section>
    ` : ''}

    ${(poolBalance > 0 || isPoolTransferOpen) ? `
      <section class="card" style="border-color: var(--green); background: rgba(61, 220, 151, 0.05);">
        <h2 style="color: var(--green); margin-bottom: 8px;">Свободные деньги</h2>
        <div style="font-size: 24px; font-weight: bold; margin-bottom: 4px;" class="${isAmountHidden ? 'blurred' : ''}">${formatRub(poolBalance)} ₽</div>
        <div style="font-size: 12px; color: var(--muted); margin-bottom: 12px;">Деньги, не привязанные к конкретной цели.</div>
        
        ${!isReadOnly ? (!isPoolTransferOpen ? `
          <button class="btn btn-small btn-outline" id="btn-open-pool-transfer" style="border-color: var(--green); color: var(--green);">Перевести в цель</button>
        ` : `
          <form id="pool-transfer-form" style="display: flex; flex-direction: column; gap: 8px; background: var(--card-2); padding: 12px; border-radius: 8px;">
            <select id="transfer-target-goal" required>
              <option value="">Выберите цель</option>
              ${activeGoals.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
            </select>
            <input type="number" id="transfer-from-pool-amount" placeholder="Сумма (₽)" max="${poolBalance / 100}" required min="1">
            <div style="display: flex; gap: 8px;">
              <button type="submit" class="btn btn-small" style="flex: 1;">Перевести</button>
              <button type="button" class="btn btn-small btn-outline" id="btn-cancel-pool-transfer" style="flex: 1;">Отмена</button>
            </div>
          </form>
        `) : ''}
      </section>
    ` : ''}

    ${!isReadOnly ? `
    <section class="card">
      <h2>Создать цель</h2>
      <form id="create-goal-form" class="create-goal-form">
        <input type="text" id="goal-name" placeholder="Название цели" required>
        <input type="number" id="goal-target" placeholder="Сумма (₽)" required>
        <div class="form-row-bottom">
          <select id="goal-category">
            <option value="short">⚡ Краткосрочная</option>
            <option value="long" selected>🏦 Долгосрочная</option>
          </select>
          <input type="month" id="goal-deadline" required value="${now.getFullYear() + 1}-12">
        </div>
        
        <button type="button" class="btn-text" id="toggle-advanced-create" style="text-align: left; padding: 8px 0; color: var(--accent);">⚙️ Дополнительные настройки</button>
        
        <div id="advanced-create-fields" style="display: none; flex-direction: column; gap: 8px; background: var(--card-2); padding: 12px; border-radius: 8px; margin-bottom: 8px; border: 1px solid var(--border);">
          <div class="form-group">
            <label>Начать копить с:</label>
            <input type="month" id="goal-startMonth" value="${currentMonth}">
          </div>
          <div class="form-group">
            <label>Ставка доходности (% годовых):</label>
            <input type="number" step="0.1" id="goal-annualRate" placeholder="0">
          </div>
          <div class="form-group">
            <label>Индивидуальная инфляция (% годовых):</label>
            <input type="number" step="0.1" id="goal-inflation" placeholder="Общая">
          </div>
          <div class="form-group" style="flex-direction: row; align-items: center; gap: 8px; margin-top: 4px;">
            <input type="checkbox" id="goal-indexationEnabled" style="width: auto;">
            <label for="goal-indexationEnabled" style="margin:0;">Индексировать взнос ежегодно</label>
          </div>
          <div class="form-group" id="goal-indexationRateGroup" style="display: none; margin-top: 4px;">
            <label>Ставка индексации (%):</label>
            <input type="number" step="0.1" id="goal-indexationRate" value="0">
          </div>
        </div>

        <button type="submit" class="btn">Создать цель</button>
      </form>
    </section>
    ` : ''}

    <div class="filter-tabs">
      <button class="filter-tab ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">Все</button>
      <button class="filter-tab ${currentFilter === 'short' ? 'active' : ''}" data-filter="short">Краткосрочные</button>
      <button class="filter-tab ${currentFilter === 'long' ? 'active' : ''}" data-filter="long">Долгосрочные</button>
    </div>

    <section class="card" style="padding-top: 16px;">
      <div id="goals-list">
  `;

  if (filteredGoals.length === 0) {
    html += `<p class="muted">Нет целей в этой категории.</p>`;
  } else {
    for (const goal of filteredGoals) {
      const balance = calculateGoalBalance(goal.id, moneyEntries);
      const target = goal.targetAmountMinor;
      const percent = target > 0 ? Math.min(100, Math.round((balance / target) * 100)) : 0;
      
      const goalPlans = allPlannedOps
        .filter(op => op.goalId === goal.id && op.state === 'scheduled' && op.plannedMonth)
        .sort((a, b) => (a.plannedMonth || '').localeCompare(b.plannedMonth || ''));

      const isExpanded = !collapsedGoals.has(goal.id);
      const isPlansExpanded = expandedPlans.has(goal.id);
      const isSettingsOpen = openSettingsGoalId === goal.id;
      const isTransferOpen = openTransferGoalId === goal.id;

      const calcStartMonth = (goal.startMonth && goal.startMonth > currentMonth) ? goal.startMonth : currentMonth;

      let forecastHtml = '';
      let schedule = [];
      const cacheKey = `${goal.id}_${balance}_${goal.targetAmountMinor}_${goal.annualRate}_${goal.individualInflationRate}_${goal.indexationEnabled}_${goal.indexationRate}_${goal.planMode}_${goal.manualMonthlyAmountMinor}_${goal.deadlineMonth}_${calcStartMonth}`;
      
      if (!forecastCache.has(cacheKey)) {
        let reqContrib = null;
        let futureOps = [];

        if (goalPlans.length > 0) {
          futureOps = goalPlans.map(op => ({ id: op.id, plannedMonth: op.plannedMonth, plannedAmountMinor: op.plannedAmountMinor }));
        } else if (goal.deadlineMonth && goal.planMode === 'auto') {
           const req = calculateRequiredContribution(goal, balance, generalInflationSetting, calcStartMonth, goal.deadlineMonth);
           if (req.status === 'success') {
             reqContrib = req.requiredBaseContributionMinor;
             futureOps = req.requiredSchedule.map(op => ({ plannedMonth: op.month, plannedAmountMinor: op.amountMinor }));
           }
        } else if (goal.planMode === 'manual' && goal.manualMonthlyAmountMinor) {
          const monthsToGenerate = goal.deadlineMonth ? (() => {
            const [sY, sM] = calcStartMonth.split('-').map(Number);
            const [dY, dM] = goal.deadlineMonth.split('-').map(Number);
            return Math.max(1, (dY - sY) * 12 + (dM - sM) + 1);
          })() : 120;

          let [cy, cm] = calcStartMonth.split('-').map(Number);
          for (let i = 0; i < monthsToGenerate; i++) {
            let amt = goal.manualMonthlyAmountMinor;
            if (goal.indexationEnabled) {
              amt = Math.round(amt * Math.pow(1 + goal.indexationRate / 100, Math.floor(i/12)));
            }
            futureOps.push({ plannedMonth: `${cy}-${String(cm).padStart(2, '0')}`, plannedAmountMinor: amt });
            cm++; if (cm > 12) { cm = 1; cy++; }
          }
        }

        const fc = forecastGoal(goal, balance, futureOps, generalInflationSetting, calcStartMonth, 600);
        schedule = buildSchedule(balance, futureOps, goal.annualRate);
        
        forecastCache.set(cacheKey, { reqContrib, fc, schedule });
      }

      const { reqContrib, fc, schedule: cachedSchedule } = forecastCache.get(cacheKey);
      schedule = cachedSchedule;

      if (fc.status === 'projected') {
        forecastHtml = `
          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--muted);">Дата достижения:</span> <b style="color:var(--green);">${fc.forecastDate}</b>
            </div>
            ${goal.category === 'long' ? `
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--muted);">Цель с инфляцией:</span> <b style="color:var(--text);">${formatRub(fc.targetWithInflationMinor)} ₽</b>
            </div>` : ''}
            ${goal.planMode === 'auto' && reqContrib ? `
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--muted);">Необходимый взнос:</span> <b style="color:var(--text);">${formatRub(reqContrib)} ₽/мес</b>
            </div>` : ''}
            ${goal.planMode === 'manual' && goal.manualMonthlyAmountMinor ? `
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--muted);">Ваш взнос:</span> <b style="color:var(--text);">${formatRub(goal.manualMonthlyAmountMinor)} ₽/мес</b>
            </div>` : ''}
          </div>
        `;
      } else if (fc.status === 'no_plan') {
        forecastHtml = `<div style="color:var(--muted); font-size:13px; text-align:center;">Нет будущих взносов для расчета прогноза</div>`;
      } else if (fc.status === 'insufficient_data') {
        forecastHtml = `<div style="color:var(--muted); font-size:13px; text-align:center;">Укажите срок и настройки для прогноза</div>`;
      } else if (fc.status === 'deadline_passed') {
        if (currentMonth <= goal.deadlineMonth) {
           forecastHtml = `<div style="color:var(--yellow); font-size:13px; text-align:center;">Не хватает взносов, чтобы успеть к сроку</div>`;
        } else {
           forecastHtml = `<div style="color:var(--red); font-size:13px; text-align:center;">Срок прошел, цель не достигнута</div>`;
        }
      }

      let settingsHtml = '';
      if (isSettingsOpen && !isReadOnly) {
        // ... (код настроек цели остается прежним, но мы добавили проверку !isReadOnly)
        settingsHtml = `
          <form class="goal-settings-form" data-goal-id="${goal.id}">
            <div class="settings-section">
              <h4>🎯 Основное</h4>
              <div class="form-group">
                <label>Целевая сумма (₽):</label>
                <input type="number" name="targetAmountMinor" value="${goal.targetAmountMinor / 100}" required min="1">
              </div>
            </div>
            <div class="settings-section">
              <h4>📅 Сроки</h4>
              <div class="form-group">
                <label>Начать копить с:</label>
                <input type="month" name="startMonth" value="${goal.startMonth || currentMonth}">
              </div>
              <div class="form-group">
                <label>Закончить (дедлайн):</label>
                <input type="month" name="deadlineMonth" value="${goal.deadlineMonth || ''}">
              </div>
            </div>
            <div class="settings-section">
              <h4>📈 Доходность</h4>
              <div class="form-group">
                <label>Ставка (% годовых):</label>
                <input type="number" step="0.1" name="annualRate" value="${goal.annualRate !== null ? goal.annualRate : ''}" placeholder="0">
              </div>
            </div>
            <div class="settings-section">
              <h4>🎈 Инфляция и Индексация</h4>
              <div class="form-group">
                <label>Индивидуальная инфляция (% годовых):</label>
                <input type="number" step="0.1" name="individualInflationRate" value="${goal.individualInflationRate !== null ? goal.individualInflationRate : ''}" placeholder="Общая">
              </div>
              <div class="form-group" style="flex-direction: row; align-items: center; gap: 8px; margin-top: 8px;">
                <input type="checkbox" name="indexationEnabled" ${goal.indexationEnabled ? 'checked' : ''} style="width: auto;">
                <label style="margin:0;">Индексировать взнос ежегодно</label>
              </div>
              ${goal.indexationEnabled ? `
              <div class="form-group" style="margin-top: 8px;">
                <label>Ставка индексации (%):</label>
                <input type="number" step="0.1" name="indexationRate" value="${goal.indexationRate || 0}">
              </div>` : ''}
            </div>
            <div class="settings-section">
              <h4>⚙️ Режим плана</h4>
              <div class="form-group">
                <select name="planMode">
                  <option value="auto" ${goal.planMode === 'auto' ? 'selected' : ''}>Автоматический</option>
                  <option value="manual" ${goal.planMode === 'manual' ? 'selected' : ''}>Ручной</option>
                </select>
              </div>
              ${goal.planMode === 'manual' ? `
              <div class="form-group" style="margin-top: 8px;">
                <label>Сумма ручного взноса (₽/мес):</label>
                <input type="number" name="manualMonthlyAmountMinor" value="${goal.manualMonthlyAmountMinor ? goal.manualMonthlyAmountMinor / 100 : ''}">
              </div>` : ''}
            </div>
            <div style="display:flex; gap:8px; margin-top:16px;">
              <button type="submit" class="btn btn-small" style="flex:1;">Сохранить</button>
              <button type="button" class="btn btn-small btn-outline" data-action="close-settings" style="flex:1;">Отмена</button>
            </div>
          </form>
        `;
      }

      let transferHtml = '';
      if (isTransferOpen && !isReadOnly) {
        transferHtml = `
          <form class="goal-transfer-form" data-goal-id="${goal.id}" style="background: rgba(124,92,255,0.1); padding: 12px; border-radius: 8px; margin-top: 8px; border: 1px solid var(--accent);">
            <div class="form-group">
              <label>Сумма для вывода в свободные (макс. ${formatRub(balance)} ₽):</label>
              <input type="number" class="transfer-to-pool-amount" placeholder="Сумма (₽)" max="${balance / 100}" required min="1">
            </div>
            <div style="display: flex; gap: 8px;">
              <button type="submit" class="btn btn-small" style="flex:1;">Вывести</button>
              <button type="button" class="btn btn-small btn-outline" data-action="cancel-transfer" data-goal-id="${goal.id}" style="flex:1;">Отмена</button>
            </div>
          </form>
        `;
      }

      const visibleSchedule = isPlansExpanded ? schedule : schedule.slice(0, 3);
      const plansHtml = schedule.length > 0 ? `
        <div style="margin-top: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="font-size: 12px; color: var(--muted); font-weight: 600; text-transform: uppercase;">Детализация по месяцам</span>
            ${!isReadOnly ? `<button type="button" class="btn-text clear-plans-btn" data-goal-id="${goal.id}" style="color: var(--red); font-size: 12px;">Очистить</button>` : ''}
          </div>
          <div class="${isAmountHidden ? 'blurred' : ''}" style="display: flex; flex-direction: column;">
            ${visibleSchedule.map(row => {
              const [y, m] = row.month.split('-');
              const monthName = new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'short' });
              const yearShort = y.slice(2);
              
              return `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px dashed var(--border);">
                  <div style="flex: 0 0 45px;">
                    <div style="font-weight: 600; font-size: 14px; text-transform: capitalize; color: var(--text);">${monthName}</div>
                    <div style="font-size: 11px; color: var(--muted);">'${yearShort}</div>
                  </div>
                  <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; margin-left: 8px;">
                    <span style="font-size: 12px; color: var(--muted);">Взнос: ${formatRub(row.contribution)} ₽</span>
                    <span style="font-size: 12px; color: var(--green);">Проценты: +${formatRub(row.interest)} ₽</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px; justify-content: flex-end;">
                    <span style="font-weight: 700; font-size: 15px; white-space: nowrap; color: var(--text);">${formatRub(row.total)} ₽</span>
                    ${row.id && !isReadOnly ? `
                      <button type="button" class="btn-icon edit-plan" data-op-id="${row.id}" data-current-amount="${row.contribution}" style="color:var(--muted); padding: 4px; display: flex; align-items: center; height: 24px;">
                        ${ICON_EDIT}
                      </button>
                      <button type="button" class="btn-icon delete-plan" data-op-id="${row.id}" style="color:var(--muted); font-size: 18px; padding: 4px; line-height: 1; height: 24px;">
                        ×
                      </button>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          ${schedule.length > 3 ? `
            <button type="button" class="btn-text toggle-more-plans-btn" data-goal-id="${goal.id}" style="width: 100%; text-align: center; margin-top: 12px;">
              ${isPlansExpanded ? 'Скрыть лишние' : `Показать все (${schedule.length})`}
            </button>
          ` : ''}
        </div>
      ` : '';

      const hasForecast = forecastHtml !== '';
      const hasSchedule = plansHtml !== '';

      let detailsBlockHtml = '';
      if (hasForecast || hasSchedule) {
        detailsBlockHtml = `
          <div style="background: rgba(15, 17, 23, 0.4); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-top: 8px;">
            ${hasForecast ? `<div style="margin-bottom: ${hasSchedule ? '16px' : '0'}; padding-bottom: ${hasSchedule ? '16px' : '0'}; border-bottom: ${hasSchedule ? '1px solid var(--border)' : 'none'};">${forecastHtml}</div>` : ''}
            ${hasSchedule ? `<div>${plansHtml}</div>` : ''}
          </div>
        `;
      }

      html += `
        <div class="goal-item">
          <div class="goal-header" style="cursor: pointer;" data-action="toggle-collapse" data-goal-id="${goal.id}">
            <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
              <span style="font-size: 14px; flex-shrink: 0;">${goal.category === 'short' ? '⚡' : '🏦'}</span>
              <strong style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${goal.name}</strong>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">
              <div class="goal-header-amount ${isAmountHidden ? 'blurred' : ''}">
                ${formatRub(balance)} / ${formatRub(target)} ₽
              </div>
              <span style="color: var(--muted); font-size: 14px;">${isExpanded ? '▲' : '▼'}</span>
            </div>
          </div>

          <div class="goal-body" style="display: ${isExpanded ? 'flex' : 'none'}; flex-direction: column; gap: 16px; margin-top: 16px;">
            <div class="goal-progress ${isAmountHidden ? 'blurred' : ''}">
              <span class="percent">${percent}%</span>
            </div>
            <div class="progress-bar"><div class="fill" style="width: ${percent}%"></div></div>

            ${settingsHtml}
            ${transferHtml}
            ${detailsBlockHtml}

            ${!isReadOnly ? `
            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;">
              <button type="button" class="btn btn-small btn-outline" data-action="open-settings" data-goal-id="${goal.id}" style="flex: 1 1 30%;">⚙️</button>
              
              ${goal.deadlineMonth && balance < target ? `
                <button type="button" class="btn btn-small auto-plan-btn" data-goal-id="${goal.id}" style="flex: 1 1 40%;">
                  ✨ Автоплан
                </button>
              ` : ''}
              
              <button type="button" class="btn btn-small btn-outline toggle-manual-btn" data-goal-id="${goal.id}" style="flex: 1 1 20%;">+ План</button>
            </div>

            <form class="add-contrib-form" data-goal-id="${goal.id}">
              <input type="number" placeholder="Внести факт (₽)" required class="contrib-amount">
              <button type="submit" class="btn btn-small" title="Внести факт">+</button>
            </form>

            ${balance > 0 ? `
              <button type="button" class="btn-text" data-action="open-transfer" data-goal-id="${goal.id}" style="width: 100%; text-align: center; margin-top: 4px; color: var(--accent); font-size: 13px;">
                Вывести в свободные деньги
              </button>
            ` : ''}

            <form class="manual-plan-form" data-goal-id="${goal.id}" style="display:none; flex-direction: column; gap: 8px;">
              <input type="month" class="m-month" required value="${calcStartMonth}" style="width: 100%; padding: 10px; font-size: 14px;">
              <input type="number" class="m-amount" placeholder="Сумма (₽)" required style="width: 100%; padding: 10px; font-size: 14px;">
              <button type="submit" class="btn btn-small" style="background: var(--accent); width: 100%;">Добавить в план</button>
            </form>

            <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 8px;">
              ${percent >= 100 ? `<button class="btn btn-small" data-action="achieve" data-goal-id="${goal.id}" style="background:var(--green); color:#000;">Выполнено</button>` : ''}
              <button class="btn btn-small btn-outline" data-action="delete" data-goal-id="${goal.id}" style="color: var(--red); border-color: var(--red);">Удалить</button>
            </div>
            ` : ''}
          </div>
        </div>
      `;
    }
  }

  html += `</div></section>`;

  html += `
    <section class="card" style="opacity: 0.8;">
      <h2>Архив достижений</h2>
      ${achievedGoals.length > 0 
        ? `<p class="muted" style="text-align: left; padding: 0; margin-bottom: 12px; color: var(--green); font-weight: 600;">Вы молодец! Уже достигнуто ${achievedGoals.length} ${achievedGoals.length === 1 ? 'цель' : (achievedGoals.length < 5 ? 'цели' : 'целей')}! Продолжайте в том же духе.</p>
           <div style="display: flex; flex-direction: column; gap: 8px;">
            ${achievedGoals.map(g => `
              <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border);">
                <span><s>${g.name}</s></span>
                <span style="color: var(--green);" class="${isAmountHidden ? 'blurred' : ''}">${formatRub(g.targetAmountMinor)} ₽</span>
              </div>
            `).join('')}
           </div>`
        : `<p class="muted" style="text-align: left; padding: 0;">Достигнутых целей пока нет, но всё впереди. Работаем над достижением!</p>`
      }
    </section>
  `;

  html += `
    <div class="modal-overlay" id="edit-op-modal">
      <div class="modal-content" id="edit-op-content"></div>
    </div>
  `;

  container.innerHTML = html;

  // --- Обработчик переключателя ---
  const switcher = document.getElementById('owner-switcher');
  if (switcher) {
    switcher.addEventListener('change', (e) => {
      const val = e.target.value;
      setActiveViewOwnerId(val === myId ? null : val);
      renderPlanScreen(container, db);
    });
  }

  const widgetContainer = document.getElementById('budget-widget-container');
  if (widgetContainer) {
    await renderBudgetWidget(widgetContainer, db, targetOwnerId);
  }

  document.getElementById('toggle-eye').addEventListener('click', () => {
    isAmountHidden = !isAmountHidden;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('hideAmounts', isAmountHidden);
    }
    renderPlanScreen(container, db);
  });

  const toggleAdvBtn = document.getElementById('toggle-advanced-create');
  const advFields = document.getElementById('advanced-create-fields');
  const createIndexationCheckbox = document.getElementById('goal-indexationEnabled');
  const createIndexationRateGroup = document.getElementById('goal-indexationRateGroup');

  if (toggleAdvBtn && advFields) {
    toggleAdvBtn.addEventListener('click', () => {
      advFields.style.display = advFields.style.display === 'none' ? 'flex' : 'none';
    });
  }

  if (createIndexationCheckbox && createIndexationRateGroup) {
    createIndexationCheckbox.addEventListener('change', (e) => {
      createIndexationRateGroup.style.display = e.target.checked ? 'flex' : 'none';
    });
  }

  const btnOpenPoolTransfer = document.getElementById('btn-open-pool-transfer');
  if (btnOpenPoolTransfer) {
    btnOpenPoolTransfer.addEventListener('click', () => {
      isPoolTransferOpen = true;
      renderPlanScreen(container, db);
    });
  }

  const btnCancelPoolTransfer = document.getElementById('btn-cancel-pool-transfer');
  if (btnCancelPoolTransfer) {
    btnCancelPoolTransfer.addEventListener('click', () => {
      isPoolTransferOpen = false;
      renderPlanScreen(container, db);
    });
  }

  const poolTransferForm = document.getElementById('pool-transfer-form');
  if (poolTransferForm) {
    poolTransferForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const goalId = document.getElementById('transfer-target-goal').value;
      const amountRub = parseFloat(document.getElementById('transfer-from-pool-amount').value);
      if (!goalId || isNaN(amountRub) || amountRub <= 0) return;

      const cmd = {
        commandId: generateId(),
        commandType: 'money.transfer',
        payload: {
          from: { type: 'pool', id: 'main' },
          to: { type: 'goal', id: goalId },
          amountMinor: Math.round(amountRub * 100),
          actualDate: currentDate,
          movementType: 'poolToGoal'
        },
        registeredAt: new Date().toISOString()
      };

      try {
        const btn = poolTransferForm.querySelector('button[type="submit"]');
        btn.disabled = true; btn.textContent = '...';
        await executeCommand(db, cmd);
        isPoolTransferOpen = false;
        forecastCache.clear();
        await renderPlanScreen(container, db);
      } catch (err) {
        alert('Ошибка: ' + err.message);
      }
    });
  }

  container.querySelectorAll('[data-action="open-transfer"]').forEach(btn => {
    btn.addEventListener('click', () => {
      openTransferGoalId = btn.dataset.goalId;
      renderPlanScreen(container, db);
    });
  });

  container.querySelectorAll('[data-action="cancel-transfer"]').forEach(btn => {
    btn.addEventListener('click', () => {
      openTransferGoalId = null;
      renderPlanScreen(container, db);
    });
  });

  container.querySelectorAll('.goal-transfer-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const goalId = form.dataset.goalId;
      const amountRub = parseFloat(form.querySelector('.transfer-to-pool-amount').value);
      if (isNaN(amountRub) || amountRub <= 0) return;

      const cmd = {
        commandId: generateId(),
        commandType: 'money.transfer',
        payload: {
          from: { type: 'goal', id: goalId },
          to: { type: 'pool', id: 'main' },
          amountMinor: Math.round(amountRub * 100),
          actualDate: currentDate,
          movementType: 'goalToPool'
        },
        registeredAt: new Date().toISOString()
      };

      try {
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true; btn.textContent = '...';
        await executeCommand(db, cmd);
        openTransferGoalId = null;
        forecastCache.clear();
        await renderPlanScreen(container, db);
      } catch (err) {
        alert('Ошибка: ' + err.message);
      }
    });
  });

  container.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      renderPlanScreen(container, db);
    });
  });

  container.querySelectorAll('[data-action="toggle-collapse"]').forEach(el => {
    el.addEventListener('click', () => {
      const goalId = el.dataset.goalId;
      if (collapsedGoals.has(goalId)) collapsedGoals.delete(goalId);
      else collapsedGoals.add(goalId);
      renderPlanScreen(container, db);
    });
  });

  container.querySelectorAll('[data-action="open-settings"]').forEach(btn => {
    btn.addEventListener('click', () => {
      openSettingsGoalId = btn.dataset.goalId;
      openTransferGoalId = null;
      renderPlanScreen(container, db);
    });
  });

  container.querySelectorAll('[data-action="close-settings"]').forEach(btn => {
    btn.addEventListener('click', () => {
      openSettingsGoalId = null;
      renderPlanScreen(container, db);
    });
  });

  container.querySelectorAll('.goal-settings-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const goalId = form.dataset.goalId;
      const targetAmountVal = form.querySelector('[name="targetAmountMinor"]').value;
      const startMonthVal = form.querySelector('[name="startMonth"]').value;
      const deadlineVal = form.querySelector('[name="deadlineMonth"]').value;
      const annualRateVal = form.querySelector('[name="annualRate"]').value;
      const indInflVal = form.querySelector('[name="individualInflationRate"]').value;
      const indEnabled = form.querySelector('[name="indexationEnabled"]').checked;
      const indRateVal = form.querySelector('[name="indexationRate"]')?.value || '0';
      const planMode = form.querySelector('[name="planMode"]').value;
      const manualAmountVal = form.querySelector('[name="manualMonthlyAmountMinor"]')?.value || '';

      const payload = {
        goalId,
        targetAmountMinor: Math.round(Number(targetAmountVal) * 100),
        startMonth: startMonthVal || null,
        deadlineMonth: deadlineVal === '' ? null : deadlineVal,
        annualRate: annualRateVal === '' ? null : Number(annualRateVal),
        individualInflationRate: indInflVal === '' ? null : Number(indInflVal),
        indexationEnabled: indEnabled,
        indexationRate: Number(indRateVal),
        planMode,
        manualMonthlyAmountMinor: manualAmountVal === '' ? null : Math.round(Number(manualAmountVal) * 100)
      };

      const cmd = {
        commandId: generateId(), commandType: 'goal.updateSettings',
        payload, registeredAt: new Date().toISOString()
      };
      try {
        await executeCommand(db, cmd);
        openSettingsGoalId = null;
        forecastCache.clear();
        await renderPlanScreen(container, db);
      } catch (err) { alert('Ошибка: ' + err.message); }
    });
  });

  document.getElementById('add-income-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amountRub = parseFloat(document.getElementById('income-amount').value);
    const category = document.getElementById('income-category').value;
    if (isNaN(amountRub) || amountRub <= 0) return;

    const cmd = {
      commandId: generateId(), commandType: 'actualIncome.create',
      payload: { amountMinor: Math.round(amountRub * 100), actualDate: currentDate, category },
      registeredAt: new Date().toISOString()
    };
    try {
      const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = '...';
      await executeCommand(db, cmd); await renderPlanScreen(container, db);
    } catch (err) { alert('Ошибка: ' + err.message); e.target.querySelector('button').disabled = false; }
  });

  document.getElementById('create-goal-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('goal-name').value;
    const targetRub = parseFloat(document.getElementById('goal-target').value);
    const category = document.getElementById('goal-category').value;
    const deadlineMonth = document.getElementById('goal-deadline').value || null;
    
    const startMonth = document.getElementById('goal-startMonth').value || currentMonth;
    const annualRateVal = document.getElementById('goal-annualRate').value;
    const inflationVal = document.getElementById('goal-inflation').value;
    const indexationEnabled = document.getElementById('goal-indexationEnabled').checked;
    const indexationRateVal = document.getElementById('goal-indexationRate').value || '0';

    if (!name || isNaN(targetRub) || targetRub <= 0) return;

    const cmd = {
      commandId: generateId(), commandType: 'goal.create',
      payload: { 
        name, 
        category, 
        targetAmountMinor: Math.round(targetRub * 100), 
        deadlineMonth,
        startMonth,
        annualRate: annualRateVal === '' ? null : Number(annualRateVal),
        individualInflationRate: inflationVal === '' ? null : Number(inflationVal),
        indexationEnabled,
        indexationRate: Number(indexationRateVal)
      },
      registeredAt: new Date().toISOString()
    };
    try {
      const btn = e.target.querySelector('button[type="submit"]'); btn.disabled = true; btn.textContent = '...';
      await executeCommand(db, cmd); await renderPlanScreen(container, db);
    } catch (err) { alert('Ошибка: ' + err.message); e.target.querySelector('button[type="submit"]').disabled = false; }
  });

  container.querySelectorAll('.toggle-more-plans-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const goalId = btn.dataset.goalId;
      if (expandedPlans.has(goalId)) expandedPlans.delete(goalId);
      else expandedPlans.add(goalId);
      renderPlanScreen(container, db);
    });
  });

  container.querySelectorAll('.clear-plans-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить ВСЕ плановые взносы для этой цели?')) return;
      const goalId = btn.dataset.goalId;
      const cmd = { commandId: generateId(), commandType: 'plannedOperation.clearForGoal', payload: { goalId }, registeredAt: new Date().toISOString() };
      try { btn.disabled = true; btn.textContent = '...'; await executeCommand(db, cmd); forecastCache.clear(); await renderPlanScreen(container, db); } catch (err) { alert(err.message); btn.disabled = false; }
    });
  });

  container.querySelectorAll('.auto-plan-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const goalId = btn.dataset.goalId;
      const goal = activeGoals.find(g => g.id === goalId);
      const goalPlans = allPlannedOps.filter(op => op.goalId === goalId);
      
      if (goalPlans.length > 0) {
        if (!confirm('У вас уже есть план. Заменить его новым автоматическим расчетом?')) return;
        const clearCmd = { commandId: generateId(), commandType: 'plannedOperation.clearForGoal', payload: { goalId }, registeredAt: new Date().toISOString() };
        await executeCommand(db, clearCmd);
      } else {
        if (!confirm('Система разделит оставшуюся сумму с учетом процентов и инфляции. Продолжить?')) return;
      }

      const calcStartMonth = (goal.startMonth && goal.startMonth > currentMonth) ? goal.startMonth : currentMonth;
      const cmd = { commandId: generateId(), commandType: 'plannedOperation.generate', payload: { goalId, currentMonth: calcStartMonth }, registeredAt: new Date().toISOString() };
      try { btn.disabled = true; btn.textContent = '...'; await executeCommand(db, cmd); forecastCache.clear(); await renderPlanScreen(container, db); } catch (err) { alert(err.message); btn.disabled = false; }
    });
  });

  container.querySelectorAll('.edit-plan').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const opId = btn.dataset.opId;
      const currentAmount = parseInt(btn.dataset.currentAmount, 10) / 100;
      
      const modal = document.getElementById('edit-op-modal');
      const content = document.getElementById('edit-op-content');
      
      content.innerHTML = `
        <h3>Изменить взнос</h3>
        <p style="margin-bottom: 16px;">Введите новую сумму для этого месяца (в рублях).</p>
        <div class="modal-input">
          <input type="number" id="edit-op-amount" value="${currentAmount}" required min="1" step="1" style="font-size: 20px; font-weight: bold; text-align: center;">
        </div>
        <div style="background: rgba(124,92,255,0.1); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--accent);">
          <label style="display: flex; align-items: flex-start; gap: 10px; font-size: 13px; cursor: pointer;">
            <input type="checkbox" id="edit-op-recalc" checked style="width: 20px; height: 20px; accent-color: var(--accent); margin-top: 2px;">
            <span style="color: var(--text); line-height: 1.4;">Пересчитать оставшиеся взносы (чтобы успеть к сроку)</span>
          </label>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="btn-edit-cancel">Отмена</button>
          <button class="btn" id="btn-edit-save">Сохранить</button>
        </div>
      `;
      
      modal.classList.add('active');
      
      document.getElementById('btn-edit-cancel').addEventListener('click', () => modal.classList.remove('active'));
      
      document.getElementById('btn-edit-save').addEventListener('click', async () => {
        const newAmountRub = parseFloat(document.getElementById('edit-op-amount').value);
        const recalculateRest = document.getElementById('edit-op-recalc').checked;
        
        if (isNaN(newAmountRub) || newAmountRub <= 0) {
          alert('Введите корректную сумму больше нуля.');
          return;
        }
        
        try {
          const cmd = {
            commandId: generateId(),
            commandType: 'plannedOperation.update',
            payload: { operationId: opId, plannedAmountMinor: Math.round(newAmountRub * 100), recalculateRest },
            registeredAt: new Date().toISOString()
          };
          await executeCommand(db, cmd);
          modal.classList.remove('active');
          forecastCache.clear();
          await renderPlanScreen(container, db);
        } catch (err) {
          alert('Ошибка: ' + err.message);
        }
      });
    });
  });

  container.querySelectorAll('.delete-plan').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Удалить этот плановый взнос?')) return;
      const cmd = { commandId: generateId(), commandType: 'plannedOperation.delete', payload: { operationId: btn.dataset.opId }, registeredAt: new Date().toISOString() };
      try { await executeCommand(db, cmd); forecastCache.clear(); await renderPlanScreen(container, db); } catch (err) { alert(err.message); }
    });
  });

  container.querySelectorAll('.toggle-manual-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const form = container.querySelector(`.manual-plan-form[data-goal-id="${btn.dataset.goalId}"]`);
      form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    });
  });

  container.querySelectorAll('.manual-plan-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const goalId = form.dataset.goalId;
      const plannedMonth = form.querySelector('.m-month').value;
      const amountRub = parseFloat(form.querySelector('.m-amount').value);
      if (!plannedMonth || isNaN(amountRub) || amountRub <= 0) return;

      const existing = allPlannedOps.find(op => op.goalId === goalId && op.plannedMonth === plannedMonth);
      if (existing) { alert('На этот месяц уже есть плановый взнос!'); return; }

      const cmd = { commandId: generateId(), commandType: 'plannedOperation.create', payload: { goalId, plannedMonth, plannedAmountMinor: Math.round(amountRub * 100) }, registeredAt: new Date().toISOString() };
      try { const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = '...'; await executeCommand(db, cmd); forecastCache.clear(); await renderPlanScreen(container, db); } catch (err) { alert(err.message); form.querySelector('button').disabled = false; }
    });
  });

  container.querySelectorAll('.add-contrib-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const goalId = form.dataset.goalId;
      const amountRub = parseFloat(form.querySelector('.contrib-amount').value);
      if (isNaN(amountRub) || amountRub <= 0) return;

      const cmd = { commandId: generateId(), commandType: 'contribution.create', payload: { goalId, amountMinor: Math.round(amountRub * 100), actualDate: currentDate, type: 'additional' }, registeredAt: new Date().toISOString() };
      try { const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = '...'; await executeCommand(db, cmd); forecastCache.clear(); await renderPlanScreen(container, db); } catch (err) { alert(err.message); form.querySelector('button').disabled = false; }
    });
  });

  container.querySelectorAll('[data-action="achieve"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Цель достигнута! Деньги списываются, цель уходит в архив.')) return;
      const cmd = { commandId: generateId(), commandType: 'goal.achieve', payload: { goalId: btn.dataset.goalId }, registeredAt: new Date().toISOString() };
      try { await executeCommand(db, cmd); forecastCache.clear(); await renderPlanScreen(container, db); } catch (err) { alert(err.message); }
    });
  });

  container.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const goalId = btn.dataset.goalId;
      const goal = activeGoals.find(g => g.id === goalId);
      const balance = calculateGoalBalance(goalId, moneyEntries);
      let moveToPool = false;
      if (balance > 0) { moveToPool = confirm(`На цели "${goal.name}" есть ${formatRub(balance)} ₽.\n\nОК — перевести в Свободные деньги.\nОтмена — сжечь (удалить).`); } else { if (!confirm('Удалить цель?')) return; }
      const cmd = { commandId: generateId(), commandType: 'goal.delete', payload: { goalId, moveToPool }, registeredAt: new Date().toISOString() };
      try { await executeCommand(db, cmd); forecastCache.clear(); await renderPlanScreen(container, db); } catch (err) { alert(err.message); }
    });
  });
}
