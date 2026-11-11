/* ==========================================================================
   Экран «Статистика».
   Добавлено пояснение для нормы сбережений > 100%.
   ========================================================================== */
import { getAllFromStore } from '../../../infrastructure/database/transaction.js';
import { calculateGoalBalance, calculateTotalAccumulated, calculatePoolBalance } from '../../../domain/statistics/balances.js';
import { calculateSavingsRate } from '../../../domain/statistics/savingsRate.js';

export async function renderStatisticsScreen(container, db) {
  const tx = db.transaction(['goals', 'moneyEntries', 'actualContributions', 'actualIncomes'], 'readonly');
  const goals = await getAllFromStore('goals', tx);
  const moneyEntries = await getAllFromStore('moneyEntries', tx);
  const actualContributions = await getAllFromStore('actualContributions', tx);
  const actualIncomes = await getAllFromStore('actualIncomes', tx);

  const activeGoals = goals.filter(g => g.status === 'active');
  const totalAccumulated = calculateTotalAccumulated(moneyEntries);
  const poolBalance = calculatePoolBalance(moneyEntries);
  const totalInGoals = totalAccumulated - poolBalance;
  
  const savingsRate = calculateSavingsRate(actualIncomes, actualContributions);

  const formatRub = (kopeks) => (kopeks / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 });
  
  const totalIncomesRub = actualIncomes.reduce((s, i) => s + i.amountMinor, 0);
  const totalContribsRub = actualContributions.filter(c => c.reversalStatus === 'active' && c.type !== 'initial').reduce((s, c) => s + c.amountMinor, 0);

  let savingsHint = '';
  if (savingsRate > 100) {
    savingsHint = '<div style="font-size: 12px; color: var(--muted); margin-top: 8px; line-height: 1.4;">Вы откладываете больше, чем заработали в этом месяце. Возможно, вы используете накопления из прошлого.</div>';
  }

  let html = `
    <section class="card" style="text-align: center; background: linear-gradient(180deg, var(--card) 0%, rgba(61, 220, 151, 0.05) 100%);">
      <div style="font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">Всего накоплено</div>
      <div style="font-size: 40px; font-weight: 800; color: var(--green); line-height: 1.1;">${formatRub(totalAccumulated)} ₽</div>
    </section>

    <section class="card">
      <h2>Где лежат деньги</h2>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div style="background: var(--card-2); padding: 16px; border-radius: 12px; text-align: center;">
          <div style="font-size: 12px; color: var(--muted); margin-bottom: 4px;">В целях</div>
          <div style="font-size: 20px; font-weight: 700;">${formatRub(totalInGoals)} ₽</div>
        </div>
        <div style="background: var(--card-2); padding: 16px; border-radius: 12px; text-align: center; border: 1px solid var(--border);">
          <div style="font-size: 12px; color: var(--muted); margin-bottom: 4px;">Свободные</div>
          <div style="font-size: 20px; font-weight: 700; color: var(--accent);">${formatRub(poolBalance)} ₽</div>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Сколько вы откладываете</h2>
      ${savingsRate !== null ? `
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-size: 32px; font-weight: 800; color: var(--accent);">${savingsRate.toFixed(1)}%</div>
            <div style="font-size: 13px; color: var(--muted);">от всех ваших доходов</div>
          </div>
          <div style="text-align: right; font-size: 13px; color: var(--muted);">
            Доходы: ${formatRub(totalIncomesRub)} ₽<br>
            Взносы: ${formatRub(totalContribsRub)} ₽
          </div>
        </div>
        <div class="progress-bar" style="margin-top: 16px; height: 8px;">
          <div class="fill" style="width: ${Math.min(100, savingsRate)}%; background: var(--accent);"></div>
        </div>
        <p style="font-size: 14px; margin-top: 16px; line-height: 1.5; color: var(--text);">
           Это значит, что из каждых заработанных <b>1000 ₽</b> вы оставляете на цели <b>${(savingsRate * 10).toFixed(0)} ₽</b>.
        </p>
        ${savingsHint}
      ` : `
        <p class="muted" style="text-align: left; padding: 0;">Пока нет данных о фактических доходах. Как только вы начнете вносить доходы, мы посчитаем, какой процент от них вы откладываете.</p>
      `}
    </section>

    <section class="card">
      <h2>Цели</h2>
      ${activeGoals.length === 0 ? '<p class="muted">Нет активных целей.</p>' : ''}
      <div style="display: flex; flex-direction: column; gap: 16px;">
        ${activeGoals.map(goal => {
          const balance = calculateGoalBalance(goal.id, moneyEntries);
          const percent = goal.targetAmountMinor > 0 ? Math.min(100, (balance / goal.targetAmountMinor) * 100) : 0;
          
          return `
            <div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 14px;">
                <span style="font-weight: 600;">${goal.name}</span>
                <span style="color: var(--muted);">${percent.toFixed(1)}%</span>
              </div>
              <div class="progress-bar" style="height: 8px;">
                <div class="fill" style="width: ${percent}%; background: ${percent >= 100 ? 'var(--green)' : 'var(--accent)'};"></div>
              </div>
              <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 12px; color: var(--muted);">
                <span>${formatRub(balance)} ₽</span>
                <span>из ${formatRub(goal.targetAmountMinor)} ₽</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;

  container.innerHTML = html;
}
