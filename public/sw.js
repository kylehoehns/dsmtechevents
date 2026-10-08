// Pages: try the network first so data refreshes show up, fall back to the
// cached copy when offline (or after 3s on a bad connection).
// Our CSS, JS and fonts: precached on install, so an offline page is styled.
// Meetup event photos: their own small cache, oldest dropped past 60.
// Bump VERSION to start every cache fresh; activate deletes the old ones.
const VERSION = 'v3';
const CACHE = `dsmtechevents-${VERSION}`;
const IMAGES = `dsmtechevents-images-${VERSION}`;
const MAX_IMAGES = 60;
const PHOTO_HOST = 'https://secure.meetupstatic.com';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(['/', '/groups/']);
    // The built CSS/JS/fonts have hashed names, so read them out of the page
    // we just cached instead of hard-coding them here.
    const html = await (await cache.match('/')).text();
    const assets = [...new Set(html.match(/\/_astro\/[^"'\s)]+/g) ?? [])];
    await cache.addAll(assets);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== IMAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    e.respondWith(req.mode === 'navigate' ? networkFirst(req) : staleWhileRevalidate(req, CACHE));
  } else if (url.origin === PHOTO_HOST && req.destination === 'image') {
    e.respondWith(staleWhileRevalidate(req, IMAGES));
  }
  // Anything else (analytics, other hosts) goes straight to the network.
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) ?? (await cache.match('/')) ?? Response.error();
  }
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const cached = await cache.match(req);
  const fresh = fetch(req).then(async (res) => {
    // Cross-origin images come back opaque (status 0); that's fine to cache.
    if (res.ok || res.type === 'opaque') {
      await cache.put(req, res.clone());
      if (name === IMAGES) trim(cache);
    }
    return res;
  }).catch(() => cached ?? Response.error());
  return cached ?? fresh;
}

// Cache keys come back in insertion order, so the first ones are the oldest.
async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_IMAGES)).map((k) => cache.delete(k)));
}
