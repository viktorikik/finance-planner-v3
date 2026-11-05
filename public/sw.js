/* ==========================================================================
   Service Worker для планировщика финансов v3.
   Стратегия Этапа 1: cache-first с фоновым обновлением для статики.

   ОГРАНИЧЕНИЕ: hashed-ассеты Vite (app.abc123.js, style.abc123.css) заранее
   не известны, поэтому кэшируются динамически при первом запросе.
   Shell-файлы кэшируются при установке SW.

   ВАЖНО: при каждом релизе менять CACHE_VERSION.
   ========================================================================== */

const CACHE_VERSION = 'finance-planner-v3-cache-v1';

/* Shell — файлы, которые нужны для запуска приложения офлайн.
   Все пути относительно scope (self.registration.scope). */
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
];

/* --- УСТАНОВКА ---
   Открываем кэш, кладём shell, активируемся сразу (skipWaiting).
   skipWaiting безопасен, пока финансовая схема данных не внедрена.
   С Этапа 2 (IndexedDB) политику обновления SW будем менять (см. архитектуру §11). */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

/* --- АКТИВАЦИЯ ---
   Удаляем устаревшие кэши (все, кроме текущей версии), захватываем контроль. */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/* --- FETCH ---
   Только GET, только same-origin.
   cache-first: если есть в кэше — отдаём сразу, параллельно обновляем из сети.
   Если нет — идём в сеть, кэшируем успешный ответ. */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(cached => {
      const networkPromise = fetch(req)
        .then(response => {
          // Кэшируем только успешные same-origin ответы
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => cached); // сеть упала — отдаём кэш (если был)

      // Если кэш есть — отдаём его сразу (быстрый старт), фон обновит
      return cached || networkPromise;
    })
  );
});
