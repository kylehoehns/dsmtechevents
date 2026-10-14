// The /tv/ "year so far" slide's numbers, from the archive (every event that
// has ended) and what's coming up, all in Des Moines time: how many events
// this year, how many groups ran them, how many more are already on the
// calendar this year, and a count per month through this one (which isn't
// over; later months are null, so the chart keeps all twelve slots and its
// bars the same width all year). No RSVP counts: only Meetup and Luma report them. null early in the
// year, while there's too little to show.
import { dayKey, month } from './format.mjs';

const ENOUGH = 10;

export function yearSoFar(archive, upcoming, now = Date.now()) {
  const today = dayKey(now);
  const year = today.slice(0, 4);
  const ended = archive.filter((r) => dayKey(r.start).startsWith(year));
  if (ended.length < ENOUGH) return null;
  const current = Number(today.slice(5, 7));
  const months = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const n = i < current ? ended.filter((r) => dayKey(r.start).startsWith(key)).length : null;
    return { label: month(`${key}-15T17:00:00Z`), n, partial: i === current - 1 };
  });
  return {
    year,
    events: ended.length,
    groups: new Set(ended.map((r) => r.group)).size,
    ahead: upcoming.filter((e) => !e.repeat && dayKey(e.start).startsWith(year)).length,
    months,
    busiest: Math.max(...months.map((m) => m.n ?? 0)),
  };
}
