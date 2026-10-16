// The home page's calendar, with no page in it: which months the data covers,
// the days in a month's grid, the events on a day, which day a month opens
// on, and the view as the URL carries it (?view=calendar&group=cijug&day=…,
// ?q=java). src/scripts/app.js draws the month calendar, the mini calendar
// and the day panel from these. Days are Des Moines day keys ("2026-10-15").
import { dayKey, lastDay, addDays, daysBetween, isDayKey } from './format.mjs';

// "2026-10" plus n months.
export const addMonths = (ym, n) => { const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };

// `events` is the page's calendar data ({ start, end, groups }); `group`
// narrows a day to one group's events ('' for every group).
export function calendar(events, today) {
  // The months the data covers: the cache keeps about 90 days of past events
  // (plus the archive), so earlier months would look quiet when they're just
  // not on file. Paging and ?day= stay inside these, and this month always counts.
  const first = events.reduce((m, e) => { const k = dayKey(e.start).slice(0, 7); return k < m ? k : m; }, today.slice(0, 7));
  const last = events.reduce((m, e) => { const k = lastDay(e.start, e.end).slice(0, 7); return k > m ? k : m; }, today.slice(0, 7));
  const inRange = (key) => key.slice(0, 7) >= first && key.slice(0, 7) <= last;

  // Every event on a day, a multi-day one on each of its days, by start time.
  const on = (key, group = '') => events
    .filter((e) => dayKey(e.start) <= key && key <= lastDay(e.start, e.end) && (!group || e.groups.includes(group)))
    .sort((a, b) => a.start.localeCompare(b.start));

  // The month's grid, whole weeks from Sunday, with the days around it.
  function cells(ym) {
    const firstDay = `${ym}-01`;
    const start = addDays(firstDay, -new Date(firstDay).getUTCDay());
    const weeks = Math.ceil(daysBetween(start, `${addMonths(ym, 1)}-01`) / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  }

  // The day a month opens on: today if it has events, else the month's next
  // day with events (its first, in a month that's over), else today or the 1st.
  function pick(ym, group = '') {
    const keys = cells(ym).filter((k) => k.startsWith(ym));
    if (today.startsWith(ym) && on(today, group).length) return today;
    const pastMonth = ym < today.slice(0, 7);
    return keys.find((k) => (pastMonth || k >= today) && on(k, group).length) ?? (today.startsWith(ym) ? today : keys[0]);
  }

  return { first, last, inRange, on, cells, pick };
}

// The view a URL's query asks for. Unknown groups (and inherited names like
// ?group=constructor) and days that don't exist or aren't on file are
// ignored, rather than rendering an empty or broken page. A search looks
// through every group, and shows its results in the list.
/** @param {string} search @param {{ groups: Record<string, unknown>, inRange: (key: string) => boolean, today: string }} known */
export function readState(search, { groups, inRange, today }) {
  const params = new URLSearchParams(search);
  const q = (params.get('q') ?? '').trim().slice(0, 100);
  const day = isDayKey(params.get('day')) && inRange(params.get('day')) ? params.get('day') : null;
  const group = !q && Object.hasOwn(groups, params.get('group') ?? '') ? params.get('group') : '';
  return { view: !q && params.get('view') === 'calendar' ? 'calendar' : 'list', group, day, month: (day ?? today).slice(0, 7), q };
}

// The query for a view: '' for the plain list. A day only counts in the calendar.
export function stateQuery({ view, group, day, q }) {
  const p = new URLSearchParams();
  if (view === 'calendar') p.set('view', 'calendar');
  if (group) p.set('group', group);
  if (view === 'calendar' && day) p.set('day', day);
  if (q) p.set('q', q);
  return p.size ? `?${p}` : '';
}
