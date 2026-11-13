/* ==========================================================================
   Экран «Календарь».
   Показывает плановые и фактические события.
   + Поддержка режима «Только чтение» (совместный доступ).
   ========================================================================== */
import { getAllFromStore } from '../../../infrastructure/database/transaction.js';
import { executeCommand } from '../../../application/commands/executeCommand.js';
import { calculateExecutionStatus } from '../../../domain/planning/executionStatus.js';
import { generateId } from '../../../domain/shared/ids.js';
import { getSupabaseClient } from '../../../supabaseClient.js';
import { getActiveViewOwnerId } from '../../state.js';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const ICON_TRASH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;

function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getCurrentMonthString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthTitle(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

function formatDateLong(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatRub(kopeks) {
  return (kopeks / 100).toLocaleString('ru-RU');
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getStatusLabel(status) {
  const map = {
    notDue: { text: 'Предстоит', color: 'var(--muted)' },
    unpaid: { text: 'Не внесён', color: 'var(--red)' },
    partial: { text: 'Частично', color: '#ffc857' },
    completed: { text: 'Выполнен', color: 'var(--green)' },
    overfulfilled: { text: 'Перевыполнен', color: '#3ddc97' }
  };
  return map[status] || { text: status, color: 'var(--text)' };
}

export async function renderCalendarScreen(container, db) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const myId = user?.id;

  const state = {
    currentMonth: getCurrentMonthString(),
    selectedDate: getTodayString(),
    goals: [],
    plannedOps: [],
    actualContribs: [],
    plannedTransactions: [],
    actualTransactions: [],
    actualIncomes: [],
    isReadOnly: false
  };

  let activeFormId = null;

  async function loadData() {
    const stores = ['goals', 'plannedOperations', 'actualContributions', 'plannedTransactions', 'actualTransactions', 'actualIncomes'];
    const tx = db.transaction(stores, 'readonly');
    
    const goalsRaw = await getAllFromStore('goals', tx);
    const plannedOpsRaw = await getAllFromStore('plannedOperations', tx);
    const actualContribsRaw = await getAllFromStore('actualContributions', tx);
    const plannedTxRaw = await getAllFromStore('plannedTransactions', tx);
    const actualTxRaw = await getAllFromStore('actualTransactions', tx);
    const actualIncomesRaw = await getAllFromStore('actualIncomes', tx);

    // === Определение контекста ===
    let targetOwnerId = getActiveViewOwnerId() || myId;
    state.isReadOnly = targetOwnerId !== myId;

    // === Фильтрация данных ===
    state.goals = goalsRaw.filter(g => (g._ownerId || myId) === targetOwnerId);
    state.plannedOps = plannedOpsRaw.filter(op => (op._ownerId || myId) === targetOwnerId);
    state.actualContribs = actualContribsRaw.filter(c => (c._ownerId || myId) === targetOwnerId);
    state.plannedTransactions = plannedTxRaw.filter(t => (t._ownerId || myId) === targetOwnerId);
    state.actualTransactions = actualTxRaw.filter(t => (t._ownerId || myId) === targetOwnerId);
    state.actualIncomes = actualIncomesRaw.filter(inc => (inc._ownerId || myId) === targetOwnerId);
  }

  function buildEventsMap() {
    const map = new Map();
    const ensure = (date) => {
      if (!map.has(date)) map.set(date, { planOps: [], factContribs: [], planIncomes: [], planExpenses: [], factIncomes: [], factExpenses: [] });
      return map.get(date);
    };

    for (const op of state.plannedOps) {
      if (op.state === 'cancelled') continue;
      const date = op.plannedDate || `${op.plannedMonth}-01`;
      if (date) ensure(date).planOps.push(op);
    }

    for (const c of state.actualContribs) {
      if (c.reversalStatus !== 'active') continue;
      if (c.actualDate) ensure(c.actualDate).factContribs.push(c);
    }

    const [year, month] = state.currentMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    for (const tx of state.plannedTransactions) {
      if (tx.isActive === false) continue;

      let dateStr = null;
      if (tx.frequency === 'one-time') {
        if (tx.date) dateStr = tx.date;
      } else if (tx.frequency === 'regular') {
        if (state.currentMonth >= tx.startMonth && (!tx.endMonth || state.currentMonth <= tx.endMonth)) {
          if (tx.dayOfMonth) {
            const day = Math.min(tx.dayOfMonth, daysInMonth);
            dateStr = `${state.currentMonth}-${String(day).padStart(2, '0')}`;
          }
        }
      }

      if (dateStr) {
        if (tx.type === 'income') ensure(dateStr).planIncomes.push(tx);
        else ensure(dateStr).planExpenses.push(tx);
      }
    }

    for (const tx of state.actualTransactions) {
      if (tx.actualDate) {
        if (tx.type === 'income') ensure(tx.actualDate).factIncomes.push(tx);
        else ensure(tx.actualDate).factExpenses.push(tx);
      }
    }

    for (const inc of state.actualIncomes) {
      if (inc.actualDate) ensure(inc.actualDate).factIncomes.push(inc);
    }

    return map;
  }

  function renderMonthGrid(eventsByDate) {
    const [year, month] = state.currentMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstWeekday = new Date(year, month - 1, 1).getDay() || 7;
    const leading = firstWeekday - 1;
    const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
    const today = getTodayString();

    let html = '<div class="calendar-weekdays">';
    for (const wd of WEEKDAY_LABELS) html += `<div class="calendar-weekday">${wd}</div>`;
    html += '</div><div class="calendar-grid">';

    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - leading + 1;

      if (dayNum < 1 || dayNum > daysInMonth) {
        html += '<div class="calendar-day other-month"></div>';
        continue;
      }

      const dateStr = `${state.currentMonth}-${String(dayNum).padStart(2, '0')}`;
      const ev = eventsByDate.get(dateStr);
      
      const hasPlan = ev && (ev.planOps.length > 0 || ev.planIncomes.length > 0 || ev.planExpenses.length > 0);
      const hasFact = ev && (ev.factContribs.length > 0 || ev.factIncomes.length > 0 || ev.factExpenses.length > 0);

      const cls = ['calendar-day'];
      if (dateStr === today) cls.push('today');
      if (dateStr === state.selectedDate) cls.push('selected');

      html += `<button type="button" class="${cls.join(' ')}" data-date="${dateStr}">`;
      html += `<span class="calendar-day-num">${dayNum}</span>`;
      
      if (hasPlan || hasFact) {
        html += '<div class="calendar-markers">';
        if (hasPlan) html += '<span class="marker marker-plan" title="План"></span>';
        if (hasFact) html += '<span class="marker marker-fact" title="Факт"></span>';
        html += '</div>';
      }
      html += '</button>';
    }

    html += '</div>';
    return html;
  }

  function renderDayDetails(eventsByDate) {
    if (!state.selectedDate) {
      return '<p class="muted">Выберите день в календаре.</p>';
    }

    const ev = eventsByDate.get(state.selectedDate);
    const goalsMap = new Map(state.goals.map(g => [g.id, g]));

    if (!ev || (!ev.planOps.length && !ev.factContribs.length && !ev.planIncomes.length && !ev.planExpenses.length && !ev.factIncomes.length && !ev.factExpenses.length)) {
      return `<p class="muted">${formatDateLong(state.selectedDate)}: событий нет.</p>`;
    }

    let html = `<h3 style="font-size: 15px; margin-bottom: 12px;">${formatDateLong(state.selectedDate)}</h3>`;

    if (ev.planOps.length || ev.planIncomes.length || ev.planExpenses.length) {
      html += '<div class="day-section-title">План</div>';
      
      for (const op of ev.planOps) {
        const goal = goalsMap.get(op.goalId);
        const { status, actualAmountMinor } = calculateExecutionStatus(op, state.actualContribs);
        const s = getStatusLabel(status);
        const isExpanded = activeFormId === op.id;

        html += `
          <div class="event-item event-plan">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div>
                <div class="event-title">Взнос: ${goal ? escapeHtml(goal.name) : 'Цель удалена'}</div>
                <div class="event-meta">План: ${formatRub(op.plannedAmountMinor)} ₽ · Факт: ${formatRub(actualAmountMinor)} ₽</div>
                <div style="font-size:12px; margin-top:4px; color:${s.color}; font-weight:600;">${s.text}</div>
              </div>
              ${!state.isReadOnly ? `
              <div style="display:flex; gap:8px; align-items:center;">
                <button class="btn btn-small btn-outline" data-action="register-fact" data-op-id="${op.id}">+ Факт</button>
                <button class="btn-icon delete" data-action="delete-plan" data-id="${op.id}" title="Удалить план">${ICON_TRASH}</button>
              </div>` : ''}
            </div>
            ${isExpanded && !state.isReadOnly ? renderInlineForm(op, status, goal) : ''}
          </div>
        `;
      }

      for (const inc of ev.planIncomes) {
        html += `
          <div class="event-item event-plan" style="border-left-color: var(--green);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div class="event-title" style="color: var(--green);">+ ${escapeHtml(inc.title)}</div>
                <div class="event-meta">План: ${formatRub(inc.amountMinor)} ₽ (Доход)</div>
              </div>
              ${!state.isReadOnly ? `<button class="btn-icon delete" data-action="delete-plan-tx" data-id="${inc.id}" title="Удалить план">${ICON_TRASH}</button>` : ''}
            </div>
          </div>
        `;
      }

      for (const exp of ev.planExpenses) {
        html += `
          <div class="event-item event-plan" style="border-left-color: var(--red);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div class="event-title" style="color: var(--red);">- ${escapeHtml(exp.title)}</div>
                <div class="event-meta">План: ${formatRub(exp.amountMinor)} ₽ (Расход)</div>
              </div>
              ${!state.isReadOnly ? `<button class="btn-icon delete" data-action="delete-plan-tx" data-id="${exp.id}" title="Удалить план">${ICON_TRASH}</button>` : ''}
            </div>
          </div>
        `;
      }
    }

    if (ev.factContribs.length || ev.factIncomes.length || ev.factExpenses.length) {
      html += '<div class="day-section-title" style="margin-top:16px;">Факт</div>';
      
      for (const c of ev.factContribs) {
        const goal = goalsMap.get(c.goalId);
        const typeLabel = c.type === 'planned' ? 'По плану' : c.type === 'early' ? 'Досрочно' : 'Дополнительный';
        html += `
          <div class="event-item event-fact">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div class="event-title">Взнос: ${goal ? escapeHtml(goal.name) : 'Цель удалена'}</div>
                <div class="event-meta">${formatRub(c.amountMinor)} ₽ · ${typeLabel}</div>
              </div>
              ${!state.isReadOnly ? `<button class="btn-icon delete" data-action="reverse-contrib" data-id="${c.id}" title="Отменить взнос">${ICON_TRASH}</button>` : ''}
            </div>
          </div>
        `;
      }

      for (const inc of ev.factIncomes) {
        html += `
          <div class="event-item event-fact" style="border-left-color: var(--green);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div class="event-title" style="color: var(--green);">+ ${escapeHtml(inc.title || 'Доход')}</div>
                <div class="event-meta">${formatRub(inc.amountMinor)} ₽ (Факт)</div>
              </div>
              ${!state.isReadOnly ? `<button class="btn-icon delete" data-action="delete-fact-tx" data-id="${inc.id}" data-type="income" title="Удалить факт">${ICON_TRASH}</button>` : ''}
            </div>
          </div>
        `;
      }

      for (const exp of ev.factExpenses) {
        html += `
          <div class="event-item event-fact" style="border-left-color: var(--red);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div class="event-title" style="color: var(--red);">- ${escapeHtml(exp.title || 'Расход')}</div>
                <div class="event-meta">${formatRub(exp.amountMinor)} ₽ (Факт)</div>
              </div>
              ${!state.isReadOnly ? `<button class="btn-icon delete" data-action="delete-fact-tx" data-id="${exp.id}" data-type="expense" title="Удалить факт">${ICON_TRASH}</button>` : ''}
            </div>
          </div>
        `;
      }
    }

    return html;
  }

  function renderInlineForm(op, status, goal) {
    if (!goal) return '<p class="muted" style="color:var(--red);">Нельзя внести факт: цель удалена.</p>';
    
    const { remainingMinor } = calculateExecutionStatus(op, state.actualContribs);
    const defaultAmount = remainingMinor > 0 ? remainingMinor / 100 : '';
    const today = getTodayString();

    return `
      <div class="inline-fact-form" style="margin-top:12px; padding-top:12px; border-top:1px solid var(--border);">
        <form id="fact-form-${op.id}">
          <div class="form-row" style="margin-bottom:8px;">
            <input type="number" class="fact-amount" placeholder="Сумма (₽)" value="${defaultAmount}" min="0.01" step="0.01" required>
            <input type="date" class="fact-date" value="${today}" required style="max-width:130px;">
          </div>
          <div style="display:flex; gap:8px;">
            <button type="submit" class="btn btn-small" style="flex:1;">Сохранить</button>
            <button type="button" class="btn btn-small btn-outline" data-action="cancel-fact" style="flex:1;">Отмена</button>
          </div>
        </form>
      </div>
    `;
  }

  function render() {
    const eventsByDate = buildEventsMap();

    container.innerHTML = `
      ${state.isReadOnly ? '<div style="background:var(--yellow); color:#000; padding:8px 12px; border-radius:8px; font-size:13px; margin-bottom:12px; font-weight:600; text-align:center;">🔒 Режим чтения</div>' : ''}
      <section class="card">
        <div class="calendar-nav">
          <button type="button" id="cal-prev">‹</button>
          <h2>${formatMonthTitle(state.currentMonth)}</h2>
          <button type="button" id="cal-next">›</button>
        </div>
        ${renderMonthGrid(eventsByDate)}
        <div class="day-details">
          ${renderDayDetails(eventsByDate)}
        </div>
      </section>
    `;

    container.querySelector('#cal-prev').addEventListener('click', () => {
      state.currentMonth = shiftMonth(state.currentMonth, -1);
      state.selectedDate = null;
      activeFormId = null;
      render();
    });

    container.querySelector('#cal-next').addEventListener('click', () => {
      state.currentMonth = shiftMonth(state.currentMonth, +1);
      state.selectedDate = null;
      activeFormId = null;
      render();
    });

    container.querySelectorAll('.calendar-day[data-date]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedDate = btn.dataset.date;
        activeFormId = null;
        render();
      });
    });

    if (!state.isReadOnly) {
      container.querySelectorAll('[data-action="register-fact"]').forEach(btn => {
        btn.addEventListener('click', () => {
          activeFormId = btn.dataset.opId;
          render();
          setTimeout(() => {
            const input = container.querySelector(`#fact-form-${activeFormId} .fact-amount`);
            if (input) input.focus();
          }, 50);
        });
      });

      container.querySelectorAll('[data-action="cancel-fact"]').forEach(btn => {
        btn.addEventListener('click', () => {
          activeFormId = null;
          render();
        });
      });

      container.querySelectorAll('[data-action="delete-plan"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Удалить этот плановый взнос? (Внесенные факты останутся)')) return;
          const id = btn.dataset.id;
          await executeCommand(db, { commandId: generateId(), commandType: 'plannedOperation.delete', payload: { operationId: id } });
          await loadData();
          render();
        });
      });

      container.querySelectorAll('[data-action="delete-plan-tx"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Удалить этот план? (Внесенные факты останутся)')) return;
          const id = btn.dataset.id;
          await executeCommand(db, { commandId: generateId(), commandType: 'plannedTransaction.delete', payload: { id } });
          await loadData();
          render();
        });
      });

      container.querySelectorAll('[data-action="delete-fact-tx"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Удалить эту запись? Бюджет и аналитика будут пересчитаны.')) return;
          const id = btn.dataset.id;
          await executeCommand(db, { commandId: generateId(), commandType: 'actualTransaction.delete', payload: { id } });
          await loadData();
          render();
        });
      });

      container.querySelectorAll('[data-action="reverse-contrib"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Отменить этот взнос? Деньги вернутся в свободные.')) return;
          alert('Функция отмены взносов в разработке. Пока удалите через экран Плана.');
        });
      });

      container.querySelectorAll('form[id^="fact-form-"]').forEach(form => {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const opId = form.id.replace('fact-form-', '');
          const op = state.plannedOps.find(o => o.id === opId);
          if (!op) return;

          const amountRub = parseFloat(form.querySelector('.fact-amount').value);
          const actualDate = form.querySelector('.fact-date').value;
          if (isNaN(amountRub) || amountRub <= 0 || !actualDate) return;

          const btn = form.querySelector('button[type="submit"]');
          btn.disabled = true; btn.textContent = '...';

          const type = actualDate < op.plannedDate ? 'early' : 'planned';

          const cmd = {
            commandId: generateId(),
            commandType: 'contribution.create',
            payload: {
              goalId: op.goalId,
              amountMinor: Math.round(amountRub * 100),
              actualDate,
              type,
              plannedOperationId: op.id
            },
            registeredAt: new Date().toISOString()
          };

          try {
            await executeCommand(db, cmd);
            activeFormId = null;
            await loadData();
            render();
          } catch (err) {
            alert('Ошибка: ' + err.message);
            btn.disabled = false; btn.textContent = 'Сохранить';
          }
        });
      });
    }
  }

  await loadData();
  render();
}
