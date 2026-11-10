// Service Worker для PWA «Синапс»
// Кэширует локальную оболочку приложения, модули, иконки и встроенный KaTeX (без внешних CDN, работает без VPN)

// Версию кэша меняем при каждом обновлении приложения, иначе cache-first отдаст старую сборку
const CACHE_NAME = 'synapse-pwa-v4';

// Локальные файлы оболочки и модули
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/app.js',
  '/avatar.js',
  '/animations.js',
  '/voice.js',
  '/ai.js',
  '/search.js',
  '/sound-direction.js',
  '/physics.js',
  '/history-images.js'
];

// При установке кэшируем ресурсы по отдельности
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(
        CORE_ASSETS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'no-cache' });
            if (response && response.ok) {
              await cache.put(url, response);
            }
          } catch {
            // Игнорируем недоступные при установке пути
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

// Очищаем устаревшие версии кэша при активации
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// Перехват сетевых запросов
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Запросы к ИИ-бэкенду — строго network-only
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/functions/')) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            JSON.stringify({
              error: 'offline',
              message: 'Нет интернета, но Синапс покажет темы из кэша'
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json; charset=utf-8' }
            }
          )
      )
    );
    return;
  }

  // Живой поиск по РУВИКИ, Википедии и Wikimedia — напрямую из сети
  if (
    url.hostname.includes('wikimedia.org') ||
    url.hostname.includes('wikipedia.org') ||
    url.hostname.includes('ruwiki.ru')
  ) {
    event.respondWith(fetch(request));
    return;
  }

  // Стратегия cache-first для локальной статики
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }

      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok && url.origin === self.location.origin) {
          cache.put(request, networkResponse.clone()).catch(() => {});
        }
        return networkResponse;
      } catch {
        if (request.mode === 'navigate') {
          const fallback = await cache.match('/index.html');
          if (fallback) return fallback;
        }
        return new Response('Офлайн-режим: ресурс не найден в кэше', {
          status: 504,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })()
  );
});
