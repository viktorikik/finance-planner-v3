/* ==========================================================================
   Экран «План».
   Добавлена автогенерация графика и визуализация созданных планов.
   ========================================================================== */
import { getAllFromStore } from '../../../infrastructure/database/transaction.js';
import { executeCommand } from '../../../application/commands/executeCommand.js';
import { calculateGoalBalance, calculateTotalAccumulated, calculatePoolBalance } from '../../../domain/statistics/balances.js';
import { generateId } from '../../../domain/shared/ids.js';

export async function renderPlanScreen(container, db) {
  const tx = db.transaction(['goals', 'moneyEntries', 'plannedOperations'], 'readonly');
  const goals = await getAllFromStore('goals', tx);
  const moneyEntries = await getAllFromStore('moneyEntries', tx);
  const allPlannedOps = await getAllFromStore('plannedOperations', tx);

  const activeGoals = goals.filter(g => g.status === 'active');
  const achievedGoals = goals.filter(g => g.status === 'achieved');
  const totalAccumulated = calculateTotalAccumulated(moneyEntries);
  const poolBalance = calculatePoolBalance(moneyEntries);
  
  const formatRub = (kopeks) => (kopeks / 100).toLocaleString('ru-RU');
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthLabel = new Date().toLocaleDateString('ru-RU', { month: 'long' });

  let html = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px;">Всего накоплено</div>
      <div style="font-size: 32px; font-weight: 800; color: var(--green);">${formatRub(totalAccumulated)} ₽</div>
    </div>

    ${poolBalance > 0 ? `
      <section class="card" style="border-color: var(--green); background: rgba(61, 220, 151, 0.05);">
        <h2 style="color: var(--green); margin-bottom: 8px;">Общий пул (Свободные деньги)</h2>
        <div style="font-size: 24px; font-weight: bold;">${formatRub(poolBalance)} ₽</div>
      </section>
    ` : ''}

    <section class="card">
      <h2>Создать цель</h2>
      <form id="create-goal-form" class="form-row">
        <input type="text" id="goal-name" placeholder="Название" required>
        <input type="number" id="goal-target" placeholder="Сумма (₽)" required>
        <input type="month" id="goal-deadline" style="max-width: 150px;" required>
        <button type="submit" class="btn">Добавить</button>
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
      
      // Получаем планы для этой цели
      const goalPlans = allPlannedOps
        .filter(op => op.goalId === goal.id && op.state === 'scheduled')
        .sort((a, b) => a.plannedMonth.localeCompare(b.plannedMonth));

      // Рендер списка планов
      let plansHtml = '';
      if (goalPlans.length > 0) {
        plansHtml = `
          <div class="goal-plans-list">
            <div style="font-size: 12px; color: var(--muted); margin-bottom: 4px;">График взносов:</div>
            ${goalPlans.map(op => {
              const d = new Date(op.plannedMonth + '-01');
              const mName = d.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' });
              return `
                <div class="plan-row">
                  <span>${mName}: <b>${formatRub(op.plannedAmountMinor)} ₽</b></span>
                  <button type="button" class="btn-icon delete-plan" data-op-id="${op.id}" style="font-size:16px; padding:0 4px;">×</button>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      html += `
        <div class="goal-item" style="flex-direction: column; align-items: stretch; gap: 12px;">
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

          <!-- Блок действий -->
          <div class="goal-actions">
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              ${goal.deadlineMonth && balance < target && goalPlans.length === 0 ? `
                <button type="button" class="btn btn-small auto-plan-btn" data-goal-id="${goal.id}" style="flex:1; background: rgba(255, 200, 87, 0.15); color: #ffc857; border: 1px solid #ffc857;">
                  ✨ Сформировать план до ${goal.deadlineMonth}
                </button>
              ` : ''}
              <button type="button" class="btn btn-small btn-outline toggle-manual-btn" data-goal-id="${goal.id}" style="flex:1;">
                + Свой взнос
              </button>
            </div>

            <!-- Скрытая форма ручного добавления плана -->
            <form class="manual-plan-form" data-goal-id="${goal.id}" style="display:none; gap:6px; margin-bottom: 8px;">
              <input type="month" class="m-month" required value="${currentMonth}" style="flex:1; padding: 8px; font-size: 14px;">
              <input type="number" class="m-amount" placeholder="Сумма (₽)" required style="flex:1; padding: 8px; font-size: 14px;">
              <button type="submit" class="btn btn-small" style="background: var(--accent);">ОК</button>
            </form>

            <!-- Форма ФАКТА -->
            <form class="add-contrib-form" data-goal-id="${goal.id}" style="margin:0;">
              <input type="number" placeholder="Внести реальные деньги (₽)" required class="contrib-amount" style="flex:1;">
              <button type="submit" class="btn btn-small" title="Внести факт">+</button>
            </form>
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
            <span style="color: var(--green);">${formatRub(g.targetAmountMinor)} ₽</span>
          </div>
        `).join('')}
      </section>
    `;
  }

  container.innerHTML = html;

  /* --- ОБРАБОТЧИКИ --- */

  // Создание цели
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

  // Автогенерация плана
  container.querySelectorAll('.auto-plan-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Система разделит оставшуюся сумму на равные части до дедлайна. Продолжить?')) return;
      const goalId = btn.dataset.goalId;
      const cmd = {
        commandId: generateId(), commandType: 'plannedOperation.generate',
        payload: { goalId, currentMonth }, registeredAt: new Date().toISOString()
      };
      try {
        btn.disabled = true; btn.textContent = '...';
        await executeCommand(db, cmd); await renderPlanScreen(container, db);
      } catch (err) { alert('Ошибка: ' + err.message); btn.disabled = false; }
    });
  });

  // Удаление плана (крестик)
  container.querySelectorAll('.delete-plan').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить этот плановый взнос?')) return;
      const cmd = {
        commandId: generateId(), commandType: 'plannedOperation.delete',
        payload: { operationId: btn.dataset.opId }, registeredAt: new Date().toISOString()
      };
      try {
        await executeCommand(db, cmd); await renderPlanScreen(container, db);
      } catch (err) { alert('Ошибка: ' + err.message); }
    });
  });

  // Показ/скрытие формы ручного ввода
  container.querySelectorAll('.toggle-manual-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const goalId = btn.dataset.goalId;
      const form = container.querySelector(`.manual-plan-form[data-goal-id="${goalId}"]`);
      form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    });
  });

  // Ручное добавление плана
  container.querySelectorAll('.manual-plan-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const goalId = form.dataset.goalId;
      const plannedMonth = form.querySelector('.m-month').value;
      const amountRub = parseFloat(form.querySelector('.m-amount').value);
      if (!plannedMonth || isNaN(amountRub) || amountRub <= 0) return;

      const cmd = {
        commandId: generateId(), commandType: 'plannedOperation.create',
        payload: { goalId, plannedMonth, plannedAmountMinor: Math.round(amountRub * 100) },
        registeredAt: new Date().toISOString()
      };
      try {
        const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = '...';
        await executeCommand(db, cmd); await renderPlanScreen(container, db);
      } catch (err) { alert('Ошибка: ' + err.message); form.querySelector('button').disabled = false; }
    });
  });

  // Фактический взнос
  container.querySelectorAll('.add-contrib-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const goalId = form.dataset.goalId;
      const amountRub = parseFloat(form.querySelector('.contrib-amount').value);
      if (isNaN(amountRub) || amountRub <= 0) return;

      const cmd = {
        commandId: generateId(), commandType: 'contribution.create',
        payload: { goalId, amountMinor: Math.round(amountRub * 100), actualDate: new Date().toISOString().slice(0, 10), type: 'additional' },
        registeredAt: new Date().toISOString()
      };
      try {
        const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = '...';
        await executeCommand(db, cmd); await renderPlanScreen(container, db);
      } catch (err) { alert('Ошибка: ' + err.message); form.querySelector('button').disabled = false; }
    });
  });

  // Достижение цели
  container.querySelectorAll('.btn-icon.achieve').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Цель достигнута! Деньги списываются, цель уходит в архив.')) return;
      const cmd = {
        commandId: generateId(), commandType: 'goal.achieve',
        payload: { goalId: btn.dataset.goalId }, registeredAt: new Date().toISOString()
      };
      try { await executeCommand(db, cmd); await renderPlanScreen(container, db); } catch (err) { alert(err.message); }
    });
  });

  // Удаление цели
  container.querySelectorAll('.btn-icon.delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const goalId = btn.dataset.goalId;
      const goal = activeGoals.find(g => g.id === goalId);
      const balance = calculateGoalBalance(goalId, moneyEntries);
      let moveToPool = false;

      if (balance > 0) {
        moveToPool = confirm(`На цели "${goal.name}" есть ${formatRub(balance)} ₽.\n\nОК — перевести в Общий пул.\nОтмена — сжечь (удалить).`);
      } else {
        if (!confirm('Удалить цель?')) return;
      }
      
      const cmd = {
        commandId: generateId(), commandType: 'goal.delete',
        payload: { goalId, moveToPool }, registeredAt: new Date().toISOString()
      };
      try { await executeCommand(db, cmd); await renderPlanScreen(container, db); } catch (err) { alert(err.message); }
    });
  });
}
