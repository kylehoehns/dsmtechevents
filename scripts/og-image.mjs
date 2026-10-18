// Draws public/og-image-dark.png, the picture Slack, iMessage and LinkedIn show
// when someone shares the site. It's a fixed poster built from the site's own
// pieces (a taped-up pink headliner over a blue one, the masthead's double
// rules, sticker labels), big enough to read at phone size. It doesn't change,
// so it's drawn once and committed. Run `npm run og`
// after changing the design below, and commit the new PNG.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const W = 1200;
const H = 630;
// The site's dark-mode colors (global.css): most chat apps are dark, and the
// pink poster stands out on it. `shadow` is the pink offset print under the
// poster's dark letters, a shade darker than the poster so it reads as ink.
const C = {
  paper: '#1d1c22',
  ink: '#ece6da',
  rule: '#5d5966',
  pink: '#e0609f',
  onPink: '#1d1b2b',
  shadow: '#a83d74',
  blue: '#2f6db5',
  onBlue: '#ece6da',
  tape: 'rgba(236, 230, 218, 0.55)',
};
// Chat apps cache preview images by URL, so a redesign gets a new file name.
const OUT = 'public/og-image-dark.png';

const h = (type, style, ...children) => ({ type, props: { style: { display: 'flex', ...style }, children: children.flat() } });
const display = (size, text, style = {}) =>
  h('div', { fontFamily: 'Display', fontWeight: 900, fontSize: size, lineHeight: 0.86, textTransform: 'uppercase', whiteSpace: 'nowrap', ...style }, text);
const halftone = (color, opacity) =>
  h('div', {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    opacity,
    backgroundImage: `radial-gradient(circle closest-side, ${color} 40%, transparent 52%)`,
    backgroundSize: '10px 10px',
  });
// The masthead's double rule, full width; the posters are taped over it.
const rule = (top) =>
  h(
    'div',
    { position: 'absolute', left: 0, right: 0, top, flexDirection: 'column', gap: 5 },
    h('div', { height: 3, background: C.rule }),
    h('div', { height: 3, background: C.rule }),
  );

// Slack's and WhatsApp's small link cards show only the middle 630×630 square,
// shrunk to about 100px. The poster fills that square and carries only the
// name, so it reads on its own; everything else sits outside it.
const PW = 500,
  PH = 508,
  PT = 30;
const PL = (W - PW) / 2;
const word = (text) =>
  h(
    'div',
    { position: 'relative' },
    display(166, text, { position: 'absolute', left: 6, top: 5, color: C.shadow }),
    display(166, text, { position: 'relative', color: C.onPink }),
  );
const behind = h(
  'div',
  {
    position: 'absolute',
    left: PL + 16,
    top: PT + 10,
    width: PW,
    height: PH,
    background: C.blue,
    transform: 'rotate(3deg)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
  halftone(C.onBlue, 0.18),
);
const poster = h(
  'div',
  {
    position: 'absolute',
    left: PL - 6,
    top: PT,
    width: PW,
    height: PH,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: C.pink,
    transform: 'rotate(-2deg)',
    boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
  },
  halftone(C.onPink, 0.14),
  h('div', { position: 'absolute', top: -18, left: PW / 2 - 70, width: 140, height: 38, background: C.tape, transform: 'rotate(3deg)' }),
  h('div', { flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 8 }, word('DSM'), word('Tech'), word('Events')),
);

// The stickers either side only show in the large previews. Each column hugs
// the poster but stops short of the middle square (x 285–915), so no sliver of
// a sticker shows in the small cards.
const sticker = (text, bg, fg, tilt) =>
  display(42, text, {
    background: bg,
    color: fg,
    lineHeight: 1,
    padding: '8px 11px 4px',
    transform: `rotate(${tilt}deg)`,
    boxShadow: '0 4px 10px rgba(0,0,0,0.35)',
  });
const side = (edge, stickers) =>
  h(
    'div',
    {
      position: 'absolute',
      top: 60,
      bottom: 90,
      [edge]: 0,
      width: 274,
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 28,
      alignItems: edge === 'left' ? 'flex-end' : 'flex-start',
    },
    stickers,
  );

const card = h(
  'div',
  { position: 'relative', width: W, height: H, background: C.paper },
  rule(44),
  rule(536),
  side('left', [sticker('Meetups', C.pink, C.onPink, -1.5), sticker('User groups', C.blue, C.onBlue, 1), sticker('Conferences', C.pink, C.onPink, -1)]),
  side('right', [sticker('Des Moines, IA', C.blue, C.onBlue, 1.5), sticker('Updated daily', C.pink, C.onPink, -1)]),
  behind,
  poster,
);

const require = createRequire(import.meta.url);
const font = (pkg, weight) => fs.readFileSync(require.resolve(`@fontsource/${pkg}/files/${pkg}-latin-${weight}-normal.woff`));
const svg = await satori(card, {
  width: W,
  height: H,
  fonts: [{ name: 'Display', data: font('big-shoulders-display', 900), weight: 900 }],
});
// Rendered at 2× (2400×1260): Slack, iMessage and LinkedIn show previews on
// high-resolution screens, where a 1200px image is stretched and looks soft.
fs.writeFileSync(OUT, new Resvg(svg, { fitTo: { mode: 'width', value: W * 2 } }).render().asPng());
console.log(`wrote ${OUT}`);
