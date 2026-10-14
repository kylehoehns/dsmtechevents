// The only server-side code: counts outbound clicks (RSVP, details, maps) so
// organizers can see how many people the site sends their way, and passes Luma
// event photos through from our own domain (see src/lib/luma.mjs). Everything
// else is static files, served by Cloudflare before this runs (wrangler.jsonc
// routes only /api/* and /img/luma/* here).
//
// Privacy: a click is stored as what kind of link, which group, which event.
// No IP address, cookie, user agent or anything else about the visitor.
import { LUMA_HOST, LUMA_WIDTHS, LUMA_PATH } from '../src/lib/luma.mjs';

const KINDS = new Set(['rsvp', 'title', 'map', 'poster', 'later', 'past', 'meetup', 'website']);
const ID = /^[a-z0-9-]{1,120}$/i;
const MAX_BODY = 1024; // a real beacon is about 80 bytes

// The beacon body is {kind, groups, event}. Anything unexpected is dropped
// rather than stored; a joint meetup has up to a few host groups.
export function parseClick(text) {
  let body;
  try { body = JSON.parse(text); } catch { return null; }
  if (!body || !KINDS.has(body.kind)) return null;
  const groups = (Array.isArray(body.groups) ? body.groups : []).filter((g) => typeof g === 'string' && ID.test(g)).slice(0, 4);
  const event = typeof body.event === 'string' && ID.test(body.event) ? body.event : '';
  return { kind: body.kind, groups, event };
}

// The body as text, or null as soon as it passes `max` bytes (the rest is
// never read).
export async function readCapped(request, max) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(bytes);
}

// /img/luma/<width>/<path>: Luma's resized webp of that image, sent on with
// only its type and a long cache life, so the browser never sees Luma's
// cookie. Only the widths the site asks for, and only image paths on Luma's
// host, so this can't be used to fetch anything else.
const LUMA_TTL = 30 * 24 * 60 * 60; // an event's cover rarely changes; a new one gets a new file name
// Raster types only: an SVG can carry script. These responses skip
// public/_headers, so they set their own hardening.
const IMAGE_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/gif', 'image/avif']);
const IMAGE_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" };
async function lumaImage(path) {
  const [, width, rest] = /^\/img\/luma\/(\d+)\/(.+)$/.exec(path) ?? [];
  if (!LUMA_WIDTHS.includes(width) || !LUMA_PATH.test(rest ?? '')) return new Response(null, { status: 404, headers: IMAGE_HEADERS });
  const res = await fetch(`${LUMA_HOST}/cdn-cgi/image/format=webp,fit=scale-down,quality=75,width=${width}/${rest}`, {
    // Luma sends PNG unless asked for webp, which every current browser shows.
    headers: { Accept: 'image/webp' },
    cf: { cacheEverything: true, cacheTtl: LUMA_TTL },
  });
  const type = (res.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  if (!res.ok || !IMAGE_TYPES.has(type)) return new Response(null, { status: res.status === 404 ? 404 : 502, headers: IMAGE_HEADERS });
  return new Response(res.body, { headers: { ...IMAGE_HEADERS, 'Content-Type': type, 'Cache-Control': `public, max-age=${LUMA_TTL}` } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/click') {
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      // Only our own pages post here: browsers always send Origin with a
      // beacon, and another site's can't claim to be us. (A script outside a
      // browser can, which is what the rate limit is for.)
      if (request.headers.get('Origin') !== url.origin) return new Response(null, { status: 403 });
      // 30 clicks a minute per address is far more than a person makes. The
      // address is only a counter key in memory; it is never written anywhere.
      const ip = request.headers.get('CF-Connecting-IP') ?? '';
      if (env.CLICK_LIMIT && !(await env.CLICK_LIMIT.limit({ key: ip })).success) return new Response(null, { status: 429 });
      // Refuse a large body before reading it: a stated Content-Length first,
      // then a hard cap while streaming (a chunked body states none).
      if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY) return new Response(null, { status: 413 });
      const text = await readCapped(request, MAX_BODY);
      if (text == null) return new Response(null, { status: 413 });
      const click = parseClick(text);
      if (!click) return new Response(null, { status: 400 });
      // Analytics Engine: blobs are the dimensions, the index is what we
      // usually filter by (the group). One data point per host group, so a
      // joint meetup counts for each of them; double1 is that point's share
      // of the one click (1/hosts), so totals add up to real clicks.
      const hosts = click.groups.length ? click.groups : [''];
      for (const group of hosts) {
        env.CLICKS?.writeDataPoint({ blobs: [click.kind, group, click.event], doubles: [1 / hosts.length], indexes: [group || 'none'] });
      }
      return new Response(null, { status: 204 });
    }
    if (url.pathname.startsWith('/img/luma/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
      return lumaImage(url.pathname);
    }
    return env.ASSETS.fetch(request);
  },
};
