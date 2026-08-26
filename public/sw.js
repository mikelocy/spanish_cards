// Offline support for practice. Deliberately network-first everywhere: being
// stale is a worse failure than being slow, since decks change when a new page
// is photographed. The cache is the fallback for no-signal, not the fast path.
const CACHE = 'spanish-v1';

const SHELL = [
  '/',
  '/styles.css',
  '/app.js',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/api/decks',
];

// Pull every set down at install, not just the ones he happens to open, so a
// trip with no signal still has the whole book available.
async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(SHELL.map((url) => cache.add(url).catch(() => null)));
  try {
    const decks = await (await fetch('/api/decks')).json();
    await Promise.all(
      decks.map((d) => cache.add('/api/decks/' + encodeURIComponent(d.slug)).catch(() => null))
    );
  } catch { /* offline at install time; runtime caching will fill in */ }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Adding words needs the network and a signed-in session — never serve it
  // from cache, or he'd get a dead page that looks alive.
  if (url.pathname.startsWith('/api/extract') ||
      url.pathname.startsWith('/api/login') ||
      url.pathname.startsWith('/api/session') ||
      url.pathname === '/add' ||
      url.pathname === '/add.js') {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        // A navigation to any route falls back to the shell.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
  );
});
