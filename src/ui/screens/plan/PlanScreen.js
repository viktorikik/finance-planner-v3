/* ==========================================================================
   Экран «План».
   Добавлены: глазок (скрытие сумм), фильтр (кратко/долго), сворачивание.
   ========================================================================== */
import { getAllFromStore } from '../../../infrastructure/database/transaction.js';
import { executeCommand } from '../../../application/commands/executeCommand.js';
import { calculateGoalBalance, calculateTotalAccumulated, calculatePoolBalance } from '../../../domain/statistics/balances.js';
import { generateId } from '../../../domain/shared/ids.js';

// Состояние UI (сохраняется между рендерами)
const collapsedGoals = new Set();
let currentFilter = 'all'; // 'all' | 'short' | 'long'
let isAmountHidden = localStorage.getItem('hideAmounts') === 'true';

export async function renderPlanScreen(container, db) {
  const tx = db.transaction(['goals', 'moneyEntries', 'plannedOperations', 'actualIncomes'], 'readonly');
  const goals = await getAllFromStore('goals', tx);
  const moneyEntries = await getAllFromStore('moneyEntries', tx);
  const allPlannedOps = await getAllFromStore('plannedOperations', tx);
  const actualIncomes = await getAllFromStore('actualIncomes', tx);

  const activeGoals = goals.filter(g => g.status === 'active');
  const achievedGoals = goals.filter(g => g.status === 'achieved');
  const totalAccumulated = calculateTotalAccumulated(moneyEntries);
  const poolBalance = calculatePoolBalance(moneyEntries);
  
  const formatRub = (kopeks) => (kopeks / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 });
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentDate = new Date().toISOString().slice(0, 10);
  
  const currentMonthIncomes = actualIncomes
    .filter(inc => inc.actualDate.startsWith(currentMonth))
    .reduce((sum, inc) => sum + inc.amountMinor, 0);

  // Фильтрация и сортировка целей
  let filteredGoals = activeGoals;
  if (currentFilter === 'short') filteredGoals = activeGoals.filter(g => g.category === 'short');
  if (currentFilter === 'long') filteredGoals = activeGoals.filter(g => g.category === 'long');
  
  // Сортировка: сначала краткосрочные, потом долгосрочные
  filteredGoals.sort((a, b) => {
    if (a.category === 'short' && b.category === 'long') return -1;
    if (a.category === 'long' && b.category === 'short') return 1;
    return 0;
  });

  let html = `
    <div style="text-align: center; margin-bottom: 20px; position: relative;">
      <div style="font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px;">Всего накоплено</div>
      <div style="font-size: 32px; font-weight: 800; color: var(--green);" class="${isAmountHidden ? 'blurred' : ''}">${formatRub(totalAccumulated)} ₽</div>
      
      <!-- Кнопка Глазик -->
      <button id="toggle-eye" style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); background: none; border: none; font-size: 24px; cursor: pointer; opacity: 0.7; padding: 8px;">
        ${isAmountHidden ? '🙈' : '👁️'}
      </button>
    </div>

    <!-- Блок ДОХОДОВ -->
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
        <h2 style="color: var(--green); margin-bottom: 8px;">Общий пул (Свободные деньги)</h2>
        <div style="font-size: 24px; font-weight: bold;" class="${isAmountHidden ? 'blurred' : ''}">${formatRub(poolBalance)} ₽</div>
      </section>
    ` : ''}

    <section class="card">
      <h2>Создать цель</h2>
      <form id="create-goal-form" class="create-goal-form">
        <input type="text" id="goal-name" placeholder="Название цели" required>
        <input type="number" id="goal-target" placeholder="Сумма (₽)" required>
        <div class="form-row-bottom">
          <select id="goal-category" style="padding: 12px 14px; border-radius: 10px; font-size: 16px;">
            <option value="short">⚡ Краткосрочная</option>
            <option value="long" selected>🏦 Долгосрочная</option>
          </select>
          <input type="month" id="goal-deadline" required value="${new Date().getFullYear() + 1}-12">
        </div>
        <button type="submit" class="btn">Создать цель</button>
      </form>
    </section>

    <!-- Фильтр -->
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
        .filter(op => op.goalId === goal.id && op.state === 'scheduled')
        .sort((a, b) => a.plannedMonth.localeCompare(b.plannedMonth));

      const isExpanded = !collapsedGoals.has(goal.id); // По умолчанию развернуто
      const visiblePlans = isExpanded ? goalPlans.slice(0, 3) : []; // Всегда показываем только 3 в свернутом/базовом виде

      let plansHtml = '';
      if (goalPlans.length > 0) {
        plansHtml = `
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
                ${isExpanded ? 'Скрыть лишние' : `Показать все (${goalPlans.length})`}
              </button>
            ` : ''}
          </div>
        `;
      }

      html += `
        <div class="goal-item">
          <!-- Шапка карточки (кликабельная для сворачивания) -->
          <div class="goal-header" data-goal-id="${goal.id}">
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

          <!-- Тело карточки (скрывается при сворачивании) -->
          <div class="goal-body" style="display: ${isExpanded ? 'flex' : 'none'}; flex-direction: column; gap: 12px; margin-top: 12px;">
            <div class="goal-progress ${isAmountHidden ? 'blurred' : ''}">
              <span class="percent">${percent}%</span>
            </div>
            <div class="progress-bar"><div class="fill" style="width: ${percent}%"></div></div>

            ${plansHtml}

            <div class="goal-actions-grid">
              ${goal.deadlineMonth && balance < target && goalPlans.length === 0 ? `
                <button type="button" class="btn btn-small auto-plan-btn" data-goal-id="${goal.id}">✨ Автоплан</button>
              ` : ''}
              <button type="button" class="btn btn-small btn-outline toggle-manual-btn" data-goal-id="${goal.id}">+ Свой план</button>
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
          </div>

          <!-- Кнопки управления (Всегда видны, чтобы можно было удалить/достичь) -->
          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;">
            ${percent >= 100 ? `<button class="btn-icon achieve" data-goal-id="${goal.id}" title="Достигнута" style="font-size: 14px; color: var(--green);">Выполнено</button>` : ''}
            <button class="btn-icon delete" data-goal-id="${goal.id}" title="Удалить" style="font-size: 18px;">×</button>
          </div>
        </div>
      `;
    }
  }

  html += `</div></section>`;

  if (achievedGoals.length > 0) {
    html += `
      <section class="card" style="opacity: 0.7;">
        <h2>Архив (Достигнутые цели)</h2>
        ${achievedGoals.map(g => `
          <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border);">
            <span><s>${g.name}</s></span>
            <span style="color: var(--green);" class="${isAmountHidden ? 'blurred' : ''}">${formatRub(g.targetAmountMinor)} ₽</span>
          </div>
        `).join('')}
      </section>
    `;
  }

  container.innerHTML = html;

  /* --- ОБРАБОТЧИКИ --- */

  // Переключатель Глазик
  document.getElementById('toggle-eye').addEventListener('click', () => {
    isAmountHidden = !isAmountHidden;
    localStorage.setItem('hideAmounts', isAmountHidden);
    renderPlanScreen(container, db);
  });

  // Фильтр
  container.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      renderPlanScreen(container, db);
    });
  });

  // Сворачивание/Разворачивание карточки
  container.querySelectorAll('.goal-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const goalId = btn.dataset.goalId;
      if (collapsedGoals.has(goalId)) collapsedGoals.delete(goalId);
      else collapsedGoals.add(goalId);
      renderPlanScreen(container, db);
    });
  });

  // Добавление дохода
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

  // Создание цели
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
    btn.addEventListener('click', () => {
      const goalId = btn.dataset.goalId;
      if (collapsedGoals.has(goalId)) collapsedGoals.delete(goalId);
      else collapsedGoals.add(goalId);
      renderPlanScreen(container, db);
    });
  });

  container.querySelectorAll('.clear-plans-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить ВСЕ плановые взносы для этой цели?')) return;
      const goalId = btn.dataset.goalId;
      const cmd = { commandId: generateId(), commandType: 'plannedOperation.clearForGoal', payload: { goalId }, registeredAt: new Date().toISOString() };
      try { btn.disabled = true; btn.textContent = '...'; await executeCommand(db, cmd); await renderPlanScreen(container, db); } catch (err) { alert(err.message); btn.disabled = false; }
    });
  });

  container.querySelectorAll('.auto-plan-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Система разделит оставшуюся сумму на равные части до дедлайна. Продолжить?')) return;
      const goalId = btn.dataset.goalId;
      const cmd = { commandId: generateId(), commandType: 'plannedOperation.generate', payload: { goalId, currentMonth }, registeredAt: new Date().toISOString() };
      try { btn.disabled = true; btn.textContent = '...'; await executeCommand(db, cmd); await renderPlanScreen(container, db); } catch (err) { alert(err.message); btn.disabled = false; }
    });
  });

  container.querySelectorAll('.delete-plan').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить этот плановый взнос?')) return;
      const cmd = { commandId: generateId(), commandType: 'plannedOperation.delete', payload: { operationId: btn.dataset.opId }, registeredAt: new Date().toISOString() };
      try { await executeCommand(db, cmd); await renderPlanScreen(container, db); } catch (err) { alert(err.message); }
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
      try { const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = '...'; await executeCommand(db, cmd); await renderPlanScreen(container, db); } catch (err) { alert(err.message); form.querySelector('button').disabled = false; }
    });
  });

  container.querySelectorAll('.add-contrib-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const goalId = form.dataset.goalId;
      const amountRub = parseFloat(form.querySelector('.contrib-amount').value);
      if (isNaN(amountRub) || amountRub <= 0) return;

      const cmd = { commandId: generateId(), commandType: 'contribution.create', payload: { goalId, amountMinor: Math.round(amountRub * 100), actualDate: currentDate, type: 'additional' }, registeredAt: new Date().toISOString() };
      try { const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = '...'; await executeCommand(db, cmd); await renderPlanScreen(container, db); } catch (err) { alert(err.message); form.querySelector('button').disabled = false; }
    });
  });

  container.querySelectorAll('.btn-icon.achieve').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Цель достигнута! Деньги списываются, цель уходит в архив.')) return;
      const cmd = { commandId: generateId(), commandType: 'goal.achieve', payload: { goalId: btn.dataset.goalId }, registeredAt: new Date().toISOString() };
      try { await executeCommand(db, cmd); await renderPlanScreen(container, db); } catch (err) { alert(err.message); }
    });
  });

  container.querySelectorAll('.btn-icon.delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const goalId = btn.dataset.goalId;
      const goal = activeGoals.find(g => g.id === goalId);
      const balance = calculateGoalBalance(goalId, moneyEntries);
      let moveToPool = false;
      if (balance > 0) { moveToPool = confirm(`На цели "${goal.name}" есть ${formatRub(balance)} ₽.\n\nОК — перевести в Общий пул.\nОтмена — сжечь (удалить).`); } else { if (!confirm('Удалить цель?')) return; }
      const cmd = { commandId: generateId(), commandType: 'goal.delete', payload: { goalId, moveToPool }, registeredAt: new Date().toISOString() };
      try { await executeCommand(db, cmd); await renderPlanScreen(container, db); } catch (err) { alert(err.message); }
    });
  });
}
