// Date and text formatting shared by the build and the browser.
// Everything displays in Des Moines time, wherever the viewer is.
import { site } from './site.mjs';

export const fmt = (opts) => new Intl.DateTimeFormat('en-US', { timeZone: site.timeZone, ...opts });

const weekdayShort = fmt({ weekday: 'short' });
const monthShort = fmt({ month: 'short' });
const dayNum = fmt({ day: 'numeric' });
const timeFmt = fmt({ hour: 'numeric', minute: '2-digit' });
const longDate = fmt({ weekday: 'long', month: 'long', day: 'numeric' });
const monthLong = fmt({ month: 'long' });
const monthYear = fmt({ month: 'long', year: 'numeric' });
const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: site.timeZone });
const hourFmt = fmt({ hour: 'numeric', hourCycle: 'h23' });

export const DAY = 86_400_000;
export const dayKey = (when) => keyFmt.format(new Date(when)); // "2026-10-22"; takes an ISO string or a timestamp
// The last day an event is on. An event ending at midnight ends the day before.
export const lastDay = (start, end) => dayKey(Math.max(Date.parse(start), Date.parse(end) - 1));
// A real calendar date in YYYY-MM-DD form (rejects 2026-13-45 and 2026-02-30).
export const isDayKey = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && !Number.isNaN(Date.parse(s)) && new Date(Date.parse(s)).toISOString().startsWith(s);
export const weekday = (iso) => weekdayShort.format(new Date(iso));
export const month = (iso) => monthShort.format(new Date(iso));
export const day = (iso) => dayNum.format(new Date(iso));
export const fullDate = (iso) => longDate.format(new Date(iso));
// Day keys ("2026-10-22") are plain dates, so day math on them is UTC-safe.
export const addDays = (key, n) => new Date(Date.parse(key) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
export const dayName = (key) => fullDate(`${key}T17:00:00Z`); // "Thursday, October 22"
// "October" or "October 2026" for a month key ("2026-10") or a day key.
export const monthName = (key, withYear = false) => (withYear ? monthYear : monthLong).format(new Date(`${key.slice(0, 7)}-15T17:00:00Z`));
export const plural = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`;
// The line under "Recently"; app.js redoes it when a group filter narrows the list.
export const recentSummary = (events, rsvps) => `The last three months. ${plural(events, 'event')}, ${plural(rsvps, 'RSVP')}.`;
// "Tonight" for something starting at 4pm or later, "Today" for a noon talk.
export const todayWord = (iso) => (Number(hourFmt.format(new Date(iso))) >= 16 ? 'Tonight' : 'Today');

// The tag on an event row: "Happening now", "Today"/"Tonight", "Tomorrow" or
// nothing. The build prints it for the day it ran and the browser re-checks,
// so both must call this.
export function whenLabel(start, end, now = Date.now()) {
  const today = dayKey(now);
  if (dayKey(start) <= today && today <= lastDay(start, end)) return Date.parse(start) <= now ? 'Happening now' : todayWord(start);
  return daysBetween(today, dayKey(start)) === 1 ? 'Tomorrow' : '';
}

// The stamp on a headliner poster: "8 days out", "Tomorrow", "Today", "Happening now".
export function countdown(start, now = Date.now()) {
  if (Date.parse(start) <= now) return 'Happening now';
  const n = daysBetween(dayKey(now), dayKey(start));
  return n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${n} days out`;
}

// Flyer-style times: "5:30p", "12p".
export function shortTime(iso) {
  return timeFmt.format(new Date(iso)).replace(':00', '').replace(/\s?AM$/, 'a').replace(/\s?PM$/, 'p');
}

// "Oct 15–16", or "Oct 30–Nov 2" across a month. Ends on lastDay(), so an
// event ending at midnight doesn't gain a day.
export function dateRange(start, end) {
  const last = `${lastDay(start, end)}T17:00:00Z`;
  return `${month(start)} ${day(start)}–${month(last) === month(start) ? '' : `${month(last)} `}${day(last)}`;
}

// "5:30p–7p", "Thu–Fri Oct 15–16 · 8a–5p", "All day".
export function shortRange(e) {
  if (e.allDay) return e.multiDay ? `${dateRange(e.start, e.end)} · All day` : 'All day';
  const t = `${shortTime(e.start)}–${shortTime(e.end)}`;
  return e.multiDay ? `${weekday(e.start)}–${weekday(`${lastDay(e.start, e.end)}T17:00:00Z`)} ${dateRange(e.start, e.end)} · ${t}` : t;
}

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Meetup descriptions are loose Markdown. Handle the common bits safely:
// paragraphs, line breaks, **bold**, [links](url), bare URLs, and "## headings".
export function formatDescription(text = '') {
  return escapeHtml(text)
    .replace(/\\([*_#\[\]()-])/g, '$1')
    .split(/\n{2,}/)
    .map((para) => {
      let html = para
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener" target="_blank">$1<span class="sr-only"> (opens in new tab)</span></a>')
        .replace(/(^|[\s(])(https?:\/\/[^\s<)]+?)(?=[.,;:!?]*(?:[\s<)]|$))/g, '$1<a href="$2" rel="noopener" target="_blank">$2<span class="sr-only"> (opens in new tab)</span></a>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      const heading = /^#{1,6}\s+(.*)(?:\n([\s\S]*))?$/.exec(html);
      if (heading) return `<h4>${heading[1]}</h4>` + (heading[2] ? `<p>${heading[2].replace(/\n/g, '<br>')}</p>` : '');
      return `<p>${html.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
}
