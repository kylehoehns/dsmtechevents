// Draws the link-preview image into dist/ after `astro build`. See src/lib/og.mjs.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { ogImage, poster, OG_WIDTH, OG_HEIGHT } from '../src/lib/og.mjs';

const require = createRequire(import.meta.url);
const font = (pkg, weight) => fs.readFileSync(require.resolve(`@fontsource/${pkg}/files/${pkg}-latin-${weight}-normal.woff`));
const fonts = [
  ...[800, 900].map((weight) => ({ name: 'Display', data: font('big-shoulders-display', weight), weight })),
  ...[400, 600, 700].map((weight) => ({ name: 'Mono', data: font('ibm-plex-mono', weight), weight })),
];

const card = ogImage();
const svg = await satori(poster(card), { width: OG_WIDTH, height: OG_HEIGHT, fonts });
const png = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
fs.mkdirSync('dist/og', { recursive: true });
fs.writeFileSync(`dist${card.path}`, png);
console.log(`og image: ${card.path} (${Math.round(png.length / 1024)} KB)`);
