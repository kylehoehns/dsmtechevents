// Event mode for the lobby TV: /tv/?event=<id>, for a host putting ONE event
// on the screen at their venue. tv.astro calls eventMode() before the
// slideshow starts; it swaps the regular slides for this event's three (the
// event, the group's next meetup, what's next from every group), and
// update() keeps them current as the clock moves: a countdown, "Happening
// now", then a closing slide once the event is over. Everything on screen
// comes from the fetched event data; the URL carries only the event id.
//
// This is not a "per-event page" in the product-rule sense (AGENTS.md): it
// is a screen in a room, built from data the site already has, and every
// slide points out, to the group's own page (QR to RSVP) or to the site. It
// takes no sign-ups, stores nothing, and the page stays noindex.
import { weekday, day, month, shortRange, liveLabel } from '../lib/format.mjs';

export type TvEvent = {
  id: string; title: string; start: string; end: string; allDay: boolean; multiDay: boolean; repeat: boolean;
  hosts: string; groups: string[]; where: string; url: string | null; photo: string | null;
  talks: { time: string; title: string; speaker: string }[];
};
export type TvData = { site: string; events: TvEvent[]; groups: Record<string, string> };

const EVENT_DWELL = 24_000; // the event slide stays up twice as long as the rest
const CLOSING_MS = 3 * 3_600_000; // the closing slide shows this long after the end; later, the id counts as gone
const UP_NEXT = 5;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}
// The pink plate behind display type reads its text from data-t (CSS attr()).
const misprint = <T extends HTMLElement>(node: T, text: string) => { node.textContent = text; node.dataset.t = text; node.classList.add('misprint'); return node; };
// Rows and lines come in one after another under the screen-print effect (tv-fx.css).
const stagger = (parent: Element) => [...parent.children].forEach((c, i) => (c as HTMLElement).style.setProperty('--i', String(i)));

