/* ==========================================================================
   Экран «Календарь».
   Показывает плановые и фактические события.
   Позволяет регистрировать фактические взносы по плановым операциям.
   ========================================================================== */
import { getAllFromStore } from '../../../infrastructure/database/transaction.js';
import { executeCommand } from '../../../application/commands/executeCommand.js';
import { calculateExecutionStatus } from '../../../domain/planning/executionStatus.js';
import { generateId } from '../../../domain/shared/ids.js';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/* ---------- Утилиты дат ---------- */
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
  return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  });
}

function formatDateLong(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* ---------- Статусы ---------- */
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

/* ---------- Главный вход ---------- */
export async function renderCalendarScreen(container, db) {
  const state = {
    currentMonth: getCurrentMonthString(),
    selectedDate: getTodayString(),
    goals: [],
    plannedOps: [],
    actualContribs: [],
    // Будущие таблицы (пока пустые)
    plannedIncomes: [],
    plannedExpenses: [],
    actualIncomes: []
  };

  let activeFormId = null; // ID плановой операции, для которой открыта форма факта

  async function loadData() {
    // Пытаемся загрузить всё, что есть
    const stores = ['goals', 'plannedOperations', 'actualContributions'];
    
    // Динамически проверяем наличие таблиц бюджета (чтобы не упасть, если их нет в транзакции)
    try {
      const checkTx = db.transaction(['plannedIncomeItems'], 'readonly');
      stores.push('plannedIncomeItems');
    } catch(e) {}
    try {
      const checkTx = db.transaction(['plannedExpenseItems'], 'readonly');
      stores.push('plannedExpenseItems');
    } catch(e) {}
    try {
      const checkTx = db.transaction(['actualIncomes'], 'readonly');
      stores.push('actualIncomes');
    } catch(e) {}

    const tx = db.transaction(stores, 'readonly');
    
    state.goals = await getAllFromStore('goals', tx);
    state.plannedOps = await getAllFromStore('plannedOperations', tx);
    state.actualContribs = await getAllFromStore('actualContributions', tx);
    
    if (stores.includes('plannedIncomeItems')) state.plannedIncomes = await getAllFromStore('plannedIncomeItems', tx);
    if (stores.includes('plannedExpenseItems')) state.plannedExpenses = await getAllFromStore('plannedExpenseItems', tx);
    if (stores.includes('actualIncomes')) state.actualIncomes = await getAllFromStore('actualIncomes', tx);
  }

  function buildEventsMap() {
    const map = new Map();
    const ensure = (date) => {
      if (!map.has(date)) map.set(date, { planOps: [], factContribs: [], planIncomes: [], planExpenses: [], factIncomes: [] });
      return map.get(date);
    };

    // План: Взносы
    for (const op of state.plannedOps) {
      if (op.state === 'cancelled') continue;
      const date = op.plannedDate || `${op.plannedMonth}-01`;
      if (date) ensure(date).planOps.push(op);
    }

    // Факт: Взносы
    for (const c of state.actualContribs) {
      if (c.reversalStatus !== 'active') continue;
      if (c.actualDate) ensure(c.actualDate).factContribs.push(c);
    }

    // План: Доходы/Расходы (если есть дата)
    for (const inc of state.plannedIncomes) {
      if (inc.isActive !== false && inc.plannedDate) ensure(inc.plannedDate).planIncomes.push(inc);
    }
    for (const exp of state.plannedExpenses) {
      if (exp.isActive !== false && exp.plannedDate) ensure(exp.plannedDate).planExpenses.push(exp);
    }

    // Факт: Доходы
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
    html += '</div>';

    html += '<div class="calendar-grid">';

    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - leading + 1;

      if (dayNum < 1 || dayNum > daysInMonth) {
        html += '<div class="calendar-day other-month"></div>';
        continue;
      }

      const dateStr = `${state.currentMonth}-${String(dayNum).padStart(2, '0')}`;
      const ev = eventsByDate.get(dateStr);
      
      const hasPlan = ev && (ev.planOps.length > 0 || ev.planIncomes.length > 0 || ev.planExpenses.length > 0);
      const hasFact = ev && (ev.factContribs.length > 0 || ev.factIncomes.length > 0);

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

    if (!ev || (!ev.planOps.length && !ev.factContribs.length && !ev.planIncomes.length && !ev.planExpenses.length && !ev.factIncomes.length)) {
      return `<p class="muted">${formatDateLong(state.selectedDate)}: событий нет.</p>`;
    }

    let html = `<h3 style="font-size: 15px; margin-bottom: 12px;">${formatDateLong(state.selectedDate)}</h3>`;

    /* --- БЛОК ПЛАНА --- */
    if (ev.planOps.length || ev.planIncomes.length || ev.planExpenses.length) {
      html += '<div class="day-section-title">План</div>';
      
      // Плановые взносы
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
              <button class="btn btn-small btn-outline" data-action="register-fact" data-op-id="${op.id}">+ Факт</button>
            </div>
            ${isExpanded ? renderInlineForm(op, status, goal) : ''}
          </div>
        `;
      }

      // Плановые доходы/расходы (только просмотр, т.к. нет логики фактов)
      for (const inc of ev.planIncomes) {
        html += `<div class="event-item event-plan"><div class="event-title">Доход (План)</div><div class="event-meta">${formatRub(inc.plannedAmountMinor || inc.amountMinor)} ₽</div></div>`;
      }
      for (const exp of ev.planExpenses) {
        html += `<div class="event-item event-plan"><div class="event-title">Расход (План)</div><div class="event-meta">${formatRub(exp.plannedAmountMinor || exp.amountMinor)} ₽</div></div>`;
      }
    }

    /* --- БЛОК ФАКТА --- */
    if (ev.factContribs.length || ev.factIncomes.length) {
      html += '<div class="day-section-title" style="margin-top:16px;">Факт</div>';
      
      // Фактические взносы
      for (const c of ev.factContribs) {
        const goal = goalsMap.get(c.goalId);
        const typeLabel = c.type === 'planned' ? 'По плану' : c.type === 'early' ? 'Досрочно' : 'Дополнительный';
        html += `
          <div class="event-item event-fact">
            <div class="event-title">Взнос: ${goal ? escapeHtml(goal.name) : 'Цель удалена'}</div>
            <div class="event-meta">${formatRub(c.amountMinor)} ₽ · ${typeLabel}</div>
          </div>
        `;
      }

      // Фактические доходы
      for (const inc of ev.factIncomes) {
        html += `<div class="event-item event-fact"><div class="event-title">Доход</div><div class="event-meta">${formatRub(inc.amountMinor)} ₽</div></div>`;
      }
    }

    return html;
  }

  function renderInlineForm(op, status, goal) {
    if (!goal) return '<p class="muted" style="color:var(--red);">Нельзя внести факт: цель удалена.</p>';
    
    const { remainingMinor } = calculateExecutionStatus(op, state.actualContribs);
    const defaultAmount = remainingMinor > 0 ? remainingMinor / 100 : '';
    
    // Определяем тип: если сегодня < plannedDate, то 'early', иначе 'planned'
    const today = getTodayString();
    const type = today < op.plannedDate ? 'early' : 'planned';

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

    // Обработчики навигации
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

    // Обработчик выбора дня
    container.querySelectorAll('.calendar-day[data-date]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedDate = btn.dataset.date;
        activeFormId = null;
        render();
      });
    });

    // Кнопка "Добавить факт"
    container.querySelectorAll('[data-action="register-fact"]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeFormId = btn.dataset.opId;
        render();
        // Автофокус на поле ввода
        setTimeout(() => {
          const input = container.querySelector(`#fact-form-${activeFormId} .fact-amount`);
          if (input) input.focus();
        }, 50);
      });
    });

    // Кнопка "Отмена" в форме
    container.querySelectorAll('[data-action="cancel-fact"]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeFormId = null;
        render();
      });
    });

    // Отправка формы факта
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

        // Определяем тип (досрочный или плановый)
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
          activeFormId = null; // Закрываем форму
          await loadData();    // Обновляем данные
          render();            // Перерисовываем
        } catch (err) {
          alert('Ошибка: ' + err.message);
          btn.disabled = false; btn.textContent = 'Сохранить';
        }
      });
    });
  }

  await loadData();
  render();
}
