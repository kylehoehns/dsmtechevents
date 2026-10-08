// Event mode for /tv/ (/tv/?event=<id>&slides=...): which slides to show, in
// what order, and the host's own text. Shared by the TV page, which reads the
// URL, and the builder on /organizers/, which writes it, so both agree on the
// slide names and the length caps.
//
// Host text is plain text from a URL anyone can type, so it is cleaned here
// and the TV puts it on screen with textContent only: no HTML, no links.
//
// The host's text (welcome, agenda, Wi-Fi name and password, note) goes in
// the URL fragment, the part after #, which browsers never send to a server:
// it stays out of request logs and referrers. That is the preferred form:
//   /tv/?event=<id>&slides=event,welcome,wifi,next-all#welcome=Hi&wifi=Guest&wifipass=…
// event, slides, group and fx stay in the query; they aren't sensitive.
// Links made before the fragment form put the text in the query; the TV
// still reads it from there when the fragment doesn't have a field.

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

// What the TV shows: { order, text, group }, from the query and the
// fragment (location.hash without the #). `slides` lists the slides in
// order; without it, the event, then each host slide that has text, then Up
// next. Unknown names are ignored, a host slide with no text is dropped, and
// the event slide is always there.
const asParams = (p) => (p instanceof URLSearchParams ? p : new URLSearchParams(p ?? ''));
export function readTvParams(query, fragment = '') {
  const q = asParams(query);
  const f = asParams(fragment);
  // Host text: the fragment first, then the query (older links).
  const get = (k) => (f.has(k) ? f.get(k) : q.get(k));
  const text = {
    welcome: clean(get('welcome'), CAPS.welcome),
    agenda: (get('agenda') ?? '').split(/[|\n]/).map((s) => clean(s, CAPS.agendaItem)).filter(Boolean).slice(0, CAPS.agendaItems),
    wifi: clean(get('wifi'), CAPS.wifi),
    wifipass: clean(get('wifipass'), CAPS.wifipass),
    note: clean(get('note'), CAPS.note, { lines: true }),
  };
  const has = { welcome: !!text.welcome, agenda: text.agenda.length > 0, wifi: !!text.wifi, note: !!text.note };
  const asked = q.has('slides') ? q.get('slides').split(',').map((s) => s.trim().toLowerCase()) : DEFAULT_ORDER;
  const order = [...new Set(asked)].filter((s) => SLIDE_TYPES.includes(s) && (!TEXT_SLIDES.includes(s) || has[s]));
  if (!order.includes('event')) order.unshift('event');
  return { order, text, group: q.get('group') ?? '' };
}

// The link the /organizers/ builder hands out: event, slides, group and fx
// in the query (`slides` stays readable, the names are plain words), the
// host's text percent-encoded in the fragment.
export function tvUrl(origin, { event, order, fields = {}, group = '', plain = false }) {
  const query = [`event=${encodeURIComponent(event)}`, `slides=${order.join(',')}`];
  if (group) query.push(`group=${encodeURIComponent(group)}`);
  if (plain) query.push('fx=off');
  const hash = TEXT_PARAMS.filter((k) => fields[k]).map((k) => `${k}=${encodeURIComponent(fields[k])}`);
  return `${new URL('/tv/', origin).href}?${query.join('&')}${hash.length ? `#${hash.join('&')}` : ''}`;
}

// A Wi-Fi join code (what phone cameras read as "Join network"). \ ; , : "
// are escaped in the name and password, as the format asks.
export function wifiCode(ssid, password = '') {
  const esc = (s) => s.replace(/([\\;,:"])/g, '\\$1');
  return password ? `WIFI:T:WPA;S:${esc(ssid)};P:${esc(password)};;` : `WIFI:T:nopass;S:${esc(ssid)};;`;
}
