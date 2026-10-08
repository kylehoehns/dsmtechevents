// Date and text formatting shared by the build and the browser.
// Everything displays in Des Moines time, wherever the viewer is.
import { site } from './site.mjs';
import { localToUtc } from './time.mjs';

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
const hhmm = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); // "08:00", for localToUtc

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
// "411 people went" matches the "18 went" on each row.
export const recentSummary = (events, went) => `The last three months. ${plural(events, 'event')}, ${went} ${went === 1 ? 'person' : 'people'} went.`;
// "Tonight" for something starting at 4pm or later, "Today" for a noon talk.
export const todayWord = (iso) => (Number(hourFmt.format(new Date(iso))) >= 16 ? 'Tonight' : 'Today');

// "In 25 min" in the hour before something starts, else ''. The minutes, not
// a vague "soon", so you can tell whether you'll make it.
export function startsIn(start, now = Date.now()) {
  const mins = Math.ceil((Date.parse(start) - now) / 60_000);
  return mins > 0 && mins <= 60 ? `In ${mins} min` : '';
}

// The tag on an event row: "Happening now", "In 25 min" (the last hour),
// "Today"/"Tonight", "Tomorrow" or nothing. The build prints it for the day it
// ran and the browser re-checks (once a minute while the page is open), so
// both must call this.
export function whenLabel(start, end, now = Date.now(), { multiDay = false, allDay = false } = {}) {
  const today = dayKey(now);
  const last = lastDay(start, end);
  if (dayKey(start) <= today && today <= last) {
    // A timed conference over several days runs its hours each day (8a-5p
    // twice), not straight through the night: overnight it's "Tomorrow", the
    // next morning "Today", and "Happening now" only during the hours.
    // Each day's hours are wall-clock times, so they hold across a DST switch
    // (adding 24h would shift them an hour). An end at midnight closes at the
    // midnight after each day.
    if (multiDay && !allDay && Date.parse(start) <= now) {
      const opens = Date.parse(localToUtc(today, hhmm.format(new Date(start))));
      const closes = Date.parse(localToUtc(addDays(today, daysBetween(last, dayKey(end))), hhmm.format(new Date(end))));
      if (now < opens) return startsIn(new Date(opens).toISOString(), now) || todayWord(new Date(opens).toISOString());
      if (now > closes) return today < last ? 'Tomorrow' : '';
    }
    return Date.parse(start) <= now ? 'Happening now' : startsIn(start, now) || todayWord(start);
  }
  return daysBetween(today, dayKey(start)) === 1 ? 'Tomorrow' : '';
}

// The stamp on a headliner poster: "8 days out", "Tomorrow", "Today",
// "In 25 min", "Happening now".
// Once it has started it follows whenLabel(), so a conference's poster says
// "Tomorrow" overnight between its days, like its row does.
export function countdown(start, end, now = Date.now(), opts = {}) {
  if (Date.parse(start) <= now) {
    const label = whenLabel(start, end, now, opts);
    if (label.startsWith('In ')) return label; // between a conference's days
    return { Tomorrow: 'Tomorrow', Today: 'Today', Tonight: 'Today' }[label] ?? 'Happening now';
  }
  const soon = startsIn(start, now);
  if (soon) return soon;
  const n = daysBetween(dayKey(now), dayKey(start));
  return n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${n} days out`;
}

// The stamp on the event-mode TV slide (/tv/?event=): "Starts in 25 min" in
// the last hour, "Tonight at 6p" / "Tomorrow at 6p" from whenLabel(), the
// date further out, "Happening now" while it's on, and '' once it's over.
export function liveLabel(e, now = Date.now()) {
  if (Date.parse(e.end) <= now) return '';
  const label = whenLabel(e.start, e.end, now, e);
  if (label === 'Happening now') return label;
  // The slide says it in full: "Starts in 25 min".
  if (label.startsWith('In ')) return `Starts in${label.slice(2)}`;
  const at = e.allDay ? '' : ` at ${shortTime(e.start)}`;
  // Further out, the slide's big date already says when: say it once.
  return label ? `${label}${at}` : '';
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

// "Thu–Fri Oct 15–16".
export const dayRange = (start, end) => `${weekday(start)}–${weekday(`${lastDay(start, end)}T17:00:00Z`)} ${dateRange(start, end)}`;

// "5:30p–7p", "All day", and for an event over several days
// "through Fri Oct 16 · 8a–5p". Cards and TV slides print the start date big
// beside this line, so it only adds the last day (say it once). Where nothing
// shows the start (the calendar's day panel hides it), { full: true } gives
// the whole range: "Thu–Fri Oct 15–16 · 8a–5p".
export function shortRange(e, { full = false } = {}) {
  const t = e.allDay ? 'All day' : `${shortTime(e.start)}–${shortTime(e.end)}`;
  if (!e.multiDay) return t;
  const last = `${lastDay(e.start, e.end)}T17:00:00Z`;
  if (!full) return `through ${weekday(last)} ${month(last)} ${day(last)} · ${t}`;
  return `${e.allDay ? dateRange(e.start, e.end) : dayRange(e.start, e.end)} · ${t}`;
}

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Meetup descriptions are loose Markdown. Handle the common bits safely:
// paragraphs, line breaks, **bold**, [links](url), bare URLs, "## headings",
// and *** / --- rule lines (dropped; they only separate paragraphs).
export function formatDescription(text = '') {
  return escapeHtml(text)
    .replace(/\\([*_#\[\]()-])/g, '$1')
    .replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, '') // a *** / --- / ___ rule line: a paragraph break
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
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

// The talk lineup in a description, when it has one: SecDSM lists its talks
// as bold "7:00 PM · Title" lines followed by "— Speaker".
// [{ time: '7p', title, speaker }], or [] when there's no lineup.
const TALK = /^\*\*\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\s*[·•|–—-]\s*(.+?)\s*\*\*\s*(?:[—–-]\s*(.+?))?\s*$/gim;
export function lineup(text = '') {
  return [...String(text ?? '').replace(/\\([*_#\[\]()-])/g, '$1').matchAll(TALK)].map(([, h, m, ap, title, speaker]) => ({
    time: `${Number(h)}${m && m !== '00' ? `:${m}` : ''}${ap.toLowerCase()}`,
    title,
    speaker: speaker ?? '',
  }));
}
