// sw.js - Service Worker Básico
const CACHE_NAME = 'heredograma-pro-v1';

self.addEventListener('install', (event) => {
    console.log('SW instalado');
});

self.addEventListener('fetch', (event) => {
    // Por enquanto, apenas deixa as requisições passarem
    event.respondWith(fetch(event.request));
});