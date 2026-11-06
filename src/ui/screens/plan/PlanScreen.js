/* ==========================================================================
   Экран «План».
   Добавлен блок учета фактических доходов.
   ========================================================================== */
import { getAllFromStore } from '../../../infrastructure/database/transaction.js';
import { executeCommand } from '../../../application/commands/executeCommand.js';
import { calculateGoalBalance, calculateTotalAccumulated, calculatePoolBalance } from '../../../domain/statistics/balances.js';
import { generateId } from '../../../domain/shared/ids.js';

const expandedGoals = new Set();

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
  
  // Доходы за текущий месяц
  const currentMonthIncomes = actualIncomes
    .filter(inc => inc.actualDate.startsWith(currentMonth))
    .reduce((sum, inc) => sum + inc.amountMinor, 0);

  let html = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px;">Всего накоплено</div>
      <div style="font-size: 32px; font-weight: 800; color: var(--green);">${formatRub(totalAccumulated)} ₽</div>
    </div>

    <!-- Блок ДОХОДОВ -->
    <section class="card" style="border-color: var(--border);">
      <h2 style="display: flex; justify-content: space-between; align-items: center;">
        <span>Доходы в этом месяце</span>
        <span style="color: var(--accent); font-size: 18px;">+${formatRub(currentMonthIncomes)} ₽</span>
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
        <div style="font-size: 24px; font-weight: bold;">${formatRub(poolBalance)} ₽</div>
      </section>
    ` : ''}

    <section class="card">
      <h2>Создать цель</h2>
      <form id="create-goal-form" class="create-goal-form">
        <input type="text" id="goal-name" placeholder="Название цели" required>
        <input type="number" id="goal-target" placeholder="Сумма (₽)" required>
        <div class="form-row-bottom">
          <input type="month" id="goal-deadline" required value="${new Date().getFullYear() + 1}-12">
          <button type="submit" class="btn">Создать</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Активные цели</h2>
      <div id="goals-list">
  `;

  if (activeGoals.length === 0) {
    html += `<p class="muted">Пока нет активных целей.</p>`;
  } else {
    for (const goal of activeGoals) {
      const balance = calculateGoalBalance(goal.id, moneyEntries);
      const target = goal.targetAmountMinor;
      const percent = target > 0 ? Math.min(100, Math.round((balance / target) * 100)) : 0;
      
      const goalPlans = allPlannedOps
        .filter(op => op.goalId === goal.id && op.state === 'scheduled')
        .sort((a, b) => a.plannedMonth.localeCompare(b.plannedMonth));

      const isExpanded = expandedGoals.has(goal.id);
      const visiblePlans = isExpanded ? goalPlans : goalPlans.slice(0, 3);

      let plansHtml = '';
      if (goalPlans.length > 0) {
        plansHtml = `
          <div class="goal-plans-container">
            <div class="plans-header">
              <span>График взносов (${goalPlans.length})</span>
              <button type="button" class="btn-text clear-plans-btn" data-goal-id="${goal.id}" style="color: var(--red);">Очистить</button>
            </div>
            <div class="plans-list">
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
              <button type="button" class="btn-text toggle-plans-btn" data-goal-id="${goal.id}" style="width: 100%; text-align: center; margin-top: 4px;">
                ${isExpanded ? 'Скрыть' : `Показать все (${goalPlans.length})`}
              </button>
            ` : ''}
          </div>
        `;
      }

      html += `
        <div class="goal-item">
          <div class="goal-info">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <strong>${goal.name}</strong>
              <div style="display:flex; gap: 8px;">
                ${percent >= 100 ? `<button class="btn-icon achieve" data-goal-id="${goal.id}" title="Достигнута">✓</button>` : ''}
                <button class="btn-icon delete" data-goal-id="${goal.id}" title="Удалить">×</button>
              </div>
            </div>
            <div class="goal-progress">
              ${formatRub(balance)} ₽ / ${formatRub(target)} ₽
              <span class="percent">${percent}%</span>
            </div>
            <div class="progress-bar"><div class="fill" style="width: ${percent}%"></div></div>
          </div>

          ${plansHtml}

          <div class="goal-actions-grid">
            ${goal.deadlineMonth && balance < target && goalPlans.length === 0 ? `
              <button type="button" class="btn btn-small auto-plan-btn" data-goal-id="${goal.id}">
                ✨ Автоплан
              </button>
            ` : ''}
            <button type="button" class="btn btn-small btn-outline toggle-manual-btn" data-goal-id="${goal.id}">
              + Свой план
            </button>
          </div>

          <form class="manual-plan-form" data-goal-id="${goal.id}" style="display:none; flex-direction: column; gap: 8px; margin-bottom: 8px;">
            <input type="month" class="m-month" required value="${currentMonth}" style="width: 100%; padding: 10px; font-size: 14px;">
            <input type="number" class="m-amount" placeholder="Сумма (₽)" required style="width: 100%; padding: 10px; font-size: 14px;">
            <button type="submit" class="btn btn-small" style="background: var(--accent); width: 100%;">Добавить в план</button>
          </form>

          <form class="add-contrib-form" data-goal-id="${goal.id}">
            <input type="number" placeholder="Внести факт (₽)" required class="contrib-amount">
            <button type="submit" class="btn btn-small" title="Внести факт">+</button>
          </form>
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
            <span style="color: var(--green);">${formatRub(g.targetAmountMinor)} ₽</span>
          </div>
        `).join('')}
      </section>
    `;
  }

  container.innerHTML = html;

  /* --- ОБРАБОТЧИКИ --- */

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
      await executeCommand(db, cmd);
      await renderPlanScreen(container, db);
    } catch (err) {
      alert('Ошибка: ' + err.message);
      e.target.querySelector('button').disabled = false;
    }
  });

  document.getElementById('create-goal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('goal-name').value;
    const targetRub = parseFloat(document.getElementById('goal-target').value);
    const deadlineMonth = document.getElementById('goal-deadline').value || null;
    if (!name || isNaN(targetRub) || targetRub <= 0) return;

    const cmd = {
      commandId: generateId(), commandType: 'goal.create',
      payload: { name, category: 'long', targetAmountMinor: Math.round(targetRub * 100), deadlineMonth },
      registeredAt: new Date().toISOString()
    };
    try {
      const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = '...';
      await executeCommand(db, cmd); await renderPlanScreen(container, db);
    } catch (err) { alert('Ошибка: ' + err.message); e.target.querySelector('button').disabled = false; }
  });

  container.querySelectorAll('.toggle-plans-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const goalId = btn.dataset.goalId;
      if (expandedGoals.has(goalId)) expandedGoals.delete(goalId);
      else expandedGoals.add(goalId);
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
