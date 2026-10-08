// The link-preview image: a gig poster of what's coming up, drawn at build
// time. Slack, LinkedIn and iMessage show it when someone shares the site.
// The layout imports the file name; scripts/og-image.mjs draws the PNG after
// `astro build`, outside Vite, which can't bundle the renderer.
//
// Those apps cache a preview image by its URL, sometimes for days. The file
// name carries a hash of the lineup, so a new lineup gets a new URL and new
// shares pick it up, while an unchanged lineup keeps its URL.
import crypto from 'node:crypto';
import { loadData } from './data.mjs';
import { weekday, day, month, shortTime } from './format.mjs';
import { site } from './site.mjs';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
const SHOWN = 4;

// Light-theme colors from global.css.
const C = { paper: '#f3ede1', ink: '#1d1b2b', soft: '#4a4657', pink: '#ff4fa3', pinkT: '#c41a6f', blue: '#0a6cc0', onBlue: '#f3ede1' };

// The date is already in the box, so this is just the days and times.
const when = (e) => [
  e.multiDay && `${weekday(e.start)}–${weekday(e.end)}`,
  e.allDay ? 'All day' : `${shortTime(e.start)}–${shortTime(e.end)}`,
].filter(Boolean).join(' · ');

let cached;
export function ogImage() {
  if (cached) return cached;
  const { upcoming, groups, byId } = loadData();
  const lineup = upcoming.filter((e) => !e.repeat).slice(0, SHOWN).map((e) => ({
    dow: weekday(e.start).toUpperCase(),
    day: day(e.start),
    mon: month(e.start).toUpperCase(),
    hosts: e.groupIds.map((id) => byId[id]?.short).filter(Boolean).join(' w/ ') || (e.featured ? 'Conference' : 'Community event'),
    title: e.title,
    when: `${when(e)} · ${e.online ? 'Online' : `@ ${e.venue ?? 'Venue TBA'}`}`,
    featured: !!e.featured,
  }));
  const more = upcoming.filter((e) => !e.repeat).length - lineup.length;
  const card = { lineup, more, groupCount: groups.length };
  const hash = crypto.createHash('sha1').update(JSON.stringify(card)).digest('hex').slice(0, 10);
  cached = { ...card, file: `coming-up-${hash}.png`, path: `/og/coming-up-${hash}.png` };
  return cached;
}

// Tiny element helper so the layout below reads like markup.
const h = (type, style, ...children) => ({ type, props: { style: { display: 'flex', ...style }, children: children.flat() } });
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export function poster({ lineup, more, groupCount }) {
  const title = h('div', { position: 'relative', fontFamily: 'Display', fontWeight: 900, fontSize: 88, lineHeight: 0.9, letterSpacing: -1, textTransform: 'uppercase' },
    h('div', { position: 'absolute', left: 5, top: 4, color: C.pink }, site.name),
    h('div', { position: 'relative', color: C.ink }, site.name),
  );
  const mono = (size, weight, color, text) => h('div', { fontFamily: 'Mono', fontWeight: weight, fontSize: size, color, letterSpacing: 1 }, text);

  const rows = lineup.map((e, i) =>
    h('div', { alignItems: 'center', gap: 24, paddingTop: 7, paddingBottom: 7, borderTop: i ? `2px solid ${C.ink}` : 'none' },
      h('div', { flexDirection: 'column', alignItems: 'center', width: 76, paddingTop: 4, paddingBottom: 4, background: e.featured ? C.pink : C.blue, color: e.featured ? C.ink : C.onBlue },
        mono(14, 600, 'inherit', e.dow),
        h('div', { fontFamily: 'Display', fontWeight: 900, fontSize: 42, lineHeight: 1 }, e.day),
        mono(14, 600, 'inherit', e.mon),
      ),
      h('div', { flexDirection: 'column', flex: 1, minWidth: 0, gap: 4 },
        h('div', { gap: 14 },
          mono(18, 700, C.pinkT, clip(e.hosts, 40).toUpperCase()),
          mono(18, 400, C.soft, clip(e.when, 70)),
        ),
        h('div', { fontFamily: 'Display', fontWeight: 800, fontSize: 38, lineHeight: 1, color: C.ink, textTransform: 'uppercase' }, clip(e.title, 54)),
      ),
    ));

  return h('div', { width: OG_WIDTH, height: OG_HEIGHT, flexDirection: 'column', background: C.paper, color: C.ink, padding: '36px 60px 28px' },
    h('div', { justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 14, borderBottom: `3px solid ${C.ink}` },
      title,
      h('div', { flexDirection: 'column', alignItems: 'flex-end', paddingBottom: 4, gap: 4 },
        mono(18, 700, C.blue, 'COMING UP IN'),
        mono(20, 600, C.ink, 'DES MOINES, IA · 515'),
      ),
    ),
    // The site's double rule under the masthead.
    h('div', { height: 3, marginTop: 3, marginBottom: 2, background: C.ink }),
    h('div', { flexDirection: 'column', flex: 1, overflow: 'hidden' }, ...rows),
    h('div', { justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: `3px solid ${C.ink}` },
      mono(20, 600, C.ink, more > 0 ? `+ ${more} more · ${groupCount} groups` : `${groupCount} groups`),
      mono(22, 700, C.blue, new URL(site.url).host),
    ),
  );
}
