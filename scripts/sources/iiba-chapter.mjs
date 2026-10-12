// IIBA chapter sites (e.g. centraliowa.iiba.org) run on MemberNova, which
// publishes every event, past and upcoming, as an iCal feed at /calendar-feed.
// The feed has no event links and writes the location as "street street
// City, IA Country". Each event's page is at /events/<slug>/, the slug made
// from the title; a guess counts only if the page's title matches. A miss
// falls back to the Events page (it lists the next six months), and the page
// found gives the venue name and address. Otherwise the street from the feed
// stands in.
import { toText, richText } from './html.mjs';
import { calendarEvents, times } from './ical.mjs';

// A placeholder someone saved, and the members' business meeting.
const SKIP = /^test$|annual general meeting/i;

export default async function iibaChapter(group, { get, now = Date.now(), since = now }) {
  const origin = new URL(group.website).origin;
  const all = calendarEvents(await get(`${origin}/calendar-feed`), 'IIBA calendar feed');
  // The feed keeps past events, so an empty one means it broke.
  if (!all.length) throw new Error('IIBA calendar feed has no events');
  const wanted = all.filter((e) => e.status !== 'CANCELLED' && (e.end ?? e.start).getTime() >= since && !SKIP.test(e.summary.trim()));

  // Title → /Events/<slug> from the Events page, read only when a guess misses.
  let links = null;
  const listed = async (title) => {
    if (!links) {
      const page = await get(`${origin}/Events`);
      links = new Map([...page.matchAll(/class="EAS-Name">\s*<a href="[^"]*\/Events\/([^"/?#]+)">([^<]+)<\/a>/g)]
        .map(([, slug, t]) => [toText(t), `${origin}/Events/${slug}`]));
      if (!links.size) throw new Error(`no events listed on ${origin}/Events`);
    }
    return links.get(title) ?? null;
  };

  const events = [];
  for (const e of wanted) {
    const title = e.summary.trim();
    const fromFeed = feedLocation(e.location);
    // "AI as Your BA Partner: Plan Faster. Lead Smarter." → ai-as-your-ba-partner-plan-faster.-lead-smarter.
    const guess = `${origin}/events/${title.toLowerCase().replace(/[^a-z0-9. -]/g, '').trim().replace(/[ -]+/g, '-')}/`;
    let url = null;
    let html = await get(guess).catch(() => null);
    if (html && toText(/<meta property="og:title" content="([^"]*)"/.exec(html)?.[1] ?? '') === title) url = guess;
    else if (e.end.getTime() >= now && (url = await listed(title))) html = await get(url);
    const place = url ? readEventPage(html, url, fromFeed) : fromFeed;
    events.push({
      id: `${group.id}-${e.uid}`,
      sourceId: e.uid,
      title,
      ...times(e),
      url: url ?? `${origin}/Events`,
      description: description(e, title),
      ...place,
    });
  }
  return events;
}

// The feed's HTML write-up (ALT-DESC; its plain DESCRIPTION is one run-on
// line). Lines the card already shows are dropped: the title repeated in bold
// at the top, and the "📅 day | time" and "📍 venue" lines.
function description(e, title) {
  const html = e['ALT-DESC']?.val ?? '';
  return richText(html)
    .split('\n')
    .filter((line) => !/^\s*(📅|📍)/u.test(line) && line.replace(/\*\*/g, '').trim() !== title)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// "1514 Walnut Street 1514 Walnut Street Des Moines, IA United States of
// America" → venue "1514 Walnut Street", address "Des Moines, IA". The feed
// has no venue name, so the street stands in for one.
function feedLocation(location) {
  if (!location) return { venue: null, address: null };
  const m = /^(.+?)\s+\1\s+(.+?),\s*IA\b/.exec(location.trim());
  if (!m) throw new Error(`unexpected location in IIBA feed: "${location}"`);
  return { venue: m[1], address: `${m[2]}, IA` };
}

// The "Where" box of an event page: venue name, then street / City, IA /
// country on separate lines. An event with no location in the feed has no
// box (an online or unannounced one); one with a location must have it.
function readEventPage(html, url, fromFeed) {
  const box = /<div class="widget-group-title">Where<\/div>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/.exec(html)?.[1];
  if (box == null) {
    if (fromFeed.venue) throw new Error(`no Where box on ${url}`);
    return fromFeed;
  }
  const venue = toText(/class="location-name">([\s\S]*?)<\/div>/.exec(box)?.[1] ?? '') || fromFeed.venue;
  const lines = toText(/class="location-address">([\s\S]*?)<\/div>/.exec(box)?.[1] ?? '').split('\n').map((s) => s.trim()).filter((s) => s && !/^United States/i.test(s));
  return { venue, address: lines.join(', ') || fromFeed.address };
}
