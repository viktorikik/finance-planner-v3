/* ==========================================================================
   Регистрация Service Worker с автообновлением.
   ========================================================================== */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service Worker не поддерживается');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    console.log('[SW] Зарегистрирован:', registration.scope);

    // Проверяем обновления при каждом запуске
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      console.log('[SW] Найдено обновление, устанавливаем...');

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // Новый SW установлен, старый ещё работает. Перезагружаем страницу.
          console.log('[SW] Обновление готово, перезагружаем страницу...');
          window.location.reload();
        }
      });
    });

    // Если уже есть активный SW, но он обновился, пока страница была закрыта
    if (registration.waiting) {
      console.log('[SW] Ожидающий SW найден, перезагружаем...');
      window.location.reload();
    }
  } catch (err) {
    console.error('[SW] Ошибка регистрации:', err);
  }
}
