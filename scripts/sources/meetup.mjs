// Reading Meetup data, with no network calls, so tests can feed it saved pages.
// fetch-events.mjs does the fetching and hands the text to these.
import ical from 'node-ical';

// Upcoming events from an iCal feed (Meetup's or any public calendar).
export function parseFeed(ics, group, { slug, now }) {
  if (!ics.includes('BEGIN:VCALENDAR')) throw new Error('feed did not return a calendar');
  return Object.values(ical.sync.parseICS(ics))
    .filter((e) => e.type === 'VEVENT' && e.status !== 'CANCELLED')
    .filter((e) => (e.end ?? e.start).getTime() >= now)
    .map((e) => {
      const id = /^event_([^@]+)@/.exec(e.uid)?.[1] ?? e.uid;
      return {
        id: `${group.id}-${id}`,
        sourceId: id,
        title: e.summary?.trim(),
        start: e.start.toISOString(),
        end: (e.end ?? e.start).toISOString(),
        allDay: e.datetype === 'date',
        url: slug ? `https://www.meetup.com/${slug}/events/${id}/` : (e.url?.val ?? e.url ?? group.website),
        description: cleanDescription(e.description, group.name),
        venue: e.location || null,
      };
    });
}

// Venue, photo, RSVP count and recent past events from the JSON a group's
// /events/ page embeds for its own scripts. Not a public API, so it may change.
export function parseEventsPage(html, slug) {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('no __NEXT_DATA__ on page');
  const state = JSON.parse(m[1]).props?.pageProps?.__APOLLO_STATE__;
  if (!state) throw new Error('no Apollo state on page');

  const deref = (ref) => (ref?.__ref ? state[ref.__ref] : ref);
  const photo = (ref) => deref(ref)?.highResUrl?.replace('/highres_', '/600_') ?? null;

  const events = new Map();
  for (const [key, e] of Object.entries(state)) {
    if (!key.startsWith('Event:')) continue;
    const venue = deref(e.venue);
    const online = e.isOnline || e.eventType === 'ONLINE' || venue?.name === 'Online event';
    events.set(e.id, {
      title: e.title?.trim(),
      start: new Date(e.dateTime).toISOString(),
      end: new Date(e.endTime ?? e.dateTime).toISOString(),
      description: (e.description ?? '').trim().slice(0, 2000),
      status: e.status,
      url: e.eventUrl,
      venue: online ? 'Online' : venue?.name || null,
      address: online ? null : formatAddress(venue),
      online,
      hybrid: e.eventType === 'HYBRID',
      image: photo(e.displayPhoto ?? e.featuredEventPhoto),
      going: e.going?.totalCount ?? null,
    });
  }
  // Meetup's urlname can differ in case from the URL we have (ProductTank-Des-Moines-Ames).
  const group = Object.entries(state).find(([k, v]) => k.startsWith('Group:') && v.urlname?.toLowerCase() === slug.toLowerCase())?.[1];
  // Total past meetups lives under a key like events({"filter":{"status":["PAST"]},"first":1}).
  const pastKey = group && Object.keys(group).find((k) => k.startsWith('events(') && k.includes('"status":["PAST"]') && !k.includes('DateTime'));
  return {
    logo: photo(group?.keyGroupPhoto),
    members: group?.stats?.memberCounts?.all ?? null,
    pastCount: (pastKey && group[pastKey]?.totalCount) ?? null,
    events,
  };
}

// The median RSVP count of a group's past events on its page (Meetup shows
// about 10). Null with fewer than 4, so one or two nights don't set it.
export function typicalGoing(details, now) {
  const counts = [...details.events.values()]
    .filter((e) => Date.parse(e.end) < now && e.status !== 'CANCELLED' && e.going > 0)
    .map((e) => e.going)
    .sort((a, b) => a - b);
  if (counts.length < 4) return null;
  const mid = counts.length >> 1;
  return counts.length % 2 ? counts[mid] : Math.round((counts[mid - 1] + counts[mid]) / 2);
}

// Fill in the feed's upcoming events from the page, and pick up the page's
// recent past events, which the feed doesn't include.
// The feed stays the source for an upcoming event's title, time and link; the
// page only adds these. An event the page says is cancelled is dropped even if
// the feed still lists it.
const FROM_PAGE = ['venue', 'address', 'online', 'hybrid', 'image', 'going', 'description'];
export function enrich(upcoming, details, group, { now, cutoff }) {
  for (let i = upcoming.length - 1; i >= 0; i--) {
    const page = details.events.get(upcoming[i].sourceId);
    if (!page) continue;
    if (page.status === 'CANCELLED') { upcoming.splice(i, 1); continue; }
    for (const k of FROM_PAGE) if (page[k] !== undefined && page[k] !== '') upcoming[i][k] = page[k];
  }
  const recent = [];
  for (const [id, ev] of details.events) {
    const end = Date.parse(ev.end);
    if (end < now && end >= cutoff && ev.status !== 'CANCELLED') {
      recent.push({ id: `${group.id}-${id}`, sourceId: id, allDay: false, ...ev });
    }
  }
  return recent;
}

// Merge a fresh fetch into the previous cache file: past events from the cache
// are kept for the backfill window, the fresh copy of an event wins, and
// `fetchedAt` only moves when something actually changed (so an unchanged
// run leaves the file alone and the refresh workflow has nothing to commit).
export function mergeCache(previous, fresh, { now, cutoff, fetchedAt = new Date(now).toISOString() }) {
  const carried = previous.events.filter((e) => Date.parse(e.end) < now && Date.parse(e.end) >= cutoff);
  const byId = new Map();
  for (const e of [...carried, ...fresh.events]) byId.set(e.id, { ...byId.get(e.id), ...e });
  const events = [...byId.values()].map(({ status, ...e }) => e).sort((a, b) => a.start.localeCompare(b.start));

  // Group facts from Meetup: kept from the last run if this one missed them,
  // and left out when unknown so files without them don't change.
  const facts = {};
  for (const k of ['typical', 'members', 'pastCount']) {
    const v = fresh[k] ?? previous[k];
    if (v != null) facts[k] = v;
  }
  const result = { logo: fresh.logo ?? previous.logo ?? null, ...facts, enriched: fresh.enriched, events };
  const { fetchedAt: before, ...previousResult } = previous;
  const unchanged = before && JSON.stringify(previousResult) === JSON.stringify(result);
  return { fetchedAt: unchanged ? before : fetchedAt, ...result };
}

export function formatAddress(venue) {
  if (!venue?.address) return venue?.city || null;
  const address = venue.address.replace(/, USA$/, '');
  // Check for ", City" rather than just the name: "4501 NW Urbandale Dr" is in
  // Urbandale but doesn't say so.
  const hasCity = address.toLowerCase().includes(`, ${venue.city.toLowerCase()}`);
  return hasCity ? address : `${address}, ${venue.city}`;
}

// The feed prefixes every description with the group's name on its own line.
export function cleanDescription(text = '', groupName) {
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines[0]?.trim() === groupName) lines.shift();
  return lines.join('\n').trim().slice(0, 2000);
}
