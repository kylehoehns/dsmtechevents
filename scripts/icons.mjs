// Draws the app and browser icons into public/icons/: a blue tile with "DSM"
// in cream and the site's pink offset, like the masthead logo. The browser tab
// is too small for three letters, so the favicon is the same tile with a "D".
// It also draws the organizer badge (public/badge.svg and badge.png), a small
// "Find more Des Moines tech events" banner groups can put on their own site.
// Run `npm run icons` after changing the design, and commit the files.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const BLUE = '#0a6cc0', PAPER = '#f3ede1', PINK = '#ff4fa3', INK = '#1d1b2b';
const require = createRequire(import.meta.url);
const fonts = [
  { name: 'Display', weight: 900, data: fs.readFileSync(require.resolve('@fontsource/big-shoulders-display/files/big-shoulders-display-latin-900-normal.woff')) },
  { name: 'Mono', weight: 700, data: fs.readFileSync(require.resolve('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff')) },
];

// `scale` is the letter height as a share of the tile. Maskable icons get
// cropped to a circle by Android, so their text stays inside the middle 80%.
const tile = (text, s, scale, radius = 0) => ({
  type: 'div',
  props: {
    style: { display: 'flex', width: s, height: s, alignItems: 'center', justifyContent: 'center', background: BLUE, borderRadius: radius },
    children: [{
      type: 'div',
      props: {
        style: { display: 'flex', position: 'relative', fontFamily: 'Display', fontWeight: 900, fontSize: s * scale, lineHeight: 0.8, letterSpacing: -s * scale * 0.01 },
        children: [
          { type: 'div', props: { style: { position: 'absolute', left: s * scale * 0.07, top: s * scale * 0.055, color: PINK }, children: text } },
          { type: 'div', props: { style: { position: 'relative', color: PAPER }, children: text } },
        ],
      },
    }],
  },
});

const svg = (node, s) => satori(node, { width: s, height: s, fonts });
const png = async (node, s) => new Resvg(await svg(node, s)).render().asPng();
const out = (name, data) => { fs.writeFileSync(`public/icons/${name}`, data); console.log(`wrote public/icons/${name}`); };

// Home screens and the manifest. Full-bleed squares: the OS rounds the corners.
out('icon-512.png', await png(tile('DSM', 512, 0.44), 512));
out('icon-192.png', await png(tile('DSM', 192, 0.44), 192));
out('apple-touch-icon.png', await png(tile('DSM', 180, 0.44), 180));
out('icon-maskable-512.png', await png(tile('DSM', 512, 0.36), 512));

// Browser tab: a rounded "D" tile. Satori draws the letter as a path, so the
// SVG needs no font.
out('icon.svg', await svg(tile('D', 64, 0.78, 12), 64));
const tab32 = await png(tile('D', 32, 0.78, 6), 32);
out('icon-32.png', tab32);

// /favicon.ico, for browsers and bookmark lists that ask for it directly
// instead of reading the <link> tags. An .ico file can just hold PNGs.
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size, e); header.writeUInt8(size, e + 1); // width, height
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6); // planes, bits per pixel
    header.writeUInt32LE(data.length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}
fs.writeFileSync('public/favicon.ico', ico([{ size: 16, data: await png(tile('D', 16, 0.78, 3), 16) }, { size: 32, data: tab32 }]));
console.log('wrote public/favicon.ico');

// The organizer badge: the DSM tile beside "Find more / Des Moines tech
// events", 300×64 (shown at that size; the PNG is 2× for sharp screens).
const div = (style, ...children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });
const badge = (W, H) => div({ width: W, height: H, background: PAPER, border: `${H / 32}px solid ${INK}`, alignItems: 'center' },
  tile('DSM', H - H / 16, 0.44),
  div({ flexDirection: 'column', justifyContent: 'center', paddingLeft: H * 0.22, gap: H * 0.04 },
    div({ fontFamily: 'Mono', fontWeight: 700, fontSize: H * 0.17, color: INK, letterSpacing: H * 0.01 }, 'FIND MORE'),
    div({ fontFamily: 'Display', fontWeight: 900, fontSize: H * 0.36, lineHeight: 0.9, color: BLUE, textTransform: 'uppercase' }, 'Des Moines tech events'),
  ));
fs.writeFileSync('public/badge.svg', await satori(badge(300, 64), { width: 300, height: 64, fonts }));
fs.writeFileSync('public/badge.png', new Resvg(await satori(badge(600, 128), { width: 600, height: 128, fonts })).render().asPng());
console.log('wrote public/badge.svg, public/badge.png');

