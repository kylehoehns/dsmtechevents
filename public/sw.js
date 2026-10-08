// Pages (and the card pool): try the network first so data refreshes show
// up, fall back to the cached copy when offline (or after 3s on a bad
// connection).
// Our CSS, JS and fonts: every file the build made is listed in ASSETS, saved
// on install, and anything else under /_astro/ is dropped once this worker
// takes over. Served stale-while-revalidate.
// Meetup event photos: their own small cache, oldest dropped past 60.
// Group logos and the TV page's photos: saved with their page, on install and
// whenever it loads online.
// Bump VERSION to start every cache fresh; activate deletes the old ones.
const VERSION = 'v5';
const CACHE = `dsmtechevents-${VERSION}`;
const IMAGES = `dsmtechevents-images-${VERSION}`;
const LOGOS = `dsmtechevents-logos-${VERSION}`;
const MAX_IMAGES = 60;
const MAX_LOGOS = 40;
const PHOTO_HOST = 'https://secure.meetupstatic.com';
// Saved on install. /cards/ is the card pool the calendar's day panel reads.
const PAGES = ['/', '/groups/', '/tv/', '/cards/'];
// The build fills this in (scripts/sw-precache.mjs): every file in /_astro/.
const ASSETS = [];
// Images a saved page needs offline: <img class="..."> on it, and the cache they go in.
const PAGE_IMAGES = { '/groups/': ['logo-img', LOGOS], '/tv/': ['tv-photo', IMAGES] };

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(async (cache) => {
    await cache.addAll([...PAGES, ...ASSETS]);
    // Pages saved here may never be opened online, so save their images now too.
    await Promise.all(Object.keys(PAGE_IMAGES).map(async (page) => saveImages(page, await (await cache.match(page)).text()).catch(() => {})));
  }));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = [CACHE, IMAGES, LOGOS];
    await Promise.all((await caches.keys()).filter((k) => !keep.includes(k)).map((k) => caches.delete(k)));
    // Files an older build made: no page of this build asks for them.
    const cache = await caches.open(CACHE);
    const current = new Set(ASSETS);
    for (const k of await cache.keys()) {
      const path = new URL(k.url).pathname;
      if (path.startsWith('/_astro/') && !current.has(path)) await cache.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    e.respondWith(req.mode === 'navigate' || PAGES.includes(url.pathname) ? networkFirst(e) : staleWhileRevalidate(req, CACHE));
  } else if (url.origin === PHOTO_HOST && req.destination === 'image') {
    e.respondWith(caches.match(req.url, { cacheName: LOGOS }).then((logo) => logo ?? staleWhileRevalidate(req, IMAGES)));
  }
  // Anything else (analytics, other hosts) goes straight to the network.
  // Fetching it here would also need its host in connect-src (see _headers).
});

async function networkFirst(e) {
  const req = e.request;
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
      if (Object.hasOwn(PAGE_IMAGES, key)) e.waitUntil(res.clone().text().then((html) => saveImages(key, html)).catch(() => {}));
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

// The Groups page's logos load lazily, so most never would before going
// offline, and the TV page's photos are on slides not showing yet; and a page
// saved on install may never be opened online at all. So save a page's images
// along with the page. Only Meetup-hosted ones: their host sends CORS headers,
// so each download can be checked (a real image, not an error page) and is
// stored at its real size. A group's own site may not (that would mean an
// unreadable "opaque" copy, counted as ~7MB each against the storage quota),
// and fetching it here would need its host in the CSP. Logos the page no
// longer shows are dropped; photos share the photo cache's limit.
async function saveImages(page, html) {
  const [cls, name] = PAGE_IMAGES[page];
  const urls = [];
  for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
    const src = tag.includes(`class="${cls}"`) && tag.match(/\bsrc="([^"]+)"/)?.[1].replaceAll('&amp;', '&');
    if (src?.startsWith(`${PHOTO_HOST}/`) && !urls.includes(src)) urls.push(src);
  }
  const keep = urls.slice(0, MAX_LOGOS);
  const cache = await caches.open(name);
  if (name === LOGOS) for (const k of await cache.keys()) if (!keep.includes(k.url)) await cache.delete(k);
  await Promise.all(keep.map(async (src) => {
    if (await cache.match(src)) return;
    try {
      const res = await fetch(src, { mode: 'cors', credentials: 'omit' });
      if (res.ok && res.headers.get('Content-Type')?.startsWith('image/')) await cache.put(src, res);
    } catch {} // a missing image now just means a missing image offline
  }));
  if (name === IMAGES) await trim(cache);
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  // ignoreVary: install saved our files with a plain request, but scripts and
  // fonts are asked for with an Origin header; a "Vary: Origin" on the saved
  // copy would otherwise make it miss. Each URL has one possible body anyway.
  const cached = await cache.match(req, { ignoreVary: true });
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
