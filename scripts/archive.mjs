// The archive: every event that has happened, one file per year
// (data/archive/2026.json). The cache only keeps 90 days of past events, so
// this is the long-term record, for things like a year in review.
//
// Records are slim and sorted, and a file is only rewritten when something in
// it actually changed, so a quiet refresh leaves the archive alone.
import { dayKey } from '../src/lib/format.mjs';

const slim = (e, group) => ({
  id: e.id,
  group,
  title: e.title,
  start: e.start,
  end: e.end,
  ...(e.online ? { online: true } : { venue: e.venue ?? null }),
  ...(e.going != null && { going: e.going }),
  ...(e.url && { url: e.url }),
});

// Merge ended events into the archive. `archive` maps year → records;
// `caches` maps group id → its cache file contents. Returns the years whose
// records changed, with their new contents.
export function updateArchive(archive, caches, now) {
  const years = new Map(Object.entries(archive).map(([y, list]) => [y, new Map(list.map((r) => [r.id, r]))]));
  for (const [group, cache] of Object.entries(caches)) {
    for (const e of cache.events ?? []) {
      if (Date.parse(e.end) >= now) continue;
      const year = dayKey(e.start).slice(0, 4);
      if (!years.has(year)) years.set(year, new Map());
      const byId = years.get(year);
      // Keep anything already recorded (e.g. a final RSVP count) and let a
      // fresher copy fill in or update fields.
      byId.set(e.id, { ...byId.get(e.id), ...slim(e, group) });
    }
  }
  const changed = {};
  for (const [year, byId] of years) {
    const list = [...byId.values()].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
    if (JSON.stringify(list) !== JSON.stringify(archive[year] ?? [])) changed[year] = list;
  }
  return changed;
}
