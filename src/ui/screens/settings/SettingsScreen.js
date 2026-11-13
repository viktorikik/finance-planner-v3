/* ==========================================================================
   Экран «Настройки».
   - Современный дизайн (аккордеоны, минимум эмодзи, чистые формы).
   - Добавлен экспорт в CSV, HTML и PDF (через Print).
   ========================================================================== */
import { generateBackup, restoreBackup } from '../../../infrastructure/backup/exportBackup.js';
import { executeCommand } from '../../../application/commands/executeCommand.js';
import { getAllFromStore } from '../../../infrastructure/database/transaction.js';
import { generateId } from '../../../domain/shared/ids.js';
import { renderSyncSection } from './SyncSection.js';
import { renderShareSection } from './ShareSection.js';

const ICON_ARCHIVE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg>`;
const ICON_RESTORE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/><path d="M12 16v-4m-2 2l2-2 2 2"/></svg>`;
const ICON_DELETE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;

export async function renderSettingsScreen(container, db) {
  async function render() {
    container.innerHTML = '<div class="loading">Загрузка настроек...</div>';

    let categories = [], settings = [], goals = [], plannedTransactions = [], actualTransactions = [];
    try {
      const tx = db.transaction(['categories', 'settings', 'goals', 'plannedTransactions', 'actualTransactions'], 'readonly');
      categories = await getAllFromStore('categories', tx);
      settings = await getAllFromStore('settings', tx);
      goals = await getAllFromStore('goals', tx);
      plannedTransactions = await getAllFromStore('plannedTransactions', tx);
      actualTransactions = await getAllFromStore('actualTransactions', tx);
    } catch (err) {
      console.warn('[Settings] Ошибка загрузки:', err);
    }

    const inflationSetting = settings.find(s => s.id === 'generalInflationRate');
    const inflationValue = inflationSetting ? inflationSetting.value : 5;

    const expenseCats = categories.filter(c => c.type === 'expense').sort((a, b) => a.sortOrder - b.sortOrder);
    const incomeCats = categories.filter(c => c.type === 'income').sort((a, b) => a.sortOrder - b.sortOrder);

    const html = `
      <!-- ОБЩИЕ НАСТРОЙКИ -->
      <details class="settings-accordion">
        <summary>Общие настройки</summary>
        <div class="accordion-content">
          <div class="form-group">
            <label>Общая инфляция (%, в год)</label>
            <p style="font-size:12px; color:var(--muted); margin-bottom:12px;">Используется для расчета долгосрочных целей.</p>
            <input type="number" id="inflation-input" value="${inflationValue}" min="0" max="100" step="0.1">
          </div>
          <button class="btn" id="btn-save-inflation" style="width: 100%;">Сохранить инфляцию</button>
        </div>
      </details>

      <!-- КАТЕГОРИИ -->
      <details class="settings-accordion">
        <summary>Категории</summary>
        <div class="accordion-content">
          <p style="font-size:13px; color:var(--muted); margin-bottom:16px;">
            Системные категории можно архивировать, но не удалять.
          </p>

          <div class="category-group">
            <div class="category-group-title">Расходы</div>
            ${renderCategoryList(expenseCats)}
            <button class="btn btn-outline btn-small" style="width: 100%; margin-top: 8px;" data-action="create-cat" data-type="expense">+ Добавить расход</button>
          </div>

          <div class="category-group">
            <div class="category-group-title">Доходы</div>
            ${renderCategoryList(incomeCats)}
            <button class="btn btn-outline btn-small" style="width: 100%; margin-top: 8px;" data-action="create-cat" data-type="income">+ Добавить доход</button>
          </div>
        </div>
      </details>

      <!-- РЕЗЕРВНОЕ КОПИРОВАНИЕ И ЭКСПОРТ -->
      <details class="settings-accordion">
        <summary>Данные и Экспорт</summary>
        <div class="accordion-content">
          <p style="font-size:13px; color:var(--muted); margin-bottom:16px;">
            Сохраните копию данных или выгрузите красивый отчет.
          </p>

          <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
            <button id="btn-export-html" class="btn" style="background: var(--accent); color: #fff;">
              📄 Красивый отчет (HTML)
            </button>
            <div style="display: flex; gap: 8px;">
              <button id="btn-export-pdf" class="btn btn-outline" style="flex: 1;">
                📑 Сохранить в PDF
              </button>
              <button id="btn-export-csv" class="btn btn-outline" style="flex: 1;">
                📊 Таблица (CSV)
              </button>
            </div>
          </div>

          <div style="border-top: 1px solid var(--border); margin: 16px 0;"></div>

          <div style="display: flex; flex-direction: column; gap: 12px;">
            <button id="btn-export" class="btn" style="background: var(--green); color: #000;">
              Скачать файл бэкапа (JSON)
            </button>

            <p style="font-size: 12px; color: var(--muted); margin-top: 8px;">
              <strong>Внимание!</strong> Восстановление удалит все текущие данные и заменит их из файла.
            </p>

            <label for="file-import" class="btn btn-outline" style="text-align: center; cursor: pointer; display: block;">
              Восстановить из файла
            </label>
            <input type="file" id="file-import" accept=".json" style="display: none;">
          </div>
        </div>
      </details>

      <!-- СИНХРОНИЗАЦИЯ -->
      <div id="sync-section-anchor" style="margin-bottom: 16px;"></div>

      <!-- СОВМЕСТНЫЙ ДОСТУП -->
      <div id="share-section-anchor" style="margin-bottom: 16px;"></div>

      <!-- ОПАСНАЯ ЗОНА -->
      <details class="settings-accordion danger-zone-accordion">
        <summary style="color: var(--red);">Опасная зона</summary>
        <div class="accordion-content">
          <p style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">Действия ниже необратимы.</p>

          <button class="btn-danger" id="btn-clear-financials">Очистить финансовые данные</button>
          <p style="font-size: 11px; margin-top: 4px; margin-bottom: 16px; color: var(--muted);">
            Удалит все цели, транзакции и историю денег. Настройки и категории сохранятся.
          </p>

          <button class="btn-danger-solid" id="btn-factory-reset">Полный сброс к заводским</button>
          <p style="font-size: 11px; margin-top: 4px; margin-bottom: 0; color: var(--muted);">
            Удалит ВСЁ, включая пользовательские категории. Вернёт дефолтные.
          </p>
        </div>
      </details>

      <!-- ПОДВАЛ -->
      <section class="card" style="opacity: 0.6; text-align: center; font-size: 12px; padding: 16px; border: none;">
        <div>Планировщик финансов v4.0</div>
        <div>Schema v14 · Sync v1</div>
      </section>

      <!-- МОДАЛКА -->
      <div class="modal-overlay" id="danger-modal">
        <div class="modal-content" id="danger-modal-content"></div>
      </div>
    `;

    container.innerHTML = html;

    const syncAnchor = container.querySelector('#sync-section-anchor');
    if (syncAnchor) {
      try { await renderSyncSection(syncAnchor, db); }
      catch (err) { syncAnchor.innerHTML = `<section class="card"><p class="muted">Ошибка синхронизации: ${err.message}</p></section>`; }
    }

    const shareAnchor = container.querySelector('#share-section-anchor');
    if (shareAnchor) {
      try { await renderShareSection(shareAnchor); }
      catch (err) { shareAnchor.innerHTML = `<section class="card"><p class="muted">Ошибка совместного доступа: ${err.message}</p></section>`; }
    }

    // --- ЛОГИКА ЭКСПОРТА ---
    
    const formatRub = (minor) => (minor / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 });

    // 1. Экспорт в CSV
    document.getElementById('btn-export-csv').addEventListener('click', () => {
      let csv = 'Дата;Тип;Название;Категория;Сумма (руб)\n';
      actualTransactions.sort((a,b) => new Date(b.actualDate) - new Date(a.actualDate)).forEach(t => {
        const catName = categories.find(c => c.id === t.category)?.name || 'Без категории';
        const typeRu = t.type === 'income' ? 'Доход' : 'Расход';
        csv += `${new Date(t.actualDate).toLocaleDateString('ru-RU')};${typeRu};${t.title.replace(/;/g, ' ')};${catName};${(t.amountMinor/100).toFixed(2).replace('.', ',')}\n`;
      });
      
      const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' }); // BOM для Excel
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // 2. Генерация HTML отчета
    const generateReportHTML = () => {
      const totalIncomes = actualTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amountMinor, 0);
      const totalExpenses = actualTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amountMinor, 0);
      const activeGoals = goals.filter(g => g.status === 'active');
      
      return `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
          <meta charset="UTF-8">
          <title>Финансовый отчет</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #fff; color: #333; line-height: 1.5; padding: 40px; max-width: 800px; margin: 0 auto; }
            h1 { color: #111; border-bottom: 2px solid #7c5cff; padding-bottom: 10px; }
            h2 { color: #444; margin-top: 30px; }
            .summary { display: flex; gap: 20px; margin-bottom: 30px; }
            .box { flex: 1; background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; }
            .box h3 { margin: 0 0 10px 0; font-size: 14px; color: #666; text-transform: uppercase; }
            .box .val { font-size: 24px; font-weight: bold; }
            .income .val { color: #2e7d32; }
            .expense .val { color: #c62828; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background: #f9f9f9; font-weight: bold; }
            .goal-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
            @media print {
              body { padding: 0; }
              .box { border: 1px solid #ddd; }
            }
          </style>
        </head>
        <body>
          <h1>Финансовый отчет семьи</h1>
          <p style="color: #666;">Дата формирования: ${new Date().toLocaleDateString('ru-RU')}</p>
          
          <h2>Общая картина</h2>
          <div class="summary">
            <div class="box income">
              <h3>Всего доходов (факт)</h3>
              <div class="val">${formatRub(totalIncomes)} ₽</div>
            </div>
            <div class="box expense">
              <h3>Всего расходов (факт)</h3>
              <div class="val">${formatRub(totalExpenses)} ₽</div>
            </div>
            <div class="box">
              <h3>Остаток</h3>
              <div class="val" style="color: ${totalIncomes - totalExpenses >= 0 ? '#2e7d32' : '#c62828'}">
                ${formatRub(totalIncomes - totalExpenses)} ₽
              </div>
            </div>
          </div>

          <h2>Прогресс целей</h2>
          ${activeGoals.length === 0 ? '<p>Нет активных целей.</p>' : ''}
          ${activeGoals.map(g => {
             const percent = g.targetAmountMinor > 0 ? Math.min(100, (g.currentAmountMinor / g.targetAmountMinor) * 100) : 0;
             return `
              <div class="goal-row">
                <span><b>${g.name}</b></span>
                <span>${formatRub(g.currentAmountMinor)} / ${formatRub(g.targetAmountMinor)} ₽ (${percent.toFixed(1)}%)</span>
              </div>
             `;
          }).join('')}

          <h2>Последние 50 операций (Факт)</h2>
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тип</th>
                <th>Название</th>
                <th style="text-align: right;">Сумма</th>
              </tr>
            </thead>
            <tbody>
              ${actualTransactions.sort((a,b) => new Date(b.actualDate) - new Date(a.actualDate)).slice(0, 50).map(t => `
                <tr>
                  <td>${new Date(t.actualDate).toLocaleDateString('ru-RU')}</td>
                  <td style="color: ${t.type === 'income' ? '#2e7d32' : '#c62828'}">${t.type === 'income' ? 'Доход' : 'Расход'}</td>
                  <td>${t.title}</td>
                  <td style="text-align: right; font-weight: bold; color: ${t.type === 'income' ? '#2e7d32' : '#c62828'}">
                    ${t.type === 'income' ? '+' : '-'}${formatRub(t.amountMinor)} ₽
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
        </html>
      `;
    };

    // 3. Скачивание HTML
    document.getElementById('btn-export-html').addEventListener('click', () => {
      const htmlContent = generateReportHTML();
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${new Date().toISOString().slice(0, 10)}.html`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // 4. Печать в PDF (через iframe, чтобы не открывать новые вкладки, которые блокирует Safari)
    document.getElementById('btn-export-pdf').addEventListener('click', () => {
      const htmlContent = generateReportHTML();
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(htmlContent);
      doc.close();

      // Ждем загрузки стилей и вызываем печать
      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 2000);
      }, 500);
    });

    // --- СТАРЫЕ ОБРАБОТЧИКИ ---
    document.getElementById('btn-save-inflation').addEventListener('click', async (e) => {
      const input = document.getElementById('inflation-input');
      const btn = e.target;
      try {
        btn.disabled = true;
        btn.textContent = 'Сохранение...';
        await executeCommand(db, { commandId: generateId(), commandType: 'settings.update', payload: { id: 'generalInflationRate', value: Number(input.value) } });
        btn.textContent = 'Сохранено';
        setTimeout(() => { btn.textContent = 'Сохранить инфляцию'; btn.disabled = false; }, 1500);
      } catch (err) { alert('Ошибка: ' + err.message); btn.textContent = 'Сохранить инфляцию'; btn.disabled = false; }
    });

    container.querySelectorAll('[data-action="toggle-archive"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await executeCommand(db, { commandId: generateId(), commandType: 'category.update', payload: { id: btn.dataset.id, isArchived: btn.dataset.archived !== 'true' } });
          render();
        } catch (err) { alert('Ошибка: ' + err.message); }
      });
    });

    container.querySelectorAll('[data-action="delete-cat"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Удалить эту категорию?')) return;
        try { await executeCommand(db, { commandId: generateId(), commandType: 'category.delete', payload: { id: btn.dataset.id } }); render(); }
        catch (err) { alert('Ошибка: ' + err.message); }
      });
    });

    container.querySelectorAll('[data-action="create-cat"]').forEach(btn => {
      btn.addEventListener('click', () => openCategoryModal(null, btn.dataset.type));
    });

    const btnExport = document.getElementById('btn-export');
    btnExport.addEventListener('click', async () => {
      try {
        btnExport.disabled = true;
        btnExport.textContent = 'Сбор данных...';
        const backup = await generateBackup(db);
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `finance-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        btnExport.textContent = 'Файл сохранён';
        setTimeout(() => { btnExport.textContent = 'Скачать файл бэкапа'; btnExport.disabled = false; }, 2000);
      } catch (err) { alert('Ошибка: ' + err.message); btnExport.textContent = 'Скачать файл бэкапа'; btnExport.disabled = false; }
    });

    const fileInput = document.getElementById('file-import');
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm('Все текущие данные будут УДАЛЕНЫ. Продолжить?')) { fileInput.value = ''; return; }
      try {
        const text = await file.text();
        const backup = JSON.parse(text);
        const label = container.querySelector('label[for="file-import"]');
        label.textContent = 'Восстановление...'; label.style.pointerEvents = 'none';
        await restoreBackup(db, backup);
        alert('Данные восстановлены! Перезагрузка...');
        window.location.reload();
      } catch (err) {
        alert('Ошибка: ' + err.message); fileInput.value = '';
        const label = container.querySelector('label[for="file-import"]');
        label.textContent = 'Восстановить из файла'; label.style.pointerEvents = 'auto';
      }
    });

    document.getElementById('btn-clear-financials').addEventListener('click', () => {
      openDangerModal('clear', { goalsCount: goals.length, plannedCount: plannedTransactions.length, actualCount: actualTransactions.length });
    });

    document.getElementById('btn-factory-reset').addEventListener('click', () => {
      openDangerModal('reset', { goalsCount: goals.length, plannedCount: plannedTransactions.length, actualCount: actualTransactions.length, catsCount: categories.filter(c => !c.isSystem).length });
    });
  }

  function renderCategoryList(cats) {
    if (!cats.length) return '<p class="muted" style="padding: 8px 0;">Нет категорий</p>';
    return cats.map(cat => `
      <div class="category-item ${cat.isArchived ? 'archived' : ''}">
        <div class="category-dot" style="background: ${cat.color}"></div>
        <span class="category-emoji">${cat.emoji || '📦'}</span>
        <span class="category-name">${cat.name}${cat.isSystem ? ' 🔒' : ''}</span>
        <div class="category-actions">
          <button data-action="toggle-archive" data-id="${cat.id}" data-archived="${cat.isArchived}" title="${cat.isArchived ? 'Восстановить' : 'Архивировать'}" style="display: flex; align-items: center; justify-content: center;">
            ${cat.isArchived ? ICON_RESTORE : ICON_ARCHIVE}
          </button>
          ${!cat.isSystem ? `<button data-action="delete-cat" data-id="${cat.id}" title="Удалить" style="display: flex; align-items: center; justify-content: center;">${ICON_DELETE}</button>` : ''}
        </div>
      </div>
    `).join('');
  }

  function openCategoryModal(existing, type) {
    const modal = document.getElementById('danger-modal');
    const content = document.getElementById('danger-modal-content');
    content.innerHTML = `
      <h3>${existing ? 'Редактировать' : 'Новая'} категория</h3>
      <div class="modal-input"><label>Название</label><input type="text" id="cat-name" value="${existing ? existing.name : ''}" placeholder="Например: Подписки" maxlength="30"></div>
      <div class="modal-input"><label>Иконка</label><input type="text" id="cat-emoji" value="${existing ? (existing.emoji || '📦') : '📦'}" maxlength="4" style="font-size: 24px; text-align: center;"></div>
      <div class="modal-input"><label>Цвет</label><input type="color" id="cat-color" value="${existing ? existing.color : '#8b91a3'}" style="height: 48px; padding: 4px;"></div>
      <div class="modal-actions">
        <button class="btn btn-outline" id="btn-cat-cancel">Отмена</button>
        <button class="btn" id="btn-cat-save">Сохранить</button>
      </div>
    `;
    modal.classList.add('active');
    document.getElementById('btn-cat-cancel').addEventListener('click', () => modal.classList.remove('active'));
    document.getElementById('btn-cat-save').addEventListener('click', async () => {
      const name = document.getElementById('cat-name').value.trim();
      const emoji = document.getElementById('cat-emoji').value.trim() || '📦';
      const color = document.getElementById('cat-color').value;
      if (!name) { alert('Введите название'); return; }
      try {
        await executeCommand(db, { commandId: generateId(), commandType: 'category.create', payload: { name, emoji, color, type } });
        modal.classList.remove('active'); render();
      } catch (err) { alert('Ошибка: ' + err.message); }
    });
  }

  function openDangerModal(mode, counts) {
    const modal = document.getElementById('danger-modal');
    const content = document.getElementById('danger-modal-content');
    const isReset = mode === 'reset';
    const word = isReset ? 'СБРОС' : 'УДАЛИТЬ';
    const title = isReset ? 'Полный сброс' : 'Очистка данных';
    const btnLabel = isReset ? 'Сбросить всё' : 'Удалить навсегда';

    content.innerHTML = `
      <h3 style="color:var(--red);">${title}</h3>
      <p>Это действие <b>необратимо</b>. Будут удалены:</p>
      <div class="counts-list" style="background:rgba(255,92,124,0.1);">
        <div><span>Целей</span><b>${counts.goalsCount}</b></div>
        <div><span>Плановых транзакций</span><b>${counts.plannedCount}</b></div>
        <div><span>Фактических транзакций</span><b>${counts.actualCount}</b></div>
        ${isReset ? `<div><span>Категорий</span><b>${counts.catsCount}</b></div>` : ''}
      </div>
      <label class="checkbox-row"><input type="checkbox" id="danger-confirm-check"><span>Я понимаю, что действие необратимо</span></label>
      <div class="modal-input"><label>Введите <b style="color: var(--red);">${word}</b> для подтверждения:</label><input type="text" id="danger-confirm-text" placeholder="${word}" autocomplete="off"></div>
      <div class="modal-actions">
        <button class="btn btn-outline" id="btn-danger-cancel">Отмена</button>
        <button class="btn-danger-solid" id="btn-danger-confirm" disabled>${btnLabel}</button>
      </div>
    `;
    modal.classList.add('active');

    const check = document.getElementById('danger-confirm-check');
    const textInput = document.getElementById('danger-confirm-text');
    const confirmBtn = document.getElementById('btn-danger-confirm');

    function updateBtn() {
      const ok = check.checked && textInput.value.trim().toUpperCase() === word;
      confirmBtn.disabled = !ok;
      textInput.classList.toggle('valid', textInput.value.trim().toUpperCase() === word);
    }
    check.addEventListener('change', updateBtn);
    textInput.addEventListener('input', updateBtn);
    document.getElementById('btn-danger-cancel').addEventListener('click', () => modal.classList.remove('active'));

    confirmBtn.addEventListener('click', async () => {
      if (!confirm(`Выполнить "${title}"? Это последний шанс отменить.`)) return;
      try {
        confirmBtn.disabled = true; confirmBtn.textContent = 'Выполняется...';
        await executeCommand(db, { commandId: generateId(), commandType: isReset ? 'data.factoryReset' : 'data.clearFinancials', payload: {} });
        modal.classList.remove('active');
        alert(isReset ? 'Данные сброшены.' : 'Данные очищены.');
        window.location.reload();
      } catch (err) {
        alert('Ошибка: ' + err.message); confirmBtn.disabled = false; confirmBtn.textContent = btnLabel;
      }
    });
  }

  await render();
}
