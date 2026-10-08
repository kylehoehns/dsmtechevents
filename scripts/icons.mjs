// Draws the app and browser icons into public/icons/: a blue tile with "DSM"
// in cream and the site's pink offset, like the masthead logo. The browser tab
// is too small for three letters, so the favicon is the same tile with a "D".
// Run `npm run icons` after changing the design, and commit the files.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const BLUE = '#0a6cc0', PAPER = '#f3ede1', PINK = '#ff4fa3';
const require = createRequire(import.meta.url);
const fonts = [{
  name: 'Display', weight: 900,
  data: fs.readFileSync(require.resolve('@fontsource/big-shoulders-display/files/big-shoulders-display-latin-900-normal.woff')),
}];

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
out('icon-32.png', await png(tile('D', 32, 0.78, 6), 32));
