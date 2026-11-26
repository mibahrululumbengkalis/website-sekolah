// Service worker sederhana: cache app shell, data Firebase selalu diambil langsung.
const CACHE = 'mibu-v25';
const SHELL = ['./', './index.html', './admin.html', './css/style.css', './js/public.js', './js/admin.js',
  './js/firebase.js', './js/util.js', './js/defaults.js', './js/presensi-core.js', './js/presensi.js', './js/admin-presensi.js', './presensi.html', './guru.html', './js/guru.js', './js/admin-akademik.js', './css/guru.css', './css/admin.css', './css/presensi.css', './firebase-config.js', './manifest.webmanifest', './icons/logo-192.png', './icons/favicon.png', './img/banner.jpg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // Firebase/CDN/Google Fonts: biarkan langsung
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
