// Draws public/og-image.png, the picture Slack, iMessage and LinkedIn show
// when someone shares the site. It's a fixed poster (name in huge type, so it
// reads at phone size), so it's drawn once and committed. Run `npm run og`
// after changing the design below, and commit the new PNG.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const W = 1200;
const H = 630;
// Light-theme colors from global.css.
const C = { paper: '#f3ede1', ink: '#1d1b2b', pink: '#ff4fa3', blue: '#0a6cc0' };

const h = (type, style, ...children) => ({ type, props: { style: { display: 'flex', ...style }, children: children.flat() } });
// Display type with the site's pink misregistration copy behind it.
const mis = (text, style) => h('div', { position: 'relative', ...style },
  h('div', { position: 'absolute', left: 8, top: 6, color: C.pink }, text),
  h('div', { position: 'relative', color: C.ink }, text),
);
const mono = (size, color, text) => h('div', { fontFamily: 'Mono', fontWeight: 700, fontSize: size, letterSpacing: 2, color }, text);
const display = { fontFamily: 'Display', fontWeight: 900, fontSize: 220, lineHeight: 0.84, textTransform: 'uppercase' };

const poster = h('div', { width: W, height: H, flexDirection: 'column', justifyContent: 'space-between', background: C.paper, padding: '44px 64px 40px' },
  h('div', { justifyContent: 'space-between' }, mono(30, C.blue, 'DES MOINES, IA'), mono(30, C.ink, '515')),
  h('div', { flexDirection: 'column' }, mis('DSM Tech', display), mis('Events', display)),
  h('div', { flexDirection: 'column', gap: 18 },
    h('div', { height: 4, background: C.ink }),
    h('div', { justifyContent: 'space-between', alignItems: 'center' },
      mono(34, C.ink, 'MEETUPS · USER GROUPS · CONFERENCES'),
    ),
  ),
);

const require = createRequire(import.meta.url);
const font = (pkg, weight) => fs.readFileSync(require.resolve(`@fontsource/${pkg}/files/${pkg}-latin-${weight}-normal.woff`));
const svg = await satori(poster, {
  width: W,
  height: H,
  fonts: [
    { name: 'Display', data: font('big-shoulders-display', 900), weight: 900 },
    { name: 'Mono', data: font('ibm-plex-mono', 700), weight: 700 },
  ],
});
fs.writeFileSync('public/og-image.png', new Resvg(svg).render().asPng());
console.log('wrote public/og-image.png');
