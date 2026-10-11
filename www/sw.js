/**
 * Offline Service Worker - 100% Yerel Önbellekleme
 * Uçak modunda ve internetsiz ortamda eksiksiz çalışır.
 */

const CACHE_NAME = 'sesli-notlar-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/nlp/normalizer.js',
  './js/nlp/tokenizer.js',
  './js/nlp/parser.js',
  './js/nlp/nlpEngine.js',
  './js/storage/db.js',
  './js/audio/voicePlugin.js',
  './js/notifications/reminder.js',
  './rules/categories.json',
  './rules/temporal.json',
  './rules/numbers.json',
  './rules/priorities.json',
  './rules/entities.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Yalnızca GET isteklerini yerel önbellekten karşıla
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        // Ağ yoksa ve HTML isteniyorsa index.html'e düş
        if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