// QR codes are drawn in the browser here (the regular TV draws its own at
// build time), so the qrcode library only loads in event mode.
let qrLib: Promise<any> | null = null;
function qr(text: string, label: string, cls = '') {
  const box = el('div', `qr ${cls}`.trim());
  const code = el('div', 'qr-code');
  box.append(code, el('span', '', label));
  (qrLib ??= import('qrcode').then((m) => m.default ?? m))
    .then((lib) => lib.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1d1b2b', light: '#0000' } }))
    // The SVG is the library's own drawing of the code: paths only, no text from the URL.
    .then((svg: string) => { code.innerHTML = svg; })
    .catch(() => box.remove());
  return box;
}
const rsvpLabel = (e: TvEvent) => (e.url?.includes('meetup.com') ? 'Scan to RSVP' : 'Scan for details');

function dateBlock(e: TvEvent) {
  const b = el('div', 'date-block');
  b.append(el('span', 'dow', weekday(e.start)), misprint(el('span', 'num'), day(e.start)), el('span', 'mon', month(e.start)));
  return b;
}

function kicker(text: string) {
  return el('p', 'ev-kicker', text);
}

// The event itself: date, hosts, title, time and place, the talk lineup when
// the description has one, photo, and a QR to its own page.
function eventPoster(e: TvEvent) {
  const stamp = el('span', 'ev-stamp');
  const date = dateBlock(e);
  date.append(stamp);
  const info = el('div', 'info');
  info.append(el('p', 'hosts', e.hosts), el('h2', '', e.title), el('p', 'time', shortRange(e)), el('p', 'where', e.where));
  if (e.talks.length) {
    const list = el('ol', 'ev-lineup');
    for (const t of e.talks) {
      const li = el('li');
      // Say it once: a one-talk night is usually titled after the talk.
      const title = t.title.toLowerCase() === e.title.toLowerCase() ? '' : t.title;
      li.append(el('span', 'lt-time', t.time), el('span', 'lt-title', [title, t.speaker].filter(Boolean).join(' — ')));
      list.append(li);
    }
    stagger(list);
    info.append(list);
    info.classList.add('has-lineup');
  }
  stagger(info);
  const side = el('div', 'tv-side');
  if (e.photo) {
    const img = el('img', 'tv-photo');
    img.src = e.photo;
    img.alt = '';
    side.append(img);
  }
  if (e.url) side.append(qr(e.url, rsvpLabel(e)));
  return { nodes: [date, info, side], stamp };
}

function closing(e: TvEvent, site: string) {
  const text = el('div', 'ev-closing-text');
  text.append(misprint(el('h2', 'ev-huge'), 'Thanks for coming'), el('p', 'hosts', e.hosts), el('p', 'where', e.title));
  stagger(text);
  return [text, qr(site, `See what's next at ${new URL(site).host}`, 'qr-big')];
}

const upcoming = (data: TvData, now: number) => data.events.filter((x) => Date.parse(x.end) > now);

// "Up next in DSM tech": the next few events from any group after this one,
// by date only (never curated).
function nextAll(e: TvEvent, data: TvData, now: number) {
  const rows = upcoming(data, now).filter((x) => x.id !== e.id && !x.repeat && x.start >= e.start).slice(0, UP_NEXT);
  const head = el('div', 'ev-head');
  head.append(misprint(el('h2', 'ev-title'), 'Up next in DSM tech'), qr(data.site, 'Every event', 'site-qr'));
  const list = el('ol', 'ev-next');
  for (const x of rows) {
    const li = el('li');
    li.append(el('span', 'row-date', `${weekday(x.start)} ${month(x.start)} ${day(x.start)}`), el('span', 'row-group', x.hosts), el('span', 'row-title', x.title));
    list.append(li);
  }
  stagger(list);
  const nodes: HTMLElement[] = [head, list];
  if (!rows.length) nodes.push(el('p', 'tv-empty', 'Nothing else on the calendar yet. New events show up as groups post them.'));
  return { key: rows.map((x) => x.id).join(), nodes };
}

// "Next CIJUG meetup": the host group's own next event, as a poster. A
// joint event uses its first host group.
function nextGroup(e: TvEvent, data: TvData, group: string, now: number) {
  const next = upcoming(data, now).find((x) => x.id !== e.id && x.groups.includes(group) && x.start > e.start);
  const head = el('div', 'ev-head');
  head.append(kicker(`Next ${data.groups[group]} meetup`));
  if (!next) {
    const text = el('div', 'ev-closing-text');
    text.append(misprint(el('h2', 'ev-huge'), 'Watch for the next one'), el('p', 'where', `at ${new URL(data.site).host}`));
    stagger(text);
    head.append(text);
    return { key: '', nodes: [head, qr(data.site, 'Every event', 'qr-big')] };
  }
  const info = el('div', 'info');
  info.append(el('h2', '', next.title), el('p', 'time', shortRange(next)), el('p', 'where', next.where));
  stagger(info);
  const row = el('div', 'ev-poster');
  row.append(dateBlock(next), info);
  if (next.url) row.append(qr(next.url, rsvpLabel(next)));
  head.append(row);
  return { key: next.id, nodes: [head] };
}

// The fallback for an id that isn't on the calendar (mistyped, or the event
// is long over): say so, and let the regular rotation carry on after it.
function goneSlide(site: string) {
  const s = el('section', 'slide ev-slide ev-gone');
  const text = el('div', 'ev-closing-text');
  text.append(el('h2', 'ev-title', "This event isn't on the calendar anymore"), el('p', 'where', "Here's what's coming up in Des Moines tech."));
  stagger(text);
  s.append(text, qr(site, 'Every event', 'qr-big'));
  return s;
}

export function eventMode(stage: HTMLElement, data: TvData, id: string, now = Date.now()) {
  const e = data.events.find((x) => x.id === id);
  if (!e || Date.parse(e.end) + CLOSING_MS <= now) {
    stage.prepend(goneSlide(data.site));
    return null;
  }
  const group = e.groups[0];
  const updates: ((now: number) => void)[] = [];
  stage.replaceChildren();
  for (const kind of ['event', 'next-group', 'next-all']) {
    if (kind === 'next-group' && !group) continue; // a conference with no group has no "next meetup"
    const s = el('section', `slide ev-slide ev-${kind}`);
    if (kind === 'event') {
      s.dataset.dwell = String(EVENT_DWELL);
      let over: boolean | null = null;
      let stamp: HTMLElement | null = null;
      updates.push((t) => {
        const ended = Date.parse(e.end) <= t;
        if (ended !== over) {
          over = ended;
          s.classList.toggle('ev-closing', ended);
          if (ended) { s.replaceChildren(...closing(e, data.site)); stamp = null; } else {
            const poster = eventPoster(e);
            s.replaceChildren(...poster.nodes);
            stamp = poster.stamp;
          }
        }
        if (stamp) {
          stamp.textContent = liveLabel(e, t);
          stamp.hidden = !stamp.textContent;
          stamp.classList.toggle('live', stamp.textContent === 'Happening now');
        }
      });
    } else {
      let key: string | null = null;
      updates.push((t) => {
        const out = kind === 'next-all' ? nextAll(e, data, t) : nextGroup(e, data, group, t);
        if (out.key !== key) { key = out.key; s.replaceChildren(...out.nodes); }
      });
    }
    stage.append(s);
  }
  const update = (t: number) => updates.forEach((f) => f(t));
  update(now);
  return { update };
}
