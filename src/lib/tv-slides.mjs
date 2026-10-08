// Event mode for /tv/ (/tv/?event=<id>&slides=...): which slides to show, in
// what order, and the host's own text. Shared by the TV page, which reads the
// URL, and the builder on /organizers/, which writes it, so both agree on the
// slide names and the length caps.
//
// Host text is plain text from a URL anyone can type, so it is cleaned here
// and the TV puts it on screen with textContent only: no HTML, no links.

export const SLIDE_TYPES = ['event', 'welcome', 'agenda', 'wifi', 'note', 'next-all', 'next-group'];
export const TEXT_SLIDES = ['welcome', 'agenda', 'wifi', 'note'];
export const DEFAULT_ORDER = ['event', ...TEXT_SLIDES, 'next-all'];
export const TEXT_PARAMS = ['welcome', 'agenda', 'wifi', 'wifipass', 'note'];
export const CAPS = { welcome: 140, note: 280, agendaItems: 8, agendaItem: 80, wifi: 64, wifipass: 64 };

// Plain text, at most `max` characters (an ellipsis marks a cut). Control
// characters and bidi overrides go; tabs and, unless `lines`, line breaks
// become spaces.
export function clean(value, max, { lines = false } = {}) {
  const text = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\n]/g, (c) => (c === '\n' && lines ? '\n' : ' '))
    .replace(/[\p{Cc}‪-‮⁦-⁩]/gu, (c) => (c === '\n' ? c : ''))
    .split('\n').map((l) => l.replace(/ {2,}/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : text;
}

// What the TV shows: { order, text, group }. `slides` lists the slides in
// order; without it, the event, then each host slide that has text, then Up
// next. Unknown names are ignored, a host slide with no text is dropped, and
// the event slide is always there.
export function readTvParams(params) {
  const p = params instanceof URLSearchParams ? params : new URLSearchParams(params);
  const text = {
    welcome: clean(p.get('welcome'), CAPS.welcome),
    agenda: (p.get('agenda') ?? '').split(/[|\n]/).map((s) => clean(s, CAPS.agendaItem)).filter(Boolean).slice(0, CAPS.agendaItems),
    wifi: clean(p.get('wifi'), CAPS.wifi),
    wifipass: clean(p.get('wifipass'), CAPS.wifipass),
    note: clean(p.get('note'), CAPS.note, { lines: true }),
  };
  const has = { welcome: !!text.welcome, agenda: text.agenda.length > 0, wifi: !!text.wifi, note: !!text.note };
  const asked = p.has('slides') ? p.get('slides').split(',').map((s) => s.trim().toLowerCase()) : DEFAULT_ORDER;
  const order = [...new Set(asked)].filter((s) => SLIDE_TYPES.includes(s) && (!TEXT_SLIDES.includes(s) || has[s]));
  if (!order.includes('event')) order.unshift('event');
  return { order, text, group: p.get('group') ?? '' };
}

// The link the /organizers/ builder hands out. `slides` stays readable
// (the names are plain words); the host's text is percent-encoded.
export function tvUrl(origin, { event, order, fields = {}, group = '' }) {
  const parts = [`event=${encodeURIComponent(event)}`, `slides=${order.join(',')}`];
  for (const k of TEXT_PARAMS) if (fields[k]) parts.push(`${k}=${encodeURIComponent(fields[k])}`);
  if (group) parts.push(`group=${encodeURIComponent(group)}`);
  return `${new URL('/tv/', origin).href}?${parts.join('&')}`;
}

// A Wi-Fi join code (what phone cameras read as "Join network"). \ ; , : "
// are escaped in the name and password, as the format asks.
export function wifiCode(ssid, password = '') {
  const esc = (s) => s.replace(/([\\;,:"])/g, '\\$1');
  return password ? `WIFI:T:WPA;S:${esc(ssid)};P:${esc(password)};;` : `WIFI:T:nopass;S:${esc(ssid)};;`;
}
