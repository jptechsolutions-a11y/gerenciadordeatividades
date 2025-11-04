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

// 3. Fetch: Estratégia Mista (Cache First para App, Network First para API/CDNs)
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') {
        return;
    }

    const requestUrl = new URL(event.request.url);

    // --- ESTRATÉGIA 1: Cache First (para o App Shell) ---
    // Verifica se a URL é do mesmo host e está na lista de cache
    const isAppShell = requestUrl.origin === self.location.origin && urlsToCache.includes(requestUrl.pathname);

    if (isAppShell) {
        event.respondWith(
            caches.match(event.request)
                .then(cachedResponse => {
                    // 1. Tenta servir do cache
                    if (cachedResponse) {
                        // Opcional: No background, atualiza o cache (Stale-While-Revalidate)
                        fetch(event.request).then(networkResponse => {
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, networkResponse);
                            });
                        });
                        // Retorna o cache imediatamente
                        return cachedResponse;
                    }
                    // 2. Se falhar (não está em cache), busca na rede, cacheia e retorna
                    return fetch(event.request).then(networkResponse => {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                        return networkResponse;
                    });
                })
        );
        return; // Encerra aqui para arquivos do App Shell
    }

    // --- ESTRATÉGIA 2: Network First (para API, CDNs, etc.) ---
    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                // Opcional: cachear dinamicamente para offline
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            })
            .catch(() => {
                // Rede falhou, tenta o cache como fallback (bom para offline)
                return caches.match(event.request);
            })
    );
});

