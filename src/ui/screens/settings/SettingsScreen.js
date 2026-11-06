/* ==========================================================================
   Экран «Настройки».
   Экспорт и импорт базы данных (бэкап).
   ========================================================================== */
import { generateBackup, restoreBackup } from '../../../infrastructure/backup/exportBackup.js';

export async function renderSettingsScreen(container, db) {
  let html = `
    <section class="card">
      <h2>Резервное копирование</h2>
      <p class="muted" style="text-align: left; padding: 0; margin-bottom: 16px;">
        Сохраните копию ваших данных, чтобы не потерять их при смене телефона или очистке браузера.
      </p>
      
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <button id="btn-export" class="btn" style="background: var(--green); color: #000;">
          📥 Скачать файл бэкапа
        </button>
        
        <div style="border-top: 1px solid var(--border); margin: 8px 0;"></div>
        
        <p class="muted" style="text-align: left; padding: 0; font-size: 13px;">
          <strong>Внимание!</strong> Восстановление из файла полностью удалит все текущие данные и заменит их теми, что в файле.
        </p>
        
        <label for="file-import" class="btn btn-outline" style="text-align: center; cursor: pointer; display: block;">
          📤 Восстановить из файла
        </label>
        <input type="file" id="file-import" accept=".json" style="display: none;">
      </div>
    </section>
    
    <section class="card" style="opacity: 0.6; text-align: center; font-size: 12px; padding: 16px;">
      <div>Планировщик финансов v3.0</div>
      <div>Schema v8.2</div>
    </section>
  `;

  container.innerHTML = html;

  // Экспорт
  const btnExport = container.querySelector('#btn-export');
  btnExport.addEventListener('click', async () => {
    try {
      btnExport.disabled = true;
      btnExport.textContent = 'Сбор данных...';
      
      const backup = await generateBackup(db);
      const jsonString = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Создаем ссылку для скачивания
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `finance-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      
      // Очистка
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      btnExport.textContent = '✅ Файл сохранен!';
      setTimeout(() => { btnExport.textContent = '📥 Скачать файл бэкапа'; btnExport.disabled = false; }, 2000);
    } catch (err) {
      alert('Ошибка при создании бэкапа: ' + err.message);
      btnExport.textContent = '📥 Скачать файл бэкапа';
      btnExport.disabled = false;
    }
  });

  // Импорт
  const fileInput = container.querySelector('#file-import');
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm('Вы уверены? Все текущие данные будут УДАЛЕНЫ и заменены данными из файла.')) {
      fileInput.value = '';
      return;
    }

    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      
      const label = container.querySelector('label[for="file-import"]');
      label.textContent = 'Восстановление...';
      label.style.pointerEvents = 'none';

      await restoreBackup(db, backup);
      
      alert('Данные успешно восстановлены! Приложение будет перезагружено.');
      window.location.reload(); // Перезагружаем, чтобы UI подтянул новые данные
    } catch (err) {
      alert('Ошибка восстановления: ' + err.message);
      fileInput.value = '';
      const label = container.querySelector('label[for="file-import"]');
      label.textContent = '📤 Восстановить из файла';
      label.style.pointerEvents = 'auto';
    }
  });
}
