// Puts the hashes of the site's inline scripts into the Content-Security-Policy
// in dist/_headers, so the policy can allow exactly those scripts instead of
// 'unsafe-inline' (which would also allow any script an attacker managed to
// get into a page).
//
// public/_headers has the placeholder 'inline-script-hashes' in script-src.
// After `astro build`, this replaces it with a 'sha256-…' source for every
// distinct inline script in the built pages (the theme script, the nav fix,
// small modules Astro inlines). The hashes come from the build output, so
// they can't drift from the scripts; scripts/check-dist.mjs then fails the
// build if any inline script is missing from the policy.
//
// Usage: node scripts/csp.mjs [outDir]   (default dist)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PLACEHOLDER = "'inline-script-hashes'";

// Script types CSP applies to: ones a browser runs, plus speculation rules
// (Chrome checks them against script-src too). JSON and JSON-LD blocks are
// data, which CSP doesn't apply to.
const RUNS = /^(?:|module|text\/javascript|application\/javascript|speculationrules)$/i;

// The bodies of the inline scripts a browser would run.
export function inlineScripts(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (/\ssrc\s*=/i.test(attrs)) continue;
    const type = /\stype\s*=\s*["']?([^"'\s>]*)/i.exec(attrs)?.[1] ?? '';
    if (RUNS.test(type)) out.push(m[2]);
  }
  return out;
}

export const scriptHash = (body) => `'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`;

export function htmlFiles(dir) {
  return fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.html')).map((f) => path.join(dir, f));
}

// Every distinct inline-script hash across the built pages, sorted so the
// header is the same from build to build.
export function siteHashes(dir) {
  const hashes = new Set();
  for (const file of htmlFiles(dir)) for (const body of inlineScripts(fs.readFileSync(file, 'utf8'))) hashes.add(scriptHash(body));
  return [...hashes].sort();
}

// The script-src of the CSP lines in a _headers file.
export const scriptSrc = (headers) => [...headers.matchAll(/Content-Security-Policy:[^\n]*?script-src ([^;\n]*)/gi)].map((m) => m[1].split(/\s+/));

if (import.meta.filename === path.resolve(process.argv[1] ?? '')) {
  const dir = path.resolve(process.argv[2] ?? 'dist');
  const file = path.join(dir, '_headers');
  const headers = fs.readFileSync(file, 'utf8');
  if (!headers.includes(PLACEHOLDER)) throw new Error(`${file}: no ${PLACEHOLDER} placeholder in script-src`);
  const hashes = siteHashes(dir);
  fs.writeFileSync(file, headers.replaceAll(PLACEHOLDER, hashes.join(' ')));
  console.log(`csp: ${hashes.length} inline script hashes in ${path.relative(process.cwd(), file)}`);
}
