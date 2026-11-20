const key = 'ewecast-shell-2';
const shell = ['./', './index.html', './app.js', './voice-worker.js', './manifest.webmanifest', './casty.jpg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(key).then(cache => cache.addAll(shell)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(name => name.startsWith('ewecast-shell-') && name !== key).map(name => caches.delete(name)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !shell.some(path => new URL(path, self.registration.scope).href === event.request.url)) return;
  event.respondWith(fetch(event.request).then(async response => {
    if (response.ok) await (await caches.open(key)).put(event.request, response.clone()).catch(() => {});
    return response;
  }).catch(async () => (await caches.match(event.request)) || Response.error()));
});
