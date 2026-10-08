// Astro integration: after the build, write the list of every file in
// /_astro/ (CSS, JS chunks, fonts) into dist/sw.js, so the service worker
// saves all of them on install and keeps exactly those.
//
// Reading the list out of the pages' HTML (what sw.js used to do) misses the
// chunks a script imports, like the shared format.*.js, and a page's files
// when another page is the one being read. The build knows every file.
//
// The list changing also changes sw.js, which is how the browser learns a new
// build is out and installs the new worker.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLACEHOLDER = /^const ASSETS = \[\];.*$/m;

export function assetList(dist) {
  const dir = path.join(dist, '_astro');
  return fs.readdirSync(dir, { recursive: true })
    .filter((f) => fs.statSync(path.join(dir, f)).isFile())
    .map((f) => `/_astro/${f.split(path.sep).join('/')}`)
    .sort();
}

export default function swPrecache() {
  return {
    name: 'sw-precache',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const dist = fileURLToPath(dir);
        const sw = path.join(dist, 'sw.js');
        const src = fs.readFileSync(sw, 'utf8');
        if (!PLACEHOLDER.test(src)) throw new Error('sw-precache: no "const ASSETS = [];" line in sw.js to fill in');
        const assets = assetList(dist);
        fs.writeFileSync(sw, src.replace(PLACEHOLDER, `const ASSETS = ${JSON.stringify(assets)};`));
        logger.info(`${assets.length} files in /_astro/ listed in sw.js`);
      },
    },
  };
}
