// Draws public/og-image-dark.png, the picture Slack, iMessage and LinkedIn show
// when someone shares the site. It's a fixed poster built from the site's own
// pieces (blue logo with the pink offset, a taped pink poster),
// big enough to read at phone size. It doesn't change, so it's drawn once and
// committed. Run `npm run og`
// after changing the design below, and commit the new PNG.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const W = 1200;
const H = 630;
// Colors from global.css. The dark one is used: most chat apps are dark, and
// the pink poster stands out more on it. `npm run og -- light` draws the other.
const THEMES = {
  light: { paper: '#f3ede1', ink: '#1d1b2b', rule: '#1d1b2b', onPink: '#1d1b2b', pink: '#ff4fa3', mis: '#ff4fa3', blue: '#0a6cc0', blend: 'multiply', tape: 'rgba(243, 237, 225, 0.8)' },
  dark: { paper: '#1d1c22', ink: '#ece6da', rule: '#5d5966', onPink: '#1d1b2b', pink: '#e0609f', mis: '#c04f87', blue: '#93c2ff', blend: 'normal', tape: 'rgba(236, 230, 218, 0.55)' },
};
const theme = process.argv[2] ?? 'dark';
const C = THEMES[theme];
// Chat apps cache preview images by URL, so a redesign gets a new file name.
const OUT = process.argv[3] ?? 'public/og-image-dark.png';

const h = (type, style, ...children) => ({ type, props: { style: { display: 'flex', ...style }, children: children.flat() } });
// The site's misregistration: a pink copy printed a few pixels off, multiplied
// into the blue the way it is on the page's logo.
const mis = (text, style) => h('div', { position: 'relative', ...style },
  h('div', { position: 'absolute', left: 7, top: 6, color: C.mis }, text),
  h('div', { position: 'relative', color: C.blue, mixBlendMode: C.blend }, text),
);
const mono = (size, weight, text, style = {}) => h('div', { fontFamily: 'Mono', fontWeight: weight, fontSize: size, ...style }, text);
const logo = { fontFamily: 'Display', fontWeight: 900, fontSize: 172, lineHeight: 0.8, textTransform: 'uppercase' };
const bill = { fontFamily: 'Display', fontWeight: 900, fontSize: 54, lineHeight: 0.86, textTransform: 'uppercase' };

// A taped-up pink poster, like the headliner on the events page.
const poster = h('div', { position: 'relative', flexDirection: 'column', width: 360, padding: '20px 24px 24px', background: C.pink, color: C.onPink, transform: 'rotate(2.5deg)' },
  h('div', { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, opacity: 0.16, backgroundImage: `radial-gradient(circle, ${C.onPink} 2px, transparent 2.6px)`, backgroundSize: '9px 9px' }),
  h('div', { position: 'absolute', top: -16, left: 130, width: 100, height: 32, background: C.tape, transform: 'rotate(-4deg)' }),
  h('div', { justifyContent: 'space-between', paddingBottom: 10, borderBottom: `3px solid ${C.onPink}` },
    mono(19, 700, 'Now showing'), mono(19, 700, 'Des Moines'),
  ),
  h('div', { flexDirection: 'column', marginTop: 16, gap: 6 },
    h('div', bill, 'Meetups'),
    h('div', bill, 'User groups'),
    h('div', bill, 'Conferences'),
  ),
  h('div', { marginTop: 18, alignSelf: 'flex-start', background: C.onPink, color: C.pink, fontFamily: 'Display', fontWeight: 900, fontSize: 30, textTransform: 'uppercase', padding: '6px 12px 3px' }, 'All in one place'),
);

const card = h('div', { width: W, height: H, flexDirection: 'column', background: C.paper, color: C.ink, padding: '34px 56px 0' },
  // masthead strip
  h('div', { justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 10, borderBottom: `3px solid ${C.rule}` },
    h('div', { gap: 0 }, mono(26, 700, 'Des Moines, IA'), mono(26, 400, '\u00a0· 515')),
    mono(26, 700, 'dsmtechevents.com', { color: C.blue }),
  ),
  h('div', { flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingRight: 14 },
    h('div', { flexDirection: 'column', position: 'relative' },
      mis('DSM Tech', logo),
      mis('Events', { ...logo, marginTop: 14 }),
    ),
    poster,
  ),
  // the double rule under the site's masthead
  h('div', { flexDirection: 'column', gap: 4, marginBottom: 34 },
    h('div', { height: 3, background: C.rule }),
    h('div', { height: 3, background: C.rule }),
  ),
);

const require = createRequire(import.meta.url);
const font = (pkg, weight) => fs.readFileSync(require.resolve(`@fontsource/${pkg}/files/${pkg}-latin-${weight}-normal.woff`));
const svg = await satori(card, {
  width: W,
  height: H,
  fonts: [
    { name: 'Display', data: font('big-shoulders-display', 900), weight: 900 },
    { name: 'Mono', data: font('ibm-plex-mono', 400), weight: 400 },
    { name: 'Mono', data: font('ibm-plex-mono', 700), weight: 700 },
  ],
});
fs.writeFileSync(OUT, new Resvg(svg).render().asPng());
console.log(`wrote ${OUT}`);
