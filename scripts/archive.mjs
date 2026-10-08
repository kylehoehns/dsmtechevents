// The archive: every event that has happened, one file per year
// (data/archive/2026.json). The cache only keeps 90 days of past events, so
// this is the long-term record, for things like a year in review.
//
// Records are slim and sorted, and a file is only rewritten when something in
// it actually changed, so a quiet refresh leaves the archive alone.
import { dayKey } from '../src/lib/format.mjs';

// A hand-added event with no host group (a conference) has no `group`.
const slim = (e, group) => ({
  id: e.id,
  ...(group && { group }),
  title: e.title,
  start: e.start,
  end: e.end,
  ...(e.online ? { online: true } : { venue: e.venue ?? null }),
  ...(e.going != null && { going: e.going }),
  ...(e.url && { url: e.url }),
  ...(e.headliner && { headliner: true }),
});

// Merge ended events into the archive. `archive` maps year → records;
// `caches` maps group id → its cache file contents; `manual` is the hand-added
// events from events.yaml (data.mjs manualEvent), filed under their first host.
// Returns the years whose records changed, with their new contents.
export function updateArchive(archive, caches, now, manual = []) {
  const years = new Map(Object.entries(archive).map(([y, list]) => [y, new Map(list.map((r) => [r.id, r]))]));
  const ended = [
    ...Object.entries(caches).flatMap(([group, cache]) => (cache.events ?? []).map((e) => [e, group])),
    ...manual.map((e) => [e, e.groupIds?.[0]]),
  ];
  for (const [e, group] of ended) {
    if (Date.parse(e.end) >= now) continue;
    const year = dayKey(e.start).slice(0, 4);
    if (!years.has(year)) years.set(year, new Map());
    const byId = years.get(year);
    // Keep anything already recorded and let a fresher copy fill in or update
    // fields, except the RSVP count: the larger one is the final count, and a
    // stale cache copy can be lower.
    const had = byId.get(e.id);
    const next = { ...had, ...slim(e, group) };
    if (had?.going > (next.going ?? -1)) next.going = had.going;
    byId.set(e.id, next);
  }
  const changed = {};
  for (const [year, byId] of years) {
    const list = [...byId.values()].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
    if (JSON.stringify(list) !== JSON.stringify(archive[year] ?? [])) changed[year] = list;
  }
  return changed;
}
