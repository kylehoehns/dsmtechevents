// Checks the built site for mistakes that only show up in the output HTML.
// Runs after `astro build` (see package.json), so a failure stops the build.
//
// Glued words: Astro drops the line break between text and a tag on another
// source line, so "the\n<a>" renders as "the<a>" and "</a>\nfull" as
// "</a>full". Both have shipped once; this catches the next one.
//
// Titles: Slack's link preview shows "&" as a literal "&amp;", so titles and
// share text say "and".
//
// CSP: every inline script must have its hash in dist/_headers (written by
// scripts/csp.mjs), or the browser refuses to run it.
import fs from 'node:fs';
import path from 'node:path';
import { inlineScripts, scriptHash, scriptSrc, PLACEHOLDER } from './csp.mjs';
import { assetList } from './sw-precache.mjs';

const dist = path.resolve('dist');
const pages = fs.readdirSync(dist, { recursive: true }).filter((f) => f.endsWith('.html')).map((f) => path.join(dist, f));
const problems = [];

for (const file of pages) {
  // Glued-word checks look at markup only, not scripts or styles.
  const raw = fs.readFileSync(file, 'utf8');
  const html = raw.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
  const rel = path.relative(dist, file);
  for (const m of html.matchAll(/([A-Za-z0-9.,:;!?])<a\s/g)) {
    problems.push(`${rel}: text runs into a link: "…${html.slice(m.index - 30, m.index + 1).replace(/\s+/g, ' ')}<a"`);
  }
  for (const m of html.matchAll(/<\/a>([A-Za-z0-9])/g)) {
    problems.push(`${rel}: a link runs into text: "</a>${html.slice(m.index + 4, m.index + 34).replace(/\s+/g, ' ')}…"`);
  }
  // Slack's link preview shows "&amp;" literally, so no "&" in what it shows.
  for (const m of raw.matchAll(/<title>([^<]*)<\/title>|<meta property="og:(?:title|description)" content="([^"]*)"/g)) {
    if ((m[1] ?? m[2]).includes('&amp;')) problems.push(`${rel}: "&" in the title or share text (Slack shows it as &amp;): ${m[1] ?? m[2]}`);
  }
  // ↗ isn't in the display font, so phones draw it as an emoji or a thin
  // fallback arrow. Buttons use <OutArrow /> (an inline SVG) instead.
  if (html.includes('↗')) problems.push(`${rel}: a typed ↗ (phones draw it as an emoji or a thin arrow); use <OutArrow />`);
  // Structured data must parse, or search engines drop it silently.
  for (const m of raw.matchAll(/<script type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (err) { problems.push(`${rel}: embedded JSON doesn't parse (${err.message})`); }
  }
}

// Inline scripts the CSP doesn't allow would be blocked in production only
// (the dev server sends no _headers), so check them here.
const headers = fs.readFileSync(path.join(dist, '_headers'), 'utf8');
const policies = scriptSrc(headers);
if (!policies.length) problems.push('_headers: no Content-Security-Policy with a script-src');
if (headers.includes(PLACEHOLDER)) problems.push(`_headers: ${PLACEHOLDER} was not replaced (run scripts/csp.mjs after astro build)`);
if (policies.some((p) => p.includes("'unsafe-inline'"))) problems.push("_headers: script-src allows 'unsafe-inline'");
// Cloudflare ignores a _headers line over 2,000 characters.
for (const line of headers.split('\n')) if (line.length > 2000) problems.push(`_headers: a ${line.length}-character line (Cloudflare's limit is 2,000): ${line.slice(0, 40)}…`);
for (const file of pages) {
  for (const body of inlineScripts(fs.readFileSync(file, 'utf8'))) {
    const hash = scriptHash(body);
    if (!policies.every((p) => p.includes(hash))) problems.push(`${path.relative(dist, file)}: inline script with no CSP hash (${hash}): ${body.trim().slice(0, 50)}…`);
  }
}

// Page weight: the home page is the biggest (a card for every event in the
// list). The calendar's other cards (past events, repeat dates) are in the
// card pool, cards/index.html, which the calendar fetches when first opened:
// it gets the same budget, and the two together get one too, since a visit
// to the calendar loads both. Fail well before either gets slow on a phone.
const BUDGET_KB = 350;
const kbOf = (rel) => fs.statSync(path.join(dist, rel)).size / 1024;
for (const file of pages) {
  const kb = fs.statSync(file).size / 1024;
  if (kb > BUDGET_KB) problems.push(`${path.relative(dist, file)}: ${Math.round(kb)}KB of HTML, over the ${BUDGET_KB}KB budget`);
}
const POOL = path.join('cards', 'index.html');
if (!fs.existsSync(path.join(dist, POOL))) problems.push(`${POOL}: missing (the calendar's day panel fetches it)`);
else {
  const both = kbOf('index.html') + kbOf(POOL);
  if (both > BUDGET_KB * 1.5) problems.push(`index.html + ${POOL}: ${Math.round(both)}KB together, over the ${BUDGET_KB * 1.5}KB budget for a calendar visit`);
}

// Offline: sw.js must list every built CSS/JS/font file (scripts/sw-precache.mjs
// fills it in), or a page loses its script or styles offline. Its pages must exist.
const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');
const listed = JSON.parse(sw.match(/^const ASSETS = (\[.*\]);$/m)?.[1] ?? '[]');
const missing = assetList(dist).filter((f) => !listed.includes(f));
if (missing.length) problems.push(`sw.js: ${missing.length} built file(s) not in its ASSETS list (${missing.slice(0, 3).join(', ')}…)`);
for (const page of JSON.parse(sw.match(/^const PAGES = (\[.*\]);$/m)?.[1].replaceAll("'", '"') ?? '[]')) {
  if (!fs.existsSync(path.join(dist, page, 'index.html'))) problems.push(`sw.js: saves ${page} for offline, but the build has no such page`);
}

if (problems.length) {
  console.error(`check-dist: ${problems.length} problem(s) in the built site:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-dist: ${pages.length} pages OK`);
