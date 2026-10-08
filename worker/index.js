// The only server-side code: counts outbound clicks (RSVP, details, maps) so
// organizers can see how many people the site sends their way. Everything
// else is static files, served by Cloudflare before this runs (wrangler.jsonc
// routes only /api/* here).
//
// Privacy: a click is stored as what kind of link, which group, which event.
// No IP address, cookie, user agent or anything else about the visitor.
const KINDS = new Set(['rsvp', 'title', 'map', 'poster', 'later', 'past', 'meetup', 'website']);
const ID = /^[a-z0-9-]{1,120}$/i;

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/click') {
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      const click = parseClick(await request.text());
      if (!click) return new Response(null, { status: 400 });
      // Analytics Engine: blobs are the dimensions, the index is what we
      // usually filter by (the group). One data point per host group, so a
      // joint meetup counts for each of them.
      for (const group of click.groups.length ? click.groups : ['']) {
        env.CLICKS?.writeDataPoint({ blobs: [click.kind, group, click.event], indexes: [group || 'none'] });
      }
      return new Response(null, { status: 204 });
    }
    return env.ASSETS.fetch(request);
  },
};
