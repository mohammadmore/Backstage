// ---------------------------------------------------------------
// Service Worker ای‌ونت مستر
// - فایل‌های برنامه (assets) کش می‌شوند تا برنامه سریع و حتی آفلاین باز شود
// - صفحه اصلی: اول شبکه، در صورت قطعی نسخه ذخیره‌شده
// - چند API خواندنی (وظایف من، اعلان‌ها، مهمانان): اول شبکه، در صورت قطعی آخرین پاسخ
// - هیچ درخواست تغییری (POST) کش نمی‌شود
// ---------------------------------------------------------------
const VERSION = 'evm-v3';
const SHELL = `${VERSION}-shell`;
const API = `${VERSION}-api`;
const OFFLINE_ACTIONS = ['me', 'get_my_tasks', 'get_notifications', 'get_guests'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', 'index.html', 'manifest.webmanifest', 'theme-init.js', 'icons/icon-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => {
  if (e.data === 'clear-api-cache') caches.delete(API); // پس از خروج کاربر، داده‌های او از کش پاک می‌شود
});

const networkFirst = async (req, cacheName) => {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(req);
    if (hit) return hit;
    throw err;
  }
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.endsWith('/api.php')) {
    if (OFFLINE_ACTIONS.includes(url.searchParams.get('action'))) e.respondWith(networkFirst(req, API));
    return; // سایر درخواست‌های API فقط از شبکه
  }
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, SHELL).catch(() => caches.match('index.html')));
    return;
  }
  if (url.pathname.includes('/assets/') || url.pathname.includes('/icons/')) {
    // فایل‌های نسخه‌دار: اول کش
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); return res; })));
  }
});
