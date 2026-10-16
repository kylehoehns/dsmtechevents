// Which events get a full card in the home page's list, and which only get
// one in the card pool (/cards/), the file the calendar's day panel fetches
// its other cards from. index.astro and cards.astro both split this way, so
// between them every event has exactly one card.
import { dayKey } from './format.mjs';
import { archivedEvents, hostsLabel } from './joint.mjs';

/** @param {{ upcoming: any[], past: any[] }} data */
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
// Archive records are slim (one host each, no address or About text), and a
// joint meetup has one record per host, folded together like the cache's.
/** @param {{ past: any[], archive?: any[], byId: Record<string, any> }} data */
export function pastEvents({ past, archive = [], byId }) {
  const seen = new Set(past.flatMap((e) => e.ids ?? [e.id]));
  const older = archivedEvents(archive)
    .filter((r) => !r.ids.some((id) => seen.has(id)))
    .map((r) => ({ id: r.id, title: r.title, start: r.start, end: r.end, venue: r.venue ?? null, online: !!r.online, going: r.going, url: r.url ?? null, groupIds: r.groupIds, headliner: !!r.headliner, description: r.description ?? '', archived: true, hostsLabel: hostsLabel(r, byId) }));
  return [...past, ...older].sort((a, b) => b.start.localeCompare(a.start));
}
