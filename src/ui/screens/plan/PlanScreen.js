/* ==========================================================================
   Экран «План».
   Отображает цели, позволяет создавать новые и вносить взносы.
   ========================================================================== */
import { getAllFromStore } from '../../../infrastructure/database/transaction.js';
import { executeCommand } from '../../../application/commands/executeCommand.js';
import { calculateGoalBalance } from '../../../domain/statistics/balances.js';
import { generateId } from '../../../domain/shared/ids.js';

/**
 * Рендерит экран «План».
 * @param {HTMLElement} container 
 * @param {IDBDatabase} db 
 */
export async function renderPlanScreen(container, db) {
  // 1. Загружаем данные из базы
  const tx = db.transaction(['goals', 'moneyEntries'], 'readonly');
  const goals = await getAllFromStore('goals', tx);
  const moneyEntries = await getAllFromStore('moneyEntries', tx);

  // 2. Формируем HTML
  let html = `
    <section class="card">
      <h2>Создать цель</h2>
      <form id="create-goal-form" class="form-row">
        <input type="text" id="goal-name" placeholder="Название (например, Отпуск)" required>
        <input type="number" id="goal-target" placeholder="Сумма (₽)" min="1" step="100" required>
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
            <strong>${goal.name}</strong>
            <div class="goal-progress">
              ${(balance / 100).toLocaleString('ru-RU')} ₽ / ${(target / 100).toLocaleString('ru-RU')} ₽
              <span class="percent">${percent}%</span>
            </div>
            <div class="progress-bar"><div class="fill" style="width: ${percent}%"></div></div>
          </div>
          <form class="add-contrib-form" data-goal-id="${goal.id}">
            <input type="number" placeholder="Взнос (₽)" min="1" step="100" required class="contrib-amount">
            <button type="submit" class="btn btn-small">+</button>
          </form>
        </div>
      `;
    }
  }

  html += `</div></section>`;
  container.innerHTML = html;

  // 3. Обработчик создания цели
  document.getElementById('create-goal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('goal-name').value;
    const targetRub = parseFloat(document.getElementById('goal-target').value);
    
    if (!name || isNaN(targetRub) || targetRub <= 0) return;

    const cmd = {
      commandId: generateId(),
      commandType: 'goal.create',
      payload: {
        name,
        category: 'long',
        targetAmountMinor: Math.round(targetRub * 100),
        deadlineMonth: null
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

  // 4. Обработчик добавления взноса
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
}
