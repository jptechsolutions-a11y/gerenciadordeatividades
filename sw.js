// Service Worker Básico (sw.js)
const CACHE_NAME = 'jprojects-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/icon.png',
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/feather-icons/dist/feather.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache aberto');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Retorna do cache ou busca na rede
                return response || fetch(event.request);
            })
    );
});
