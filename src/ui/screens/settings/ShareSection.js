/* ==========================================================================
   ShareSection.js — блок «Совместный доступ» в настройках.
   Позволяет пригласить пользователя по email (даёт доступ на чтение).
   ========================================================================== */
import { getSupabaseClient } from '../../../supabaseClient.js';

export async function renderShareSection(anchor) {
  if (!anchor) return;

  anchor.innerHTML = `
    <section class="card">
      <h2>Совместный доступ</h2>
      <p class="muted" style="text-align: left; padding: 0; margin-bottom: 16px;">
        Пригласите человека, чтобы он мог <b>видеть</b> ваши цели и бюджет на своём устройстве. Редактировать он ничего не сможет.
      </p>

      <div class="form-group">
        <input type="email" id="share-email-input" placeholder="Email пользователя" autocomplete="email">
      </div>
      <button class="btn" id="btn-share-submit" style="width: 100%; margin-top: 8px;">
        ✉️ Пригласить по Email
      </button>
      
      <div id="share-error" class="auth-error" style="display: none; margin-top: 12px;"></div>
    </section>
  `;

  const input = anchor.querySelector('#share-email-input');
  const btn = anchor.querySelector('#btn-share-submit');
  const errorBox = anchor.querySelector('#share-error');

  btn.addEventListener('click', async () => {
    const email = input.value.trim();
    if (!email) return;

    btn.disabled = true;
    btn.textContent = 'Отправка...';
    errorBox.style.display = 'none';

    try {
      const supabase = getSupabaseClient();
      // Вызываем функцию, которую мы создали в SQL
      const { error } = await supabase.rpc('share_data_with_email', { p_viewer_email: email });
      
      if (error) throw error;

      alert(`Доступ успешно выдан для ${email}!\n\nКогда он(а) войдёт в приложение под этим email и нажмёт «Синхронизировать», ваши данные появятся на его устройстве.`);
      input.value = '';
    } catch (err) {
      console.error('[ShareSection] error:', err);
      let msg = err.message || 'Ошибка выдачи доступа';
      if (msg.includes('не найден')) msg = 'Пользователь с таким email не зарегистрирован в приложении.';
      if (msg.includes('самим собой')) msg = 'Нельзя выдать доступ самому себе.';
      
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = '✉️ Пригласить по Email';
    }
  });
}
