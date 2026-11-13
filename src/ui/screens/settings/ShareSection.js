/* ==========================================================================
   ShareSection.js — блок «Совместный доступ» в настройках.
   Позволяет приглашать по email, видеть списки (кому дал / кто дал) и отзывать.
   ========================================================================== */
import { getSupabaseClient } from '../../../supabaseClient.js';

export async function renderShareSection(anchor) {
  if (!anchor) return;

  const supabase = getSupabaseClient();

  // Загружаем списки
  let myShares = [];
  let sharesWithMe = [];
  let loadError = null;
  try {
    const [resOut, resIn] = await Promise.all([
      supabase.rpc('get_my_shares'),
      supabase.rpc('get_shares_with_me')
    ]);

    if (resOut.error) {
      console.error('[ShareSection] get_my_shares error:', resOut.error);
      loadError = 'Не удалось загрузить «Вы поделились»: ' + resOut.error.message;
    } else if (resOut.data) {
      myShares = resOut.data;
    }

    if (resIn.error) {
      console.error('[ShareSection] get_shares_with_me error:', resIn.error);
      if (!loadError) {
        loadError = 'Не удалось загрузить «С вами поделились»: ' + resIn.error.message;
      }
    } else if (resIn.data) {
      sharesWithMe = resIn.data;
    }
  } catch (err) {
    console.error('[ShareSection] Ошибка загрузки списков:', err);
    loadError = err.message || 'Ошибка загрузки списков';
  }

  const renderList = (items, type) => {
    if (!items || items.length === 0) {
      return '<p class="muted" style="font-size:12px; margin: 8px 0;">Список пуст.</p>';
    }

    return items.map(item => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 0; border-bottom: 1px solid var(--border);">
        <span style="font-size:14px; color:var(--text);">${item.email || 'Без email'}</span>
        ${type === 'out' ? `
          <button class="btn btn-small btn-outline" data-action="revoke" data-id="${item.viewer_id}" style="color: var(--red); border-color: var(--red); padding: 4px 8px; font-size: 12px;">
            Отозвать
          </button>
        ` : ''}
      </div>
    `).join('');
  };

  anchor.innerHTML = `
    <section class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h2 style="margin:0;">Совместный доступ</h2>
        <button class="btn btn-small btn-outline" id="btn-share-refresh" style="padding:4px 10px; font-size:12px;">Обновить</button>
      </div>

      ${loadError ? `
        <div class="auth-error" style="display:block; margin-bottom:12px;">
          ${loadError}
        </div>
      ` : ''}

      <!-- Форма приглашения -->
      <div class="form-group" style="margin-bottom: 12px;">
        <input type="email" id="share-email-input" placeholder="Email пользователя" autocomplete="email">
      </div>
      <button class="btn" id="btn-share-submit" style="width: 100%; margin-bottom: 8px;">
        ✉️ Пригласить по Email
      </button>
      <div id="share-error" class="auth-error" style="display: none; margin-top: 8px;"></div>

      <div style="border-top: 1px solid var(--border); margin: 16px 0;"></div>

      <!-- Списки -->
      <details open style="margin-bottom: 12px;">
        <summary style="font-size:14px; font-weight:600; color:var(--muted); cursor:pointer; margin-bottom:8px;">Вы поделились с:</summary>
        <div style="padding-left: 4px;">
          ${renderList(myShares, 'out')}
        </div>
      </details>

      <details>
        <summary style="font-size:14px; font-weight:600; color:var(--muted); cursor:pointer; margin-bottom:8px;">С вами поделились:</summary>
        <div style="padding-left: 4px;">
          ${renderList(sharesWithMe, 'in')}
        </div>
      </details>
    </section>
  `;

  const input = anchor.querySelector('#share-email-input');
  const btn = anchor.querySelector('#btn-share-submit');
  const errorBox = anchor.querySelector('#share-error');
  const refreshBtn = anchor.querySelector('#btn-share-refresh');

  // Ручное обновление списков
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '...';
    await renderShareSection(anchor);
  });

  // Обработчик приглашения
  btn.addEventListener('click', async () => {
    const email = input.value.trim().toLowerCase();
    if (!email) return;

    btn.disabled = true;
    btn.textContent = 'Отправка...';
    errorBox.style.display = 'none';

    try {
      const { error } = await supabase.rpc('share_data_with_email', { p_viewer_email: email });
      if (error) throw error;

      alert(`Доступ успешно выдан для ${email}!`);
      await renderShareSection(anchor); // Перерисовываем, чтобы обновить список
    } catch (err) {
      console.error('[ShareSection] error:', err);
      let msg = err.message || 'Ошибка выдачи доступа';
      if (msg.includes('не найден')) msg = 'Пользователь с таким email не зарегистрирован.';
      if (msg.includes('самим собой')) msg = 'Нельзя выдать доступ самому себе.';
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
      btn.disabled = false;
      btn.textContent = '✉️ Пригласить по Email';
    }
  });

  // Обработчики отзыва
  anchor.querySelectorAll('[data-action="revoke"]').forEach(revBtn => {
    revBtn.addEventListener('click', async () => {
      if (!confirm('Вы уверены? Этот человек больше не будет видеть ваши данные.')) return;
      revBtn.disabled = true;
      revBtn.textContent = '...';
      try {
        const { error } = await supabase.rpc('revoke_share', { p_viewer_id: revBtn.dataset.id });
        if (error) throw error;
        await renderShareSection(anchor);
      } catch (err) {
        alert('Ошибка отзыва: ' + err.message);
        revBtn.disabled = false;
        revBtn.textContent = 'Отозвать';
      }
    });
  });
}
