// Polski service worker: works offline, always tries the network first for the app itself.
const CACHE = 'polski-1.10';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './skarbonka.js', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// Cache Storage is shared by every app on this origin: only drop our own old caches.
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('polski-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // network first, so a new version shows up right away; after 3 s (bad signal) or offline use the cache.
    // The network answer still refreshes the cache when it comes in late.
    const net = fetch(req);
    // only good same-origin answers go into the cache (no 404s, no redirects); waitUntil keeps the worker
    // alive for a late answer. Registered before respondWith's handler, so it clones before the page reads the body.
    e.waitUntil(net.then(res => {
      if (!res.ok || res.type !== 'basic' || res.redirected) return;
      const copy = res.clone();
      return caches.open(CACHE).then(c => c.put(req, copy));
    }).catch(() => {}));
    const cached = () => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
    e.respondWith(new Promise(resolve => {
      let done = false;
      const fromCache = () => cached().then(r => { if (r && !done) { done = true; resolve(r); } return r; });
      const timer = setTimeout(fromCache, 3000);
      net.then(res => { clearTimeout(timer); if (!done) { done = true; resolve(res); } },
        () => { clearTimeout(timer); fromCache().then(r => { if (!done) { done = true; resolve(r || Response.error()); } }); });
    }));
  } else if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    // fonts: cache first
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});
