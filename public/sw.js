// Pages: try the network first so data refreshes show up, fall back to the
// cached copy when offline (or after 3s on a bad connection).
// Our CSS, JS and fonts: precached on install, so an offline page is styled;
// files an older build used are dropped whenever the home page is refreshed.
// Meetup event photos: their own small cache, oldest dropped past 60.
// Bump VERSION to start every cache fresh; activate deletes the old ones.
const VERSION = 'v4';
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
  // One cached copy per page: /?group=pyowa and / are the same HTML.
  const key = new URL(req.url).pathname;
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    if (res.ok) {
      await cache.put(key, res.clone());
      if (key === '/') pruneAssets(cache, await res.clone().text());
    }
    return res;
  } catch {
    return (await cache.match(key)) ?? offlinePage();
  }
}

// A page never visited while online has no saved copy; say so rather than
// showing another page under its address.
const offlinePage = () => new Response(
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · DSM Tech Events</title>'
  + '<body style="font:16px system-ui;padding:24px;max-width:36em"><h1>You\'re offline</h1><p>This page hasn\'t been saved on this device yet. <a href="/">The event list</a> works offline once you\'ve opened it.</p>',
  { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
);

// Drop built CSS/JS/fonts that the current home page no longer uses.
async function pruneAssets(cache, html) {
  const used = new Set(html.match(/\/_astro\/[^"'\s)]+/g) ?? []);
  for (const k of await cache.keys()) {
    const path = new URL(k.url).pathname;
    if (path.startsWith('/_astro/') && !used.has(path)) await cache.delete(k);
  }
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const cached = await cache.match(req);
  // Meetup's image host allows CORS, so fetch photos as readable responses:
  // an opaque one counts as ~7MB against the storage quota, a real one ~25KB.
  const fetched = name === IMAGES ? fetch(req.url, { mode: 'cors', credentials: 'omit' }).catch(() => fetch(req)) : fetch(req);
  const fresh = fetched.then(async (res) => {
    if (res.ok) {
      // A full quota shouldn't turn a good download into a broken image.
      try {
        await cache.put(req, res.clone());
        if (name === IMAGES) await trim(cache);
      } catch {}
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
