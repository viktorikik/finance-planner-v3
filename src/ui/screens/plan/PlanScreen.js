/* ==========================================================================
   Экран «План».
   ========================================================================== */
import { getAllFromStore } from '../../../infrastructure/database/transaction.js';
import { executeCommand } from '../../../application/commands/executeCommand.js';
import { calculateGoalBalance, calculateTotalAccumulated, calculatePoolBalance } from '../../../domain/statistics/balances.js';
import { generateId } from '../../../domain/shared/ids.js';

export async function renderPlanScreen(container, db) {
  const tx = db.transaction(['goals', 'moneyEntries'], 'readonly');
  const goals = await getAllFromStore('goals', tx);
  const moneyEntries = await getAllFromStore('moneyEntries', tx);

  const activeGoals = goals.filter(g => g.status === 'active');
  const achievedGoals = goals.filter(g => g.status === 'achieved');

  const totalAccumulated = calculateTotalAccumulated(moneyEntries);
  const poolBalance = calculatePoolBalance(moneyEntries);
  
  const formatRub = (kopeks) => (kopeks / 100).toLocaleString('ru-RU');

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
        <input type="month" id="goal-deadline" style="max-width: 150px;">
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
          <form class="add-contrib-form" data-goal-id="${goal.id}">
            <input type="number" placeholder="Взнос (₽)" required class="contrib-amount">
            <button type="submit" class="btn btn-small">+</button>
          </form>
        </div>
      `;
    }
  }

  html += `</div></section>`;

  // Блок Архива
  if (achievedGoals.length > 0) {
    html += `
      <section class="card" style="opacity: 0.7;">
        <h2>Архив (Достигнутые цели)</h2>
        <div>
          ${achievedGoals.map(g => `
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border);">
              <span><s>${g.name}</s></span>
              <span style="color: var(--green);">${formatRub(g.targetAmountMinor)} ₽</span>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  container.innerHTML = html;

  // Обработчики
  document.getElementById('create-goal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('goal-name').value;
    const targetRub = parseFloat(document.getElementById('goal-target').value);
    const deadlineMonth = document.getElementById('goal-deadline').value || null;
    
    if (!name || isNaN(targetRub) || targetRub <= 0) return;

    const cmd = {
      commandId: generateId(),
      commandType: 'goal.create',
      payload: { name, category: 'long', targetAmountMinor: Math.round(targetRub * 100), deadlineMonth },
      registeredAt: new Date().toISOString()
    };

    try {
      const btn = e.target.querySelector('button');
      btn.disabled = true; btn.textContent = '...';
      await executeCommand(db, cmd);
      await renderPlanScreen(container, db);
    } catch (err) {
      alert('Ошибка: ' + err.message);
      btn.disabled = false; btn.textContent = 'Добавить';
    }
  });

  container.querySelectorAll('.add-contrib-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const goalId = form.dataset.goalId;
      const amountRub = parseFloat(form.querySelector('.contrib-amount').value);
      if (isNaN(amountRub) || amountRub <= 0) return;

      const cmd = {
        commandId: generateId(),
        commandType: 'contribution.create',
        payload: { goalId, amountMinor: Math.round(amountRub * 100), actualDate: new Date().toISOString().slice(0, 10), type: 'additional' },
        registeredAt: new Date().toISOString()
      };

      try {
        const btn = form.querySelector('button');
        btn.disabled = true; btn.textContent = '...';
        await executeCommand(db, cmd);
        await renderPlanScreen(container, db);
      } catch (err) {
        alert('Ошибка: ' + err.message);
        btn.disabled = false; btn.textContent = '+';
      }
    });
  });

  // Достижение цели
  container.querySelectorAll('.btn-icon.achieve').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Поздравляем! Цель достигнута. Деньги будут списаны (потрачены), а цель уйдет в архив. Продолжить?')) return;
      
      const cmd = {
        commandId: generateId(),
        commandType: 'goal.achieve',
        payload: { goalId: btn.dataset.goalId },
        registeredAt: new Date().toISOString()
      };

      try {
        await executeCommand(db, cmd);
        await renderPlanScreen(container, db);
      } catch (err) {
        alert('Ошибка: ' + err.message);
      }
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
        const choice = confirm(
          `На цели "${goal.name}" есть ${formatRub(balance)} ₽.\n\n` +
          `Нажмите ОК, чтобы ПЕРЕВЕСТИ деньги в Общий пул (для других целей).\n` +
          `Нажмите Отмена, чтобы УДАЛИТЬ эти деньги из системы (если это тест).`
        );
        moveToPool = choice;
      } else {
        if (!confirm('Удалить цель?')) return;
      }
      
      const cmd = {
        commandId: generateId(),
        commandType: 'goal.delete',
        payload: { goalId, moveToPool },
        registeredAt: new Date().toISOString()
      };

      try {
        await executeCommand(db, cmd);
        await renderPlanScreen(container, db);
      } catch (err) {
        alert('Ошибка: ' + err.message);
      }
    });
  });
}
