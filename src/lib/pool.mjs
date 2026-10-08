// Which events get a full card in the home page's list, and which only get
// one in the card pool (/cards/), the file the calendar's day panel fetches
// its other cards from. index.astro and cards.astro both split this way, so
// between them every event has exactly one card.
import { dayKey } from './format.mjs';

export function splitEvents({ upcoming, past }, now = Date.now()) {
  const today = dayKey(now);
  // Full rows through the end of next month; anything later is a compact set list.
  const [ty, tm] = today.split('-').map(Number);
  const horizon = new Date(Date.UTC(ty, tm + 1, 0)).toISOString().slice(0, 10);
  const listed = upcoming.filter((e) => !e.repeat);
  const near = listed.filter((e) => dayKey(e.start) <= horizon);
  const far = listed.filter((e) => dayKey(e.start) > horizon);
  // Every event that doesn't get a full row in the list still needs a card
  // for the day panel.
  const pooled = [...upcoming.filter((e) => e.repeat), ...far, ...past];
  return { today, listed, near, far, pooled };
}

// Every past event a search can find, newest first: the cache's recent ones
// (about 90 days) plus older ones from the archive (data/archive/), which keeps
// every ended event. The card pool prints them as one-line rows, so a search
// can show a "Past" section without the home page carrying them.
// Archive records are slim (one host each, no address or About text). A
// joint meetup is one record per host, so those fold together like mergeJoint.
export function pastEvents({ past, archive = [], byId }) {
  const key = (e) => `${e.start}|${e.title.toLowerCase().replace(/\W+/g, '')}`;
  const seen = new Set(past.flatMap((e) => [e.id, key(e)]));
  const older = new Map();
  for (const r of archive) {
    if (seen.has(r.id) || seen.has(key(r))) continue;
    const had = older.get(key(r));
    if (had) { if (!had.groupIds.includes(r.group)) had.groupIds.push(r.group); continue; }
    older.set(key(r), { id: r.id, title: r.title, start: r.start, end: r.end, venue: r.venue ?? null, online: !!r.online, going: r.going, url: r.url ?? null, groupIds: [r.group] });
  }
  for (const e of older.values()) e.hostsLabel = e.groupIds.map((id) => byId[id]?.short).filter(Boolean).join(' + ');
  return [...past, ...older.values()].sort((a, b) => b.start.localeCompare(a.start));
}
