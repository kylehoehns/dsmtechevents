// Reading Meetup data, with no network calls, so tests can feed it saved pages.
// scripts/refresh.mjs does the fetching and hands the text to these.
import { meetupUrl } from '../../src/lib/meetup.mjs';
import { calendarEvents, isUpcoming, times, created, eventUrl } from './ical.mjs';

// Upcoming events from an iCal feed (Meetup's or any public calendar).
export function parseFeed(ics, group, { slug, now }) {
  return calendarEvents(ics)
    .filter((e) => isUpcoming(e, now))
    .map((e) => {
      const id = /^event_([^@]+)@/.exec(e.uid)?.[1] ?? e.uid;
      return {
        id: `${group.id}-${id}`,
        sourceId: id,
        title: e.summary?.trim(),
        ...times(e),
        url: slug ? meetupUrl(slug, `events/${id}/`) : (eventUrl(e) ?? group.website),
        description: cleanDescription(e.description, group.name),
        venue: e.location || null,
        created: created(e),
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
  if (!group) throw new Error(`no Group entry for ${slug} on page`);
  // Total past meetups lives under a key like events({"filter":{"status":["PAST"]},"first":1}).
  const pastKey = Object.keys(group).find((k) => k.startsWith('events(') && k.includes('"status":["PAST"]') && !k.includes('DateTime'));
  // When the group last met: its newest PAST event (cancelled ones don't
  // count). The page lists the last ten events however old they are, so this
  // reaches further back than the cache's 90 days. The site uses it to hide
  // quiet groups and to say "Back!" when one returns.
  const lastMet =
    [...events.values()]
      .filter((e) => e.status === 'PAST')
      .map((e) => e.start)
      .sort()
      .at(-1) ?? null;
  return {
    // Who and where the group is, for scripts/add-listing.mjs. The fetch doesn't cache these.
    name: group.name?.trim() || null,
    city: group.city ?? null,
    state: group.state ?? null,
    isPrivate: group.isPrivate === true,
    logo: photo(group.keyGroupPhoto),
    members: group.stats?.memberCounts?.all ?? null,
    pastCount: (pastKey && group[pastKey]?.totalCount) ?? null,
    lastMet,
    events,
  };
}

// Fill in the feed's upcoming events from the page, and pick up the page's
// recent past events, which the feed doesn't include.
// The feed stays the source for an upcoming event's title, time and link; the
// page only adds these. An event the page says is cancelled is dropped even if
// the feed still lists it.
export const FROM_PAGE = ['venue', 'address', 'online', 'hybrid', 'image', 'going', 'description'];
export function enrich(upcoming, details, group, { now, cutoff }) {
  for (let i = upcoming.length - 1; i >= 0; i--) {
    const page = details.events.get(upcoming[i].sourceId);
    if (!page) continue;
    if (page.status === 'CANCELLED') {
      upcoming.splice(i, 1);
      continue;
    }
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

// Ids of the events the page says are cancelled, so mergeCache (refresh.mjs) can drop a
// cached copy that ended before the next run noticed the cancellation.
export function cancelledIds(details, group) {
  return [...details.events].filter(([, e]) => e.status === 'CANCELLED').map(([id]) => `${group.id}-${id}`);
}

// A Meetup feed with nothing coming up, for a group whose last run had events
// coming up. Fine if the events page agrees (the events were called off or
// taken down); broken if the page still lists upcoming events, or couldn't be
// read either (`details` null). Broken throws, so the last good cache stays
// and a source-broken issue opens.
export function checkEmptyFeed(upcoming, details, { now, hadUpcoming }) {
  if (upcoming.length || !hadUpcoming) return;
  if (!details) throw new Error(`feed lists no upcoming events (the last run had ${hadUpcoming}), and the events page couldn't be read to confirm`);
  const onPage = [...details.events.values()].filter((e) => e.status !== 'CANCELLED' && Date.parse(e.end) >= now).length;
  if (onPage) throw new Error(`feed lists no upcoming events, but the events page lists ${onPage}`);
}

export function formatAddress(venue) {
  if (!venue?.address) return venue?.city || null;
  const address = venue.address.replace(/, USA$/, '');
  // Check for ", City" rather than just the name: "4501 NW Urbandale Dr" is in
  // Urbandale but doesn't say so.
  if (!venue.city) return address;
  const hasCity = address.toLowerCase().includes(`, ${venue.city.toLowerCase()}`);
  return hasCity ? address : `${address}, ${venue.city}`;
}

// The feed prefixes every description with the group's name on its own line.
export function cleanDescription(text = '', groupName) {
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines[0]?.trim() === groupName) lines.shift();
  return lines.join('\n').trim().slice(0, 2000);
}
