// Places that have hosted a meetup, from the events we have on record (the
// archive plus the cache's recent past), for organizers looking for a room.
// Built from data already fetched: nothing here is written by hand.

// The same room under slightly different names ("Lean Techniques, Inc." and
// "Lean Techniques") is one venue.
const venueKey = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+(inc|llc|co)\s*$/, '').trim();

// One row per venue, most-used first: { name, address, count, groups, last }.
// A joint meetup is archived once per host; it counts once, with both hosts.
export function hostedVenues(records) {
  const events = new Map();
  for (const e of records) {
    if (!e.venue || e.online || /^online$/i.test(e.venue.trim())) continue;
    const key = `${venueKey(e.venue)}|${e.start}`;
    const seen = events.get(key) ?? { venue: e.venue.trim(), address: null, start: e.start, groups: new Set() };
    seen.address ??= e.address ?? null;
    for (const g of e.groupIds ?? (e.group ? [e.group] : [])) seen.groups.add(g);
    events.set(key, seen);
  }
  const venues = new Map();
  for (const e of events.values()) {
    const key = venueKey(e.venue);
    const v = venues.get(key) ?? { name: e.venue, address: null, count: 0, groups: new Set(), last: e.start };
    v.address ??= e.address;
    v.count++;
    for (const g of e.groups) v.groups.add(g);
    if (e.start > v.last) v.last = e.start;
    venues.set(key, v);
  }
  return [...venues.values()]
    .map((v) => ({ ...v, groups: [...v.groups] }))
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
}
