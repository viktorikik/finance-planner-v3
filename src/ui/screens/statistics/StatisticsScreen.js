/* ==========================================================================
   Экран «Статистика».
   Добавлены SVG-графики: Кольцевая диаграмма расходов и Столбчатая по месяцам.
   ========================================================================== */
import { getAllFromStore } from '../../../infrastructure/database/transaction.js';
import { calculateGoalBalance, calculateTotalAccumulated, calculatePoolBalance } from '../../../domain/statistics/balances.js';
import { calculateSavingsRate } from '../../../domain/statistics/savingsRate.js';

export async function renderStatisticsScreen(container, db) {
  const tx = db.transaction(['goals', 'moneyEntries', 'actualContributions', 'actualIncomes', 'actualTransactions', 'categories'], 'readonly');
  const goals = await getAllFromStore('goals', tx);
  const moneyEntries = await getAllFromStore('moneyEntries', tx);
  const actualContributions = await getAllFromStore('actualContributions', tx);
  const actualIncomes = await getAllFromStore('actualIncomes', tx);
  const actualTransactions = await getAllFromStore('actualTransactions', tx);
  const categories = await getAllFromStore('categories', tx);

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

  // === 1. Подготовка данных для Пончика (Расходы по категориям) ===
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const thisMonthExpenses = actualTransactions.filter(t => t.type === 'expense' && t.actualDate.startsWith(currentMonth));
  
  const expensesByCategory = {};
  thisMonthExpenses.forEach(t => {
    const catId = t.category || 'other';
    if (!expensesByCategory[catId]) expensesByCategory[catId] = 0;
    expensesByCategory[catId] += t.amountMinor;
  });

  const catData = Object.keys(expensesByCategory).map(catId => {
    const cat = categories.find(c => c.id === catId) || { name: 'Прочее', color: '#8b91a3' };
    return { name: cat.name, color: cat.color, amount: expensesByCategory[catId] };
  }).sort((a, b) => b.amount - a.amount);

  const totalExpenseThisMonth = catData.reduce((s, c) => s + c.amount, 0);

  let donutChartHtml = '<p class="muted">В этом месяце пока нет фактических расходов.</p>';
  if (totalExpenseThisMonth > 0) {
    const R = 60;
    const C = 2 * Math.PI * R;
    let offset = 0;
    
    const circles = catData.map(item => {
      const percent = item.amount / totalExpenseThisMonth;
      const dash = percent * C;
      const circle = `
        <circle r="${R}" cx="80" cy="80" fill="transparent" stroke="${item.color}" stroke-width="24" 
                stroke-dasharray="${dash} ${C}" stroke-dashoffset="${-offset}" 
                style="transition: stroke-dasharray 0.5s ease;" />
      `;
      offset += dash;
      return circle;
    }).join('');

    donutChartHtml = `
      <div style="display: flex; align-items: center; gap: 16px; justify-content: center; margin-top: 12px;">
        <svg width="160" height="160" viewBox="0 0 160 160" style="transform: rotate(-90deg);">
          ${circles}
          <circle r="48" cx="80" cy="80" fill="var(--card)" /> <!-- Вырезаем дырку -->
        </svg>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
          ${catData.slice(0, 4).map(item => `
            <div style="display:flex; justify-content:space-between; font-size:12px; align-items:center;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="width:8px; height:8px; border-radius:50%; background:${item.color}; display:inline-block;"></span>
                <span style="color:var(--text);">${item.name}</span>
              </div>
              <span style="color:var(--muted);">${Math.round((item.amount/totalExpenseThisMonth)*100)}%</span>
            </div>
          `).join('')}
          ${catData.length > 4 ? `<div style="font-size:11px; color:var(--muted); margin-top:4px;">+ еще ${catData.length - 4} кат.</div>` : ''}
        </div>
      </div>
    `;
  }

  // === 2. Подготовка данных для Столбцов (Доходы/Расходы за 6 месяцев) ===
  const last6Months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const ym = d.toISOString().slice(0, 7);
    const monthName = d.toLocaleDateString('ru-RU', { month: 'short' });
    
    const income = actualTransactions.filter(t => t.type === 'income' && t.actualDate.startsWith(ym)).reduce((s, t) => s + t.amountMinor, 0);
    const expense = actualTransactions.filter(t => t.type === 'expense' && t.actualDate.startsWith(ym)).reduce((s, t) => s + t.amountMinor, 0);
    
    last6Months.push({ monthName, income, expense });
  }

  const maxVal = Math.max(...last6Months.map(m => Math.max(m.income, m.expense)), 1);
  const chartHeight = 120;

  const barChartHtml = `
    <div style="display: flex; justify-content: space-between; align-items: flex-end; height: ${chartHeight + 30}px; margin-top: 16px; padding-bottom: 20px; position: relative; border-bottom: 1px solid var(--border);">
      ${last6Months.map(m => {
        const inH = (m.income / maxVal) * chartHeight;
        const exH = (m.expense / maxVal) * chartHeight;
        return `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; flex: 1; height: 100%; position: relative;">
            <div style="display: flex; gap: 4px; align-items: flex-end; height: 100%;">
              <div style="width: 12px; height: ${inH}px; background: var(--green); border-radius: 4px 4px 0 0; opacity: 0.9;"></div>
              <div style="width: 12px; height: ${exH}px; background: var(--red); border-radius: 4px 4px 0 0; opacity: 0.9;"></div>
            </div>
            <div style="position: absolute; bottom: -24px; font-size: 10px; color: var(--muted); text-transform: capitalize;">${m.monthName}</div>
          </div>
        `;
      }).join('')}
    </div>
    <div style="display: flex; gap: 16px; justify-content: center; margin-top: 12px; font-size: 12px;">
      <div style="display: flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; background: var(--green); border-radius: 50%;"></span> Доходы</div>
      <div style="display: flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; background: var(--red); border-radius: 50%;"></span> Расходы</div>
    </div>
  `;

  let html = `
    <section class="card" style="text-align: center; background: linear-gradient(180deg, var(--card) 0%, rgba(61, 220, 151, 0.05) 100%); margin-bottom: 16px;">
      <div style="font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">Всего накоплено</div>
      <div style="font-size: 40px; font-weight: 800; color: var(--green); line-height: 1.1;">${formatRub(totalAccumulated)} ₽</div>
    </section>

    <section class="card">
      <h2>Куда уходят деньги <span style="font-size:12px; color:var(--muted); font-weight:normal;">(в этом месяце)</span></h2>
      ${donutChartHtml}
    </section>

    <section class="card">
      <h2>Доходы и Расходы <span style="font-size:12px; color:var(--muted); font-weight:normal;">(за 6 месяцев)</span></h2>
      ${barChartHtml}
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
      <h2>Норма сбережений</h2>
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
      <h2>Прогресс целей</h2>
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
