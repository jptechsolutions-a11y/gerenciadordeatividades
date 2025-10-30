// Service Worker Otimizado (sw.js)
const CACHE_NAME = 'jprojects-v2'; // Mudei para v2 para forçar a reinstalação
const urlsToCache = [
   '/', 
    '/app.html', 
    '/login.html', 
    '/style.css',
    '/script.js',
    '/icon.png',
    '/manifest.json' //
    // Não precisamos cachear CDNs (tailwindcss, chart.js), o navegador já faz isso.
];

// 1. Instalação: Salva os arquivos base no cache
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('SW: Cache aberto, salvando arquivos base.');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting()) // Força o novo SW a ativar
    );
});

// 2. Ativação: Limpa caches antigos
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('SW: Limpando cache antigo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Controla todas as abas abertas
    );
});

// 3. Fetch: Estratégia "Network First" (O MAIS IMPORTANTE)
// Tenta buscar da rede primeiro. Se falhar, usa o cache.
self.addEventListener('fetch', event => {
    // Ignora requisições que não são GET (ex: POST para /api/proxy)
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                // Sucesso! Clona a resposta e salva no cache para a próxima vez.
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME)
                    .then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                return networkResponse;
            })
            .catch(() => {
                // Rede falhou (offline?). Tenta pegar do cache.
                return caches.match(event.request)
                    .then(cachedResponse => {
                        return cachedResponse || Response.error(); // Retorna cache ou falha
                    });
            })
    );
});
