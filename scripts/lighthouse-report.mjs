// Weekly Lighthouse scores for a few key pages, on phone and desktop. Each
// page runs 3 times and the median is kept, because single runs are noisy.
// Writes lighthouse.json and appends a "Lighthouse" table to the GitHub
// Actions job summary (or prints it locally). If prev/lighthouse.json exists
// (last week's run), big moves show next to the numbers.
//
//   node scripts/lighthouse-report.mjs
//
// Run weekly by .github/workflows/site-report.yml. Needs Chrome installed
// (set CHROME_PATH if Lighthouse can't find it).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const SITE = 'https://dsmtechevents.com';
export const PAGES = ['/', '/?view=calendar', '/groups/', '/tv/'];
const RUNS = 3;
const SCORES = { perf: 'performance', a11y: 'accessibility', bp: 'best-practices', seo: 'seo' };
const TIMINGS = { lcp: 'largest-contentful-paint', cls: 'cumulative-layout-shift', tbt: 'total-blocking-time', fcp: 'first-contentful-paint' };

export const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

// One Lighthouse JSON report in, the numbers we track out.
export function pick(lhr, page) {
  const out = {};
  for (const [k, id] of Object.entries(SCORES)) out[k] = lhr.categories[id]?.score == null ? null : Math.round(lhr.categories[id].score * 100);
  for (const [k, id] of Object.entries(TIMINGS)) out[k] = lhr.audits[id]?.numericValue ?? null;
  if (page === '/tv/') out.seo = null; // noindex on purpose
  return out;
}

// Week-over-week change, shown only when it is bigger than run-to-run noise:
// a score moving 3+ points, or LCP/TBT moving 20%+ (and at least 50 ms).
export function delta(key, now, before) {
  if (now == null || before == null) return '';
  const d = now - before;
  if (key in SCORES) return Math.abs(d) >= 3 ? ` (${d > 0 ? '+' : ''}${d})` : '';
  if (key === 'lcp' || key === 'tbt') {
    if (Math.abs(d) < 50 || (before > 0 && Math.abs(d) / before < 0.2)) return '';
    return ` (${d > 0 ? '+' : ''}${Math.round(d)} ms)`;
  }
  return '';
}

// Lighthouse's own colors: green 90+, orange 50-89, red below.
const dot = (score) => (score >= 90 ? '🟢' : score >= 50 ? '🟠' : '🔴');
const fmt = (key, v) => (v == null ? '—' : key in SCORES ? `${dot(v)}\u00a0${v}` : key === 'cls' ? v.toFixed(3) : `${Math.round(v)} ms`);
const NAMES = { perf: 'Performance', a11y: 'Accessibility', bp: 'Best practices', seo: 'SEO' };

// rows: [{ page, device, perf, a11y, bp, seo, lcp, cls, tbt, fcp }]; prev: same shape or null.
export function renderTable(rows, prev = null) {
  const keys = [...Object.keys(SCORES), ...Object.keys(TIMINGS)];
  const before = (r) => prev?.find((p) => p.page === r.page && p.device === r.device);
  const scores = rows.flatMap((r) => Object.keys(SCORES).filter((k) => r[k] != null).map((k) => ({ r, k, v: r[k] })));
  const low = scores.length && scores.reduce((a, b) => (b.v < a.v ? b : a));
  return [
    '## Lighthouse',
    '',
    ...(low ? [`${dot(low.v)} **Lowest score: ${low.v}**, ${NAMES[low.k]} on \`${low.r.page}\` (${low.r.device}).`, ''] : []),
    `Median of ${RUNS} runs against ${SITE}. Scores are out of 100.${prev ? ' Changes on last week show in brackets when they are bigger than normal noise.' : ''}`,
    '',
    '| Page | Device | Perf | A11y | Best practices | SEO | LCP | CLS | TBT | FCP |',
    `|---|---|${keys.map(() => '---:').join('|')}|`,
    ...rows.map((r) => `| \`${r.page}\` | ${r.device} | ${keys.map((k) => fmt(k, r[k]) + delta(k, r[k], before(r)?.[k])).join(' | ')} |`),
    '',
  ].join('\n');
}

function lighthouse(url, device) {
  const args = ['-y', 'lighthouse@13.5.0', url, '--output=json', '--quiet', '--chrome-flags=--headless=new --no-sandbox'];
  if (device === 'desktop') args.push('--preset=desktop');
  try {
    const lhr = JSON.parse(execFileSync('npx', args, { maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' }));
    return lhr.runtimeError ? null : lhr;
  } catch (e) {
    console.error(`lighthouse failed for ${url} (${device}): ${e.message.split('\n')[0]}`);
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = [];
  for (const page of PAGES) {
    for (const device of ['mobile', 'desktop']) {
      const runs = Array.from({ length: RUNS }, () => lighthouse(SITE + page, device)).filter(Boolean).map((l) => pick(l, page));
      const row = { page, device };
      for (const k of [...Object.keys(SCORES), ...Object.keys(TIMINGS)]) row[k] = median(runs.map((r) => r[k]));
      rows.push(row);
    }
  }
  fs.writeFileSync('lighthouse.json', JSON.stringify(rows, null, 2) + '\n');
  const prev = fs.existsSync('prev/lighthouse.json') ? JSON.parse(fs.readFileSync('prev/lighthouse.json', 'utf8')) : null;
  const md = renderTable(rows, prev);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\n' + md);
  console.log(md);
}
