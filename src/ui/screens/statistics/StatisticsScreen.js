/* ==========================================================================
   Экран «Статистика».
   - Donut с центральной суммой, Bar Chart с сеткой.
   - Empty States для пустых графиков.
   - v4.4.5: фильтрация по activeViewOwnerId + имя друга в баннере read-only.
   ========================================================================== */
import { getAllFromStore } from '../../../infrastructure/database/transaction.js';
import { calculateGoalBalance, calculateTotalAccumulated, calculatePoolBalance } from '../../../domain/statistics/balances.js';
import { calculateSavingsRate } from '../../../domain/statistics/savingsRate.js';
import { getSupabaseClient } from '../../../supabaseClient.js';
import { getActiveViewOwnerId, setActiveViewOwnerId } from '../../state.js';
import { resolveOwnerNames } from '../../utils/ownerNames.js';

const CATEGORY_COLORS = ['#D5E84A', '#789879', '#D4776D', '#D8A65A', '#8b91a3', '#A58BD4', '#6DB4D4'];

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export async function renderStatisticsScreen(container, db) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const myId = user?.id;

  const tx = db.transaction(
    ['goals', 'moneyEntries', 'actualContributions', 'actualIncomes', 'actualTransactions', 'categories'],
    'readonly'
  );
  const allGoalsRaw = await getAllFromStore('goals', tx);
  const allMoneyEntriesRaw = await getAllFromStore('moneyEntries', tx);
  const allActualContributionsRaw = await getAllFromStore('actualContributions', tx);
  const allActualIncomesRaw = await getAllFromStore('actualIncomes', tx);
  const allActualTransactionsRaw = await getAllFromStore('actualTransactions', tx);
  const allCategoriesRaw = await getAllFromStore('categories', tx);

  // === Определяем, чьи данные показываем ===
  const ownerIdSet = new Set();
  const collect = (arr) => arr.forEach(x => { if (x._ownerId) ownerIdSet.add(x._ownerId); });
  collect(allGoalsRaw);
  collect(allMoneyEntriesRaw);
  collect(allActualTransactionsRaw);
  collect(allActualIncomesRaw);
  collect(allActualContributionsRaw);

  let targetOwnerId = getActiveViewOwnerId();
  if (!targetOwnerId || (targetOwnerId !== myId && !ownerIdSet.has(targetOwnerId))) {
    targetOwnerId = myId;
    setActiveViewOwnerId(null);
  }
  const isReadOnly = targetOwnerId !== myId;

  let friendName = null;
  if (isReadOnly) {
    const names = await resolveOwnerNames(supabase, [targetOwnerId]);
    friendName = names[targetOwnerId] || null;
  }

  const goals = allGoalsRaw.filter(g => (g._ownerId || myId) === targetOwnerId);
  const moneyEntries = allMoneyEntriesRaw.filter(e => (e._ownerId || myId) === targetOwnerId);
  const actualContributions = allActualContributionsRaw.filter(c => (c._ownerId || myId) === targetOwnerId);
  const actualIncomes = allActualIncomesRaw.filter(i => (i._ownerId || myId) === targetOwnerId);
  const actualTransactions = allActualTransactionsRaw.filter(t => (t._ownerId || myId) === targetOwnerId);
  const categories = allCategoriesRaw.filter(c => (c._ownerId || myId) === targetOwnerId);

  const activeGoals = goals.filter(g => g.status === 'active');
  const totalAccumulated = calculateTotalAccumulated(moneyEntries);
  const poolBalance = calculatePoolBalance(moneyEntries);
  const totalInGoals = totalAccumulated - poolBalance;

  const savingsRate = calculateSavingsRate(actualIncomes, actualContributions);

  const formatRub = (kopeks) => (kopeks / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 });

  const totalIncomesRub = actualIncomes.reduce((s, i) => s + i.amountMinor, 0);
  const totalContribsRub = actualContributions
    .filter(c => c.reversalStatus === 'active' && c.type !== 'initial')
    .reduce((s, c) => s + c.amountMinor, 0);

  let savingsHint = '';
  if (savingsRate > 100) {
    savingsHint = '<div style="font-size: 12px; color: var(--muted); margin-top: 8px; line-height: 1.4;">Вы откладываете больше, чем заработали в этом месяце. Возможно, вы используете накопления из прошлого.</div>';
  }

  // === 1. Пончик (Расходы по категориям) ===
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMonthExpenses = actualTransactions.filter(
    t => t.type === 'expense' && t.actualDate.startsWith(currentMonth)
  );

  const expensesByCategory = {};
  thisMonthExpenses.forEach(t => {
    const catId = t.category || 'other';
    if (!expensesByCategory[catId]) expensesByCategory[catId] = 0;
    expensesByCategory[catId] += t.amountMinor;
  });

  let colorIndex = 0;
  const catData = Object.keys(expensesByCategory).map(catId => {
    const cat = categories.find(c => c.id === catId);
    const fallbackColor = CATEGORY_COLORS[colorIndex++ % CATEGORY_COLORS.length];
    return {
      name: cat ? cat.name : 'Прочее',
      color: cat?.color || fallbackColor,
      amount: expensesByCategory[catId]
    };
  }).sort((a, b) => b.amount - a.amount);

  const totalExpenseThisMonth = catData.reduce((s, c) => s + c.amount, 0);

  let donutChartHtml = '';
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
        <div style="position: relative; width: 160px; height: 160px; flex-shrink: 0;">
          <svg width="160" height="160" viewBox="0 0 160 160" style="transform: rotate(-90deg); position: absolute; inset: 0;">
            ${circles}
            <circle r="48" cx="80" cy="80" fill="var(--card)" />
          </svg>
          <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
            <span style="font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Расходы</span>
            <span style="font-size: 16px; font-weight: 800; color: var(--text);">${formatRub(totalExpenseThisMonth)} ₽</span>
          </div>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
          ${catData.slice(0, 4).map(item => `
            <div style="display:flex; justify-content:space-between; font-size:12px; align-items:center;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="width:8px; height:8px; border-radius:50%; background:${item.color}; display:inline-block; flex-shrink: 0;"></span>
                <span style="color:var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px;">${item.name}</span>
              </div>
              <span style="color:var(--muted); font-weight: 600;">${Math.round((item.amount/totalExpenseThisMonth)*100)}%</span>
            </div>
          `).join('')}
          ${catData.length > 4 ? `<div style="font-size:11px; color:var(--muted); margin-top:4px; font-weight: 600;">+ еще ${catData.length - 4} кат.</div>` : ''}
        </div>
      </div>
    `;
  } else {
    donutChartHtml = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 160px; margin-top: 12px; color: var(--muted);">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 12px; opacity: 0.4;">
          <circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>
        </svg>
        <span style="font-size: 13px; font-weight: 500;">Пока нет расходов в этом месяце</span>
      </div>
    `;
  }

  // === 2. Столбцы (Доходы/Расходы за 6 месяцев) ===
  const last6Months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthName = d.toLocaleDateString('ru-RU', { month: 'short' });

    const income = actualTransactions.filter(t => t.type === 'income' && t.actualDate.startsWith(ym)).reduce((s, t) => s + t.amountMinor, 0);
    const expense = actualTransactions.filter(t => t.type === 'expense' && t.actualDate.startsWith(ym)).reduce((s, t) => s + t.amountMinor, 0);

    last6Months.push({ monthName, income, expense });
  }

  const maxRealVal = Math.max(...last6Months.map(m => Math.max(m.income, m.expense)), 0);
  const maxVal = maxRealVal > 0 ? Math.ceil(maxRealVal / 100000) * 100000 : 100000;
  const chartHeight = 120;
  const hasBarData = maxRealVal > 0;

  const barChartHtml = hasBarData ? `
    <div style="position: relative; margin-top: 32px; padding-bottom: 24px;">
      <div style="position: absolute; top: -20px; left: 0; font-size: 11px; color: var(--muted); font-weight: 600;">
        ${formatRub(maxVal)} ₽
      </div>
      <div style="position: absolute; inset: 0; bottom: 24px; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none;">
        ${[0, 1, 2, 3].map(() => `<div style="border-bottom: 1px dashed var(--border); width: 100%;"></div>`).join('')}
        <div style="border-bottom: 1px solid var(--border); width: 100%;"></div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: flex-end; height: ${chartHeight}px; position: relative; z-index: 1;">
        ${last6Months.map(m => {
          const inH = (m.income / maxVal) * chartHeight;
          const exH = (m.expense / maxVal) * chartHeight;
          return `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; flex: 1; height: 100%; position: relative;">
              <div style="display: flex; gap: 4px; align-items: flex-end; height: 100%;">
                <div style="width: 14px; height: ${Math.max(2, inH)}px; background: var(--green); border-radius: 4px 4px 0 0; position: relative;" title="Доход: ${formatRub(m.income)} ₽">
                  ${inH > 20 ? `<div style="position: absolute; top: -16px; left: 50%; transform: translateX(-50%); font-size: 9px; color: var(--green); font-weight: 700;">${formatRub(m.income)}</div>` : ''}
                </div>
                <div style="width: 14px; height: ${Math.max(2, exH)}px; background: var(--red); border-radius: 4px 4px 0 0; position: relative;" title="Расход: ${formatRub(m.expense)} ₽">
                  ${exH > 20 ? `<div style="position: absolute; top: -16px; left: 50%; transform: translateX(-50%); font-size: 9px; color: var(--red); font-weight: 700;">${formatRub(m.expense)}</div>` : ''}
                </div>
              </div>
              <div style="position: absolute; bottom: -20px; font-size: 11px; color: var(--muted); text-transform: capitalize; font-weight: 600;">${m.monthName}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    <div style="display: flex; gap: 16px; justify-content: center; margin-top: 8px; font-size: 12px; font-weight: 600;">
      <div style="display: flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; background: var(--green); border-radius: 50%;"></span> Доходы</div>
      <div style="display: flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; background: var(--red); border-radius: 50%;"></span> Расходы</div>
    </div>
  ` : `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 160px; color: var(--muted);">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 12px; opacity: 0.4;">
        <path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>
      </svg>
      <span style="font-size: 13px; font-weight: 500;">Нет данных о доходах и расходах</span>
    </div>
  `;

  // === Баннер «Только чтение» для чужих данных (с именем друга) ===
  let readOnlyBannerHtml = '';
  if (isReadOnly) {
    const readOnlyText = friendName
      ? `Вы смотрите статистику друга: ${escapeHtml(friendName)}. Только чтение.`
      : 'Вы смотрите статистику друга. Только чтение.';
    readOnlyBannerHtml = `
      <section class="card" style="margin-bottom: 16px; padding: 12px 14px; border-color: var(--yellow); background: rgba(216,166,90,0.08);">
        <div style="display: flex; align-items: center; gap: 10px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          <div style="font-size: 13px; font-weight: 600; color: var(--yellow); line-height: 1.4;">
            ${readOnlyText}
          </div>
        </div>
      </section>
    `;
  }

  let html = `
    ${readOnlyBannerHtml}

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
        <div style="background: rgba(120, 152, 121, 0.08); padding: 16px; border-radius: var(--radius-md); text-align: center; border: 1px solid rgba(120, 152, 121, 0.2);">
          <div style="font-size: 24px; margin-bottom: 4px;">🎯</div>
          <div style="font-size: 12px; color: var(--muted); margin-bottom: 4px; font-weight: 600;">В целях</div>
          <div style="font-size: 20px; font-weight: 800; color: var(--text);">${formatRub(totalInGoals)} ₽</div>
        </div>
        <div style="background: rgba(213, 232, 74, 0.08); padding: 16px; border-radius: var(--radius-md); text-align: center; border: 1px solid rgba(213, 232, 74, 0.3);">
          <div style="font-size: 24px; margin-bottom: 4px;">💰</div>
          <div style="font-size: 12px; color: var(--muted); margin-bottom: 4px; font-weight: 600;">Свободные</div>
          <div style="font-size: 20px; font-weight: 800; color: var(--text);">${formatRub(poolBalance)} ₽</div>
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
