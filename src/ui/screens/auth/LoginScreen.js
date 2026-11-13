/* ==========================================================================
   Экран входа и регистрации (Polish v2).
   - Иконки в полях, показ/скрытие пароля.
   - Inline-валидация и красивые сообщения (error / success).
   - Спиннер на кнопке, плавное переключение режимов.
   ========================================================================== */
import { signInWithEmail, signUpWithEmail } from '../../../auth/authService.js';
import { navigate } from '../../../app/router.js';

const SVG_MAIL = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>`;
const SVG_LOCK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const SVG_EYE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const SVG_EYE_OFF = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
const SVG_ALERT = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
const SVG_CHECK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;
const SVG_SPINNER = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="auth-spinner" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

export async function renderLoginScreen(container) {
  let mode = 'signin'; // 'signin' | 'signup'
  let showPassword = false;

  function renderForm() {
    const isSignin = mode === 'signin';
    container.innerHTML = `
      <div class="auth-screen">
        <div class="auth-brand" aria-hidden="true">
          <span class="auth-brand-mark">💚</span>
        </div>
        <div class="auth-card">
          <h2>${isSignin ? 'С возвращением!' : 'Создайте аккаунт'}</h2>
          <p class="auth-subtitle">
            ${isSignin
              ? 'Войдите, чтобы синхронизировать данные между устройствами и открыть совместный доступ.'
              : 'Данные останутся локально и в облаке. Синхронизация и совместный доступ — сразу после регистрации.'}
          </p>

          <form id="auth-form" class="auth-form" novalidate>
            <label class="auth-field">
              <span>Email</span>
              <div class="auth-input-wrap">
                <span class="auth-input-icon">${SVG_MAIL}</span>
                <input
                  type="email"
                  name="email"
                  id="auth-email"
                  autocomplete="email"
                  inputmode="email"
                  autocapitalize="off"
                  spellcheck="false"
                  required
                  placeholder="you@example.com"
                >
              </div>
              <span class="auth-field-err" id="err-email" hidden></span>
            </label>

            <label class="auth-field">
              <span>Пароль</span>
              <div class="auth-input-wrap">
                <span class="auth-input-icon">${SVG_LOCK}</span>
                <input
                  type="password"
                  name="password"
                  id="auth-password"
                  autocomplete="${isSignin ? 'current-password' : 'new-password'}"
                  required
                  minlength="6"
                  placeholder="${isSignin ? 'Ваш пароль' : 'Минимум 6 символов'}"
                >
                <button type="button" class="auth-password-toggle" id="auth-toggle-pass" aria-label="Показать пароль" tabindex="-1">
                  ${SVG_EYE}
                </button>
              </div>
              <span class="auth-field-err" id="err-password" hidden></span>
            </label>

            <div id="auth-message" class="auth-msg" hidden></div>

            <button type="submit" class="auth-submit" id="auth-submit">
              ${isSignin ? 'Войти' : 'Зарегистрироваться'}
            </button>
          </form>

          <div class="auth-switch">
            ${isSignin
              ? 'Нет аккаунта? <button type="button" class="link-btn" id="auth-switch-btn">Зарегистрироваться</button>'
              : 'Уже есть аккаунт? <button type="button" class="link-btn" id="auth-switch-btn">Войти</button>'}
          </div>

          <p class="auth-note">
            Приложением можно пользоваться без входа — данные хранятся локально.
            Синхронизация и совместный доступ требуют аккаунта.
          </p>
        </div>
      </div>
    `;

    const form = container.querySelector('#auth-form');
    const emailInput = container.querySelector('#auth-email');
    const passwordInput = container.querySelector('#auth-password');
    const toggleBtn = container.querySelector('#auth-toggle-pass');
    const submitBtn = container.querySelector('#auth-submit');
    const messageBox = container.querySelector('#auth-message');
    const switchBtn = container.querySelector('#auth-switch-btn');
    const emailErr = container.querySelector('#err-email');
    const passwordErr = container.querySelector('#err-password');

    // Автофокус email только на десктопе (на мобиле не форсим клавиатуру)
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      setTimeout(() => emailInput.focus(), 50);
    }

    // Показ/скрытие пароля
    toggleBtn.addEventListener('click', () => {
      showPassword = !showPassword;
      passwordInput.type = showPassword ? 'text' : 'password';
      toggleBtn.innerHTML = showPassword ? SVG_EYE_OFF : SVG_EYE;
      toggleBtn.setAttribute('aria-label', showPassword ? 'Скрыть пароль' : 'Показать пароль');
    });

    // Переключение режима
    switchBtn.addEventListener('click', () => {
      mode = isSignin ? 'signup' : 'signin';
      showPassword = false;
      hideMessage();
      renderForm();
    });

    // Сброс ошибок при вводе
    emailInput.addEventListener('input', () => {
      emailErr.hidden = true;
      hideMessage();
    });
    passwordInput.addEventListener('input', () => {
      passwordErr.hidden = true;
      hideMessage();
    });

    function hideMessage() {
      messageBox.hidden = true;
      messageBox.textContent = '';
      messageBox.className = 'auth-msg';
      messageBox.innerHTML = '';
    }

    function showMessage(text, kind) {
      const icon = kind === 'success' ? SVG_CHECK : SVG_ALERT;
      messageBox.innerHTML = `<span class="auth-msg-icon">${icon}</span><span>${text}</span>`;
      messageBox.className = `auth-msg auth-msg-${kind}`;
      messageBox.hidden = false;
    }

    function setLoading(loading) {
      if (loading) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `${SVG_SPINNER}<span>Подождите…</span>`;
        submitBtn.classList.add('is-loading');
      } else {
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'signin' ? 'Войти' : 'Зарегистрироваться';
        submitBtn.classList.remove('is-loading');
      }
    }

    function validate() {
      let ok = true;
      const emailVal = emailInput.value.trim();
      const passVal = passwordInput.value;

      emailErr.hidden = true;
      passwordErr.hidden = true;

      if (!emailVal) {
        emailErr.textContent = 'Введите email.';
        emailErr.hidden = false;
        ok = false;
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
        emailErr.textContent = 'Похоже, это не email.';
        emailErr.hidden = false;
        ok = false;
      }

      if (!passVal) {
        passwordErr.textContent = 'Введите пароль.';
        passwordErr.hidden = false;
        ok = false;
      } else if (mode === 'signup' && passVal.length < 6) {
        passwordErr.textContent = 'Минимум 6 символов.';
        passwordErr.hidden = false;
        ok = false;
      }

      return ok;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideMessage();

      if (!validate()) return;

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      setLoading(true);

      try {
        const result = mode === 'signin'
          ? await signInWithEmail(email, password)
          : await signUpWithEmail(email, password);

        if (result.session) {
          navigate('plan');
          return;
        }

        // Регистрация: требуется подтверждение email
        showMessage('Регистрация успешна! Проверьте почту и подтвердите email, затем войдите.', 'success');
        setLoading(false);
      } catch (err) {
        console.error('[LoginScreen] auth error:', err);
        showMessage(translateAuthError(err), 'error');
        setLoading(false);
      }
    });
  }

  renderForm();
}

function translateAuthError(err) {
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Неверный email или пароль.';
  if (msg.includes('user already registered')) return 'Пользователь с таким email уже зарегистрирован.';
  if (msg.includes('email not confirmed')) return 'Email не подтверждён. Проверьте почту и подтвердите адрес.';
  if (msg.includes('password should be at least')) return 'Пароль слишком короткий (минимум 6 символов).';
  if (msg.includes('unable to validate email')) return 'Некорректный email.';
  if (msg.includes('rate limit')) return 'Слишком много попыток. Подождите немного и попробуйте снова.';
  return err?.message || 'Не удалось выполнить действие. Попробуйте ещё раз.';
}
