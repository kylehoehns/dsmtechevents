// Astro integration: after the build, write the list of every file in
// /_astro/ (CSS, JS chunks, fonts) into dist/sw.js, so the service worker
// keeps exactly those, and saves all but the LAZY ones on install.
//
// Reading the list out of the pages' HTML (what sw.js used to do) misses the
// chunks a script imports, like the shared format.*.js, and a page's files
// when another page is the one being read. The build knows every file.
//
// LAZY: chunks the built code only ever loads with import(), like the qrcode
// library that only TV event mode uses. A first visit shouldn't download them
// in the background; the worker saves one when a page first asks for it. A
// file named anywhere else (a page, a static import, the CSS) is saved on
// install.
//
// The list changing also changes sw.js, which is how the browser learns a new
// build is out and installs the new worker.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLACEHOLDER = /^const ASSETS = \[\];.*$/m;
const LAZY_PLACEHOLDER = /^const LAZY = \[\];.*$/m;

export function assetList(dist) {
  const dir = path.join(dist, '_astro');
  return fs
    .readdirSync(dir, { recursive: true })
    .filter((f) => fs.statSync(path.join(dir, f)).isFile())
    .map((f) => `/_astro/${f.split(path.sep).join('/')}`)
    .sort();
}

// The files whose every mention in the built pages, scripts and styles is a
// dynamic import("./name.js").
export function lazyList(dist, assets) {
  const text = fs
    .readdirSync(dist, { recursive: true })
    .filter((f) => /\.(html|js|css)$/.test(f) && f !== 'sw.js')
    .map((f) => fs.readFileSync(path.join(dist, f), 'utf8'))
    .join('\n');
  return assets.filter((a) => {
    const name = path.posix.basename(a);
    const all = text.split(name).length - 1;
    const dynamic = text.split(new RegExp(`import\\(\\s*[\`'"]\\./${name.replaceAll('.', '\\.')}[\`'"]`)).length - 1;
    return all > 0 && all === dynamic;
  });
}

export default function swPrecache() {
  return {
    name: 'sw-precache',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const dist = fileURLToPath(dir);
        const sw = path.join(dist, 'sw.js');
        const src = fs.readFileSync(sw, 'utf8');
        if (!PLACEHOLDER.test(src) || !LAZY_PLACEHOLDER.test(src))
          throw new Error('sw-precache: no "const ASSETS = [];" and "const LAZY = [];" lines in sw.js to fill in');
        const assets = assetList(dist);
        const lazy = lazyList(dist, assets);
        fs.writeFileSync(
          sw,
          src.replace(PLACEHOLDER, `const ASSETS = ${JSON.stringify(assets)};`).replace(LAZY_PLACEHOLDER, `const LAZY = ${JSON.stringify(lazy)};`),
        );
        logger.info(`${assets.length} files in /_astro/ listed in sw.js, ${lazy.length} saved on first use`);
      },
    },
  };
}
