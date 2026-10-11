import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assetList, lazyList } from '../scripts/sw-precache.mjs';

// A tiny built site: a page with a script that imports a shared chunk and
// lazily imports a library, plus a font only the CSS names.
function site() {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-precache-'));
  fs.mkdirSync(path.join(dist, '_astro', 'fonts'), { recursive: true });
  const files = {
    'index.html': '<link rel="stylesheet" href="/_astro/Layout.a1.css"><script type="module" src="/_astro/page.b2.js"></script>',
    '_astro/Layout.a1.css': '@font-face{src:url(/_astro/fonts/f3.woff2)}',
    '_astro/page.b2.js': 'import{x}from"./shared.c4.js";const q=()=>import(`./qr.d5.js`);',
    '_astro/shared.c4.js': 'export const x=1',
    '_astro/qr.d5.js': 'import{x}from"./shared.c4.js";export default x',
    '_astro/fonts/f3.woff2': '',
    'sw.js': 'const ASSETS = [];',
  };
  for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(dist, f), body);
  return dist;
}

test('only chunks the code loads with import() wait for first use; everything else is saved on install', () => {
  const dist = site();
  const assets = assetList(dist);
  assert.deepEqual(assets, ['/_astro/Layout.a1.css', '/_astro/fonts/f3.woff2', '/_astro/page.b2.js', '/_astro/qr.d5.js', '/_astro/shared.c4.js']);
  assert.deepEqual(lazyList(dist, assets), ['/_astro/qr.d5.js']);
});

test('a chunk that is also imported statically somewhere is saved on install', () => {
  const dist = site();
  fs.writeFileSync(path.join(dist, '_astro', 'other.e6.js'), 'import"./qr.d5.js";');
  assert.deepEqual(lazyList(dist, assetList(dist)), []);
});
