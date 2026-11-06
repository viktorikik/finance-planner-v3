/* ==========================================================================
   Экран «План».
   ========================================================================== */
import { getAllFromStore } from '../../../infrastructure/database/transaction.js';
import { executeCommand } from '../../../application/commands/executeCommand.js';
import { calculateGoalBalance, calculateTotalAccumulated } from '../../../domain/statistics/balances.js';
import { generateId } from '../../../domain/shared/ids.js';

export async function renderPlanScreen(container, db) {
  const tx = db.transaction(['goals', 'moneyEntries'], 'readonly');
  const goals = await getAllFromStore('goals', tx);
  const moneyEntries = await getAllFromStore('moneyEntries', tx);

  const totalAccumulated = calculateTotalAccumulated(moneyEntries);
  const formattedTotal = (totalAccumulated / 100).toLocaleString('ru-RU');

  let html = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px;">Всего накоплено</div>
      <div style="font-size: 32px; font-weight: 800; color: var(--green);">${formattedTotal} ₽</div>
    </div>

    <section class="card">
      <h2>Создать цель</h2>
      <form id="create-goal-form" class="form-row">
        <input type="text" id="goal-name" placeholder="Название (например, Отпуск)" required>
        <input type="number" id="goal-target" placeholder="Сумма (₽)" required>
        <input type="month" id="goal-deadline" style="max-width: 150px;">
        <button type="submit" class="btn">Добавить</button>
      </form>
    </section>

    <section class="card">
      <h2>Мои цели</h2>
      <div id="goals-list">
  `;

  if (goals.length === 0) {
    html += `<p class="muted">Пока нет целей. Создайте первую!</p>`;
  } else {
    for (const goal of goals) {
      const balance = calculateGoalBalance(goal.id, moneyEntries);
      const target = goal.targetAmountMinor;
      const percent = target > 0 ? Math.min(100, Math.round((balance / target) * 100)) : 0;
      
      html += `
        <div class="goal-item">
          <div class="goal-info">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <strong>${goal.name}</strong>
              <button class="btn-delete" data-goal-id="${goal.id}" title="Удалить">×</button>
            </div>
            <div class="goal-progress">
              ${(balance / 100).toLocaleString('ru-RU')} ₽ / ${(target / 100).toLocaleString('ru-RU')} ₽
              <span class="percent">${percent}%</span>
            </div>
            <div class="progress-bar"><div class="fill" style="width: ${percent}%"></div></div>
            ${goal.deadlineMonth ? `<div style="font-size: 11px; color: var(--muted); margin-top: 6px;">Срок: ${goal.deadlineMonth}</div>` : ''}
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
  container.innerHTML = html;

  // Обработчик создания цели
  document.getElementById('create-goal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('goal-name').value;
    const targetRub = parseFloat(document.getElementById('goal-target').value);
    const deadlineMonth = document.getElementById('goal-deadline').value || null;
    
    if (!name || isNaN(targetRub) || targetRub <= 0) {
      alert('Пожалуйста, введите корректное название и сумму больше нуля.');
      return;
    }

    const cmd = {
      commandId: generateId(),
      commandType: 'goal.create',
      payload: {
        name,
        category: 'long',
        targetAmountMinor: Math.round(targetRub * 100),
        deadlineMonth
      },
      registeredAt: new Date().toISOString()
    };

    try {
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      btn.textContent = '...';
      await executeCommand(db, cmd);
      await renderPlanScreen(container, db);
    } catch (err) {
      alert('Ошибка: ' + err.message);
      btn.disabled = false;
      btn.textContent = 'Добавить';
    }
  });

  // Обработчик добавления взноса
  container.querySelectorAll('.add-contrib-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const goalId = form.dataset.goalId;
      const amountInput = form.querySelector('.contrib-amount');
      const amountRub = parseFloat(amountInput.value);
      
      if (isNaN(amountRub) || amountRub <= 0) return;

      const cmd = {
        commandId: generateId(),
        commandType: 'contribution.create',
        payload: {
          goalId,
          amountMinor: Math.round(amountRub * 100),
          actualDate: new Date().toISOString().slice(0, 10),
          type: 'additional'
        },
        registeredAt: new Date().toISOString()
      };

      try {
        const btn = form.querySelector('button');
        btn.disabled = true;
        btn.textContent = '...';
        await executeCommand(db, cmd);
        await renderPlanScreen(container, db);
      } catch (err) {
        alert('Ошибка: ' + err.message);
        btn.disabled = false;
        btn.textContent = '+';
      }
    });
  });

  // Обработчик удаления цели
  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Вы уверены, что хотите удалить эту цель?')) return;
      
      const cmd = {
        commandId: generateId(),
        commandType: 'goal.delete',
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
}
