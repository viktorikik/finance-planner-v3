/* ==========================================================================
   Экран «План».
   Добавлена SVG-иконка глаза, кнопка удаления, поле даты, раздельное сворачивание
   и виджет бюджета (Шаг C). Исправлены локальные даты и тексты.
   ========================================================================== */
import { getAllFromStore } from '../../../infrastructure/database/transaction.js';
import { executeCommand } from '../../../application/commands/executeCommand.js';
import { calculateGoalBalance, calculateTotalAccumulated, calculatePoolBalance } from '../../../domain/statistics/balances.js';
import { forecastGoal } from '../../../domain/forecasting/goalForecast.js';
import { calculateRequiredContribution } from '../../../domain/forecasting/calculateRequiredContribution.js';
import { generateId } from '../../../domain/shared/ids.js';
import { renderBudgetWidget } from '../../widgets/BudgetWidget.js';

const collapsedGoals = new Set();
const expandedPlans = new Set();
let currentFilter = 'all';
let isAmountHidden = typeof localStorage !== 'undefined' ? localStorage.getItem('hideAmounts') === 'true' : false;
let openSettingsGoalId = null;
const forecastCache = new Map();

const SVG_EYE_OPEN = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const SVG_EYE_CLOSED = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

export async function renderPlanScreen(container, db) {
  const tx = db.transaction(['goals', 'moneyEntries', 'plannedOperations', 'actualIncomes', 'settings'], 'readonly');
  const goals = await getAllFromStore('goals', tx);
  const moneyEntries = await getAllFromStore('moneyEntries', tx);
  const allPlannedOps = await getAllFromStore('plannedOperations', tx);
  const actualIncomes = await getAllFromStore('actualIncomes', tx);
  
  const settingsTx = db.transaction(['settings'], 'readonly');
  const generalInflationSetting = await new Promise((resolve) => {
    const req = settingsTx.objectStore('settings').get('generalInflationRate');
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => resolve(null);
  });

  const activeGoals = goals.filter(g => g.status === 'active');
  const achievedGoals = goals.filter(g => g.status === 'achieved');
  const totalAccumulated = calculateTotalAccumulated(moneyEntries);
  const poolBalance = calculatePoolBalance(moneyEntries);
  
  // ИСПОЛЬЗУЕМ ЛОКАЛЬНОЕ ВРЕМЯ ВМЕСТО UTC
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

  let html = `
    <div style="text-align: center; margin-bottom: 20px; position: relative;">
      <div style="font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px;">Всего накоплено</div>
      <div style="font-size: 32px; font-weight: 800; color: var(--green);" class="${isAmountHidden ? 'blurred' : ''}">${formatRub(totalAccumulated)} ₽</div>
      <button id="toggle-eye" style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; opacity: 0.7; padding: 8px; color: var(--text);">
        ${isAmountHidden ? SVG_EYE_CLOSED : SVG_EYE_OPEN}
      </button>
    </div>

    <div id="budget-widget-container" style="margin-bottom: 16px;"></div>

    <section class="card" style="border-color: var(--border);">
      <h2 style="display: flex; justify-content: space-between; align-items: center;">
        <span>Доходы в этом месяце</span>
        <span style="color: var(--accent); font-size: 18px;" class="${isAmountHidden ? 'blurred' : ''}">+${formatRub(currentMonthIncomes)} ₽</span>
      </h2>
      <form id="add-income-form" style="display: flex; gap: 8px; align-items: center;">
        <input type="number" id="income-amount" placeholder="Сумма (₽)" required style="flex: 1; min-width: 0; padding: 10px 14px; font-size: 14px;">
        <select id="income-category" style="padding: 10px 14px; font-size: 14px; width: auto;">
          <option value="salary">Зарплата</option>
          <option value="freelance">Фриланс</option>
          <option value="gift">Подарок</option>
          <option value="other">Другое</option>
        </select>
        <button type="submit" class="btn btn-small" style="flex-shrink: 0;">+</button>
      </form>
    </section>

    ${poolBalance > 0 ? `
      <section class="card" style="border-color: var(--green); background: rgba(61, 220, 151, 0.05);">
        <h2 style="color: var(--green); margin-bottom: 8px;">Свободные деньги</h2>
        <div style="font-size: 24px; font-weight: bold; margin-bottom: 4px;" class="${isAmountHidden ? 'blurred' : ''}">${formatRub(poolBalance)} ₽</div>
        <div style="font-size: 12px; color: var(--muted);">Деньги, не привязанные к конкретной цели. Вы можете распределить их позже.</div>
      </section>
    ` : ''}

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
        <button type="submit" class="btn">Создать цель</button>
      </form>
    </section>

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
      
      // ЗАЩИТА: отфильтровываем операции без plannedMonth
      const goalPlans = allPlannedOps
        .filter(op => op.goalId === goal.id && op.state === 'scheduled' && op.plannedMonth)
        .sort((a, b) => (a.plannedMonth || '').localeCompare(b.plannedMonth || ''));

      const isExpanded = !collapsedGoals.has(goal.id);
      const isPlansExpanded = expandedPlans.has(goal.id);
      const visiblePlans = isPlansExpanded ? goalPlans : goalPlans.slice(0, 3);
      const isSettingsOpen = openSettingsGoalId === goal.id;

      let forecastHtml = '';
      const cacheKey = `${goal.id}_${balance}_${goal.targetAmountMinor}_${goal.annualRate}_${goal.individualInflationRate}_${goal.indexationEnabled}_${goal.indexationRate}_${goal.planMode}_${goal.manualMonthlyAmountMinor}_${goal.deadlineMonth}`;
      
      if (!forecastCache.has(cacheKey)) {
        let reqContrib = null;
        let futureOps = [];

        if (goalPlans.length > 0) {
          futureOps = goalPlans.map(op => ({ plannedMonth: op.plannedMonth, plannedAmountMinor: op.plannedAmountMinor }));
        } else if (goal.deadlineMonth && goal.planMode === 'auto') {
           const req = calculateRequiredContribution(goal, balance, generalInflationSetting, currentMonth, goal.deadlineMonth);
           if (req.status === 'success') {
             reqContrib = req.requiredBaseContributionMinor;
             // ВАЖНО: маппим поля из calculateRequiredContribution в формат forecastGoal
             futureOps = req.requiredSchedule.map(op => ({ plannedMonth: op.month, plannedAmountMinor: op.amountMinor }));
           }
        } else if (goal.planMode === 'manual' && goal.manualMonthlyAmountMinor) {
          const monthsToGenerate = goal.deadlineMonth ? (() => {
            const [sY, sM] = currentMonth.split('-').map(Number);
            const [dY, dM] = goal.deadlineMonth.split('-').map(Number);
            return Math.max(1, (dY - sY) * 12 + (dM - sM) + 1);
          })() : 120;

          let [cy, cm] = currentMonth.split('-').map(Number);
          for (let i = 0; i < monthsToGenerate; i++) {
            let amt = goal.manualMonthlyAmountMinor;
            if (goal.indexationEnabled) {
              amt = Math.round(amt * Math.pow(1 + goal.indexationRate / 100, Math.floor(i/12)));
            }
            futureOps.push({ plannedMonth: `${cy}-${String(cm).padStart(2, '0')}`, plannedAmountMinor: amt });
            cm++; if (cm > 12) { cm = 1; cy++; }
          }
        }

        const fc = forecastGoal(goal, balance, futureOps, generalInflationSetting, currentMonth, 600);
        forecastCache.set(cacheKey, { reqContrib, fc });
      }

      const { reqContrib, fc } = forecastCache.get(cacheKey);

      if (fc.status === 'projected') {
        forecastHtml = `
          <div class="forecast-box">
            <div class="forecast-row"><span>Дата достижения:</span> <b style="color:var(--green);">${fc.forecastDate}</b></div>
            ${goal.category === 'long' ? `<div class="forecast-row"><span>Цель с инфляцией:</span> <b>${formatRub(fc.targetWithInflationMinor)} ₽</b></div>` : ''}
            ${goal.planMode === 'auto' && reqContrib ? `<div class="forecast-row"><span>Необходимый взнос:</span> <b>${formatRub(reqContrib)} ₽/мес</b></div>` : ''}
            ${goal.planMode === 'manual' && goal.manualMonthlyAmountMinor ? `<div class="forecast-row"><span>Ваш взнос:</span> <b>${formatRub(goal.manualMonthlyAmountMinor)} ₽/мес</b></div>` : ''}
          </div>
        `;
      } else if (fc.status === 'no_plan') {
        forecastHtml = `<div class="forecast-box muted" style="color:var(--muted); font-size:13px; text-align:center;">Нет будущих взносов для расчета прогноза</div>`;
      } else if (fc.status === 'insufficient_data') {
        forecastHtml = `<div class="forecast-box muted" style="color:var(--muted); font-size:13px; text-align:center;">Укажите срок и настройки для прогноза</div>`;
      } else if (fc.status === 'deadline_passed') {
        // ПРОВЕРКА: если дедлайн в будущем, но не хватает денег
        if (currentMonth <= goal.deadlineMonth) {
           forecastHtml = `<div class="forecast-box" style="color:var(--yellow); font-size:13px; text-align:center;">Не хватает взносов, чтобы успеть к сроку</div>`;
        } else {
           forecastHtml = `<div class="forecast-box" style="color:var(--red); font-size:13px; text-align:center;">Срок прошел, цель не достигнута</div>`;
        }
      }

      let settingsHtml = '';
      if (isSettingsOpen) {
        settingsHtml = `
          <form class="goal-settings-form" data-goal-id="${goal.id}">
            <div class="form-group">
              <label>Срок (дедлайн):</label>
              <input type="month" name="deadlineMonth" value="${goal.deadlineMonth || ''}">
            </div>
            <div class="form-group">
              <label>Ставка доходности (% годовых):</label>
              <input type="number" step="0.1" name="annualRate" value="${goal.annualRate !== null ? goal.annualRate : ''}" placeholder="0">
            </div>
            <div class="form-group">
              <label>Индивидуальная инфляция (% годовых):</label>
              <input type="number" step="0.1" name="individualInflationRate" value="${goal.individualInflationRate !== null ? goal.individualInflationRate : ''}" placeholder="Общая">
            </div>
            <div class="form-group" style="flex-direction: row; align-items: center; gap: 8px;">
              <input type="checkbox" name="indexationEnabled" ${goal.indexationEnabled ? 'checked' : ''}>
              <label style="margin:0;">Индексировать взнос ежегодно</label>
            </div>
            ${goal.indexationEnabled ? `
            <div class="form-group">
              <label>Ставка индексации (%):</label>
              <input type="number" step="0.1" name="indexationRate" value="${goal.indexationRate || 0}">
            </div>` : ''}
            <div class="form-group">
              <label>Режим плана:</label>
              <select name="planMode">
                <option value="auto" ${goal.planMode === 'auto' ? 'selected' : ''}>Автоматический (расчетный)</option>
                <option value="manual" ${goal.planMode === 'manual' ? 'selected' : ''}>Ручной</option>
              </select>
            </div>
            ${goal.planMode === 'manual' ? `
            <div class="form-group">
              <label>Сумма ручного взноса (₽/мес):</label>
              <input type="number" name="manualMonthlyAmountMinor" value="${goal.manualMonthlyAmountMinor ? goal.manualMonthlyAmountMinor / 100 : ''}">
            </div>` : ''}
            <div style="display:flex; gap:8px; margin-top:12px;">
              <button type="submit" class="btn btn-small" style="flex:1;">Сохранить</button>
              <button type="button" class="btn btn-small btn-outline" data-action="close-settings" style="flex:1;">Отмена</button>
            </div>
          </form>
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

          <div class="goal-body" style="display: ${isExpanded ? 'flex' : 'none'}; flex-direction: column; gap: 12px; margin-top: 12px;">
            <div class="goal-progress ${isAmountHidden ? 'blurred' : ''}">
              <span class="percent">${percent}%</span>
            </div>
            <div class="progress-bar"><div class="fill" style="width: ${percent}%"></div></div>

            ${forecastHtml}
            ${settingsHtml}

            ${goalPlans.length > 0 ? `
              <div class="goal-plans-container">
                <div class="plans-header">
                  <span>График взносов (${goalPlans.length})</span>
                  <button type="button" class="btn-text clear-plans-btn" data-goal-id="${goal.id}" style="color: var(--red);">Очистить</button>
                </div>
                <div class="plans-list ${isAmountHidden ? 'blurred' : ''}">
                  ${visiblePlans.map(op => {
                    const d = new Date(op.plannedMonth + '-01');
                    const mName = d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
                    return `
                      <div class="plan-row">
                        <span>${mName}</span>
                        <b>${formatRub(op.plannedAmountMinor)} ₽</b>
                        <button type="button" class="btn-icon delete-plan" data-op-id="${op.id}" style="color:var(--muted); font-size: 14px;">×</button>
                      </div>
                    `;
                  }).join('')}
                </div>
                ${goalPlans.length > 3 ? `
                  <button type="button" class="btn-text toggle-more-plans-btn" data-goal-id="${goal.id}" style="width: 100%; text-align: center; margin-top: 4px;">
                    ${isPlansExpanded ? 'Скрыть лишние' : `Показать все (${goalPlans.length})`}
                  </button>
                ` : ''}
              </div>
            ` : ''}

            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;">
              <button type="button" class="btn btn-small btn-outline" data-action="open-settings" data-goal-id="${goal.id}" style="flex: 1 1 40%;">⚙️ Настройки</button>
              
              ${goal.deadlineMonth && balance < target ? `
                <button type="button" class="btn btn-small auto-plan-btn" data-goal-id="${goal.id}" style="flex: 1 1 50%;">
                  ✨ ${goalPlans.length > 0 ? 'Пересчитать план' : 'Автоплан'}
                </button>
              ` : ''}
              
              <button type="button" class="btn btn-small btn-outline toggle-manual-btn" data-goal-id="${goal.id}" style="flex: 1 1 100%;">+ Свой план</button>
            </div>

            <form class="manual-plan-form" data-goal-id="${goal.id}" style="display:none; flex-direction: column; gap: 8px;">
              <input type="month" class="m-month" required value="${currentMonth}" style="width: 100%; padding: 10px; font-size: 14px;">
              <input type="number" class="m-amount" placeholder="Сумма (₽)" required style="width: 100%; padding: 10px; font-size: 14px;">
              <button type="submit" class="btn btn-small" style="background: var(--accent); width: 100%;">Добавить в план</button>
            </form>

            <form class="add-contrib-form" data-goal-id="${goal.id}">
              <input type="number" placeholder="Внести факт (₽)" required class="contrib-amount">
              <button type="submit" class="btn btn-small" title="Внести факт">+</button>
            </form>

            <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 8px;">
              ${percent >= 100 ? `<button class="btn btn-small" data-action="achieve" data-goal-id="${goal.id}" style="background:var(--green); color:#000;">Выполнено</button>` : ''}
              <button class="btn btn-small btn-outline" data-action="delete" data-goal-id="${goal.id}" style="color: var(--red); border-color: var(--red);">Удалить</button>
            </div>
          </div>
        </div>
      `;
    }
  }

  html += `</div></section>`;

  // Архив
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

  container.innerHTML = html;

  const widgetContainer = document.getElementById('budget-widget-container');
  if (widgetContainer) {
    await renderBudgetWidget(widgetContainer, db);
  }

  /* --- ОБРАБОТЧИКИ --- */

  document.getElementById('toggle-eye').addEventListener('click', () => {
    isAmountHidden = !isAmountHidden;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('hideAmounts', isAmountHidden);
    }
    renderPlanScreen(container, db);
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
      const deadlineVal = form.querySelector('[name="deadlineMonth"]').value;
      const annualRateVal = form.querySelector('[name="annualRate"]').value;
      const indInflVal = form.querySelector('[name="individualInflationRate"]').value;
      const indEnabled = form.querySelector('[name="indexationEnabled"]').checked;
      const indRateVal = form.querySelector('[name="indexationRate"]')?.value || '0';
      const planMode = form.querySelector('[name="planMode"]').value;
      const manualAmountVal = form.querySelector('[name="manualMonthlyAmountMinor"]')?.value || '';

      const payload = {
        goalId,
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

  document.getElementById('add-income-form').addEventListener('submit', async (e) => {
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

  document.getElementById('create-goal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('goal-name').value;
    const targetRub = parseFloat(document.getElementById('goal-target').value);
    const category = document.getElementById('goal-category').value;
    const deadlineMonth = document.getElementById('goal-deadline').value || null;
    if (!name || isNaN(targetRub) || targetRub <= 0) return;

    const cmd = {
      commandId: generateId(), commandType: 'goal.create',
      payload: { name, category, targetAmountMinor: Math.round(targetRub * 100), deadlineMonth },
      registeredAt: new Date().toISOString()
    };
    try {
      const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = '...';
      await executeCommand(db, cmd); await renderPlanScreen(container, db);
    } catch (err) { alert('Ошибка: ' + err.message); e.target.querySelector('button').disabled = false; }
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

      const cmd = { commandId: generateId(), commandType: 'plannedOperation.generate', payload: { goalId, currentMonth }, registeredAt: new Date().toISOString() };
      try { btn.disabled = true; btn.textContent = '...'; await executeCommand(db, cmd); forecastCache.clear(); await renderPlanScreen(container, db); } catch (err) { alert(err.message); btn.disabled = false; }
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
