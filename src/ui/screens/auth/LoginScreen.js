/* ==========================================================================
   Экран входа и регистрации.
   Переключение между режимами, показ ошибок, состояние загрузки.
   ========================================================================== */
import { signInWithEmail, signUpWithEmail } from '../../../auth/authService.js';
import { navigate } from '../../../app/router.js';

export async function renderLoginScreen(container) {
  let mode = 'signin'; // 'signin' | 'signup'

  function renderForm() {
    container.innerHTML = `
      <div class="auth-screen">
        <div class="auth-card">
          <h2>${mode === 'signin' ? 'Вход в аккаунт' : 'Регистрация'}</h2>
          <p class="auth-subtitle">
            ${mode === 'signin'
              ? 'Войдите, чтобы синхронизировать данные между устройствами'
              : 'Создайте аккаунт — данные останутся локально и в облаке'}
          </p>

          <form id="auth-form" class="auth-form" novalidate>
            <label class="auth-field">
              <span>Email</span>
              <input type="email" name="email" autocomplete="email" required placeholder="you@example.com">
            </label>

            <label class="auth-field">
              <span>Пароль</span>
              <input type="password" name="password" autocomplete="${mode === 'signin' ? 'current-password' : 'new-password'}" required minlength="6" placeholder="Минимум 6 символов">
            </label>

            <div id="auth-error" class="auth-error" hidden></div>

            <button type="submit" class="btn-primary auth-submit">
              ${mode === 'signin' ? 'Войти' : 'Зарегистрироваться'}
            </button>
          </form>

          <div class="auth-switch">
            ${mode === 'signin'
              ? 'Нет аккаунта? <button type="button" class="link-btn" id="auth-switch-btn">Зарегистрироваться</button>'
              : 'Уже есть аккаунт? <button type="button" class="link-btn" id="auth-switch-btn">Войти</button>'}
          </div>

          <p class="auth-note">
            Приложением можно пользоваться без входа, но синхронизация
            между устройствами и совместный доступ требуют аккаунта.
          </p>
        </div>
      </div>
    `;

    const form = container.querySelector('#auth-form');
    const errorBox = container.querySelector('#auth-error');
    const submitBtn = container.querySelector('.auth-submit');
    const switchBtn = container.querySelector('#auth-switch-btn');

    switchBtn.addEventListener('click', () => {
      mode = mode === 'signin' ? 'signup' : 'signin';
      renderForm();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.hidden = true;
      errorBox.style.color = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Подождите...';

      const formData = new FormData(form);
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '');

      try {
        const result = mode === 'signin'
          ? await signInWithEmail(email, password)
          : await signUpWithEmail(email, password);

        if (result.session) {
          // Успешный вход. bootstrap через onAuthStateChange переключит экран.
          navigate('plan');
        } else {
          // Регистрация требует подтверждения email
          errorBox.textContent = 'Регистрация успешна! Проверьте почту и подтвердите email.';
          errorBox.style.color = 'var(--green)';
          errorBox.hidden = false;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Зарегистрироваться';
        }
      } catch (err) {
        console.error('[LoginScreen] auth error:', err);
        errorBox.textContent = translateAuthError(err);
        errorBox.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'signin' ? 'Войти' : 'Зарегистрироваться';
      }
    });
  }

  renderForm();
}

function translateAuthError(err) {
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Неверный email или пароль.';
  if (msg.includes('user already registered')) return 'Пользователь с таким email уже зарегистрирован.';
  if (msg.includes('email not confirmed')) return 'Email не подтверждён. Проверьте почту.';
  if (msg.includes('password should be at least')) return 'Пароль слишком короткий (минимум 6 символов).';
  if (msg.includes('unable to validate email')) return 'Некорректный email.';
  if (msg.includes('rate limit')) return 'Слишком много попыток. Подождите немного.';
  return err?.message || 'Не удалось выполнить действие.';
}
