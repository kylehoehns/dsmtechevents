import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, delta, pick, renderTable } from '../scripts/lighthouse-report.mjs';

const row = (page, device, over = {}) => ({ page, device, perf: 99, a11y: 100, bp: 96, seo: 100, lcp: 1791.4, cls: 0.0751, tbt: 6, fcp: 990.6, ...over });

test('median takes the middle run and ignores failed ones', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([100, null, 90, 95]), 95);
  assert.equal(median([]), null);
  assert.equal(median([null]), null);
});

test('deltas show only past the noise thresholds', () => {
  assert.equal(delta('perf', 97, 99), '');
  assert.equal(delta('perf', 96, 99), ' (-3)');
  assert.equal(delta('a11y', 100, 92), ' (+8)');
  assert.equal(delta('lcp', 1300, 1200), ''); // 8%
  assert.equal(delta('lcp', 1500, 1200), ' (+300 ms)'); // 25%
  assert.equal(delta('lcp', 900, 1200), ' (-300 ms)');
  assert.equal(delta('tbt', 6, 0), ''); // tiny, though infinitely many percent
  assert.equal(delta('tbt', 120, 0), ' (+120 ms)');
  assert.equal(delta('fcp', 3000, 1000), ''); // FCP and CLS never show a change
  assert.equal(delta('cls', 0.3, 0), '');
  assert.equal(delta('seo', null, 66), '');
});

test('pick reads scores and timings, and leaves SEO out for /tv/', () => {
  const lhr = {
    categories: { performance: { score: 0.99 }, accessibility: { score: 1 }, 'best-practices': { score: 0.96 }, seo: { score: 0.66 } },
    audits: { 'largest-contentful-paint': { numericValue: 1200 }, 'cumulative-layout-shift': { numericValue: 0.02 }, 'total-blocking-time': { numericValue: 0 }, 'first-contentful-paint': { numericValue: 950 } },
  };
  assert.deepEqual(pick(lhr, '/'), { perf: 99, a11y: 100, bp: 96, seo: 66, lcp: 1200, cls: 0.02, tbt: 0, fcp: 950 });
  assert.equal(pick(lhr, '/tv/').seo, null);
});

test('the table without last week has no brackets', () => {
  const md = renderTable([row('/', 'mobile'), row('/tv/', 'desktop', { seo: null })]);
  assert.match(md, /^## Lighthouse/);
  assert.match(md, /\| `\/` \| mobile \| 🟢\u00a099 \| 🟢\u00a0100 \| 🟢\u00a096 \| 🟢\u00a0100 \| 1791 ms \| 0\.075 \| 6 ms \| 991 ms \|/);
  assert.match(md, /\| `\/tv\/` \| desktop \| 🟢\u00a099 \| 🟢\u00a0100 \| 🟢\u00a096 \| — \|/);
  assert.doesNotMatch(md, /\(\+|\(-/);
  assert.doesNotMatch(md, /last week/);
});

test('the table with last week shows only the real moves', () => {
  const prev = [row('/', 'mobile', { perf: 90, lcp: 1700 }), row('/groups/', 'mobile')];
  const md = renderTable([row('/', 'mobile'), row('/groups/', 'desktop')], prev);
  assert.match(md, /last week/);
  assert.match(md, /\| `\/` \| mobile \| 🟢\u00a099 \(\+9\) \| 🟢\u00a0100 \| 🟢\u00a096 \| 🟢\u00a0100 \| 1791 ms \| /); // LCP +5%: hidden
  assert.match(md, /\| `\/groups\/` \| desktop \| 🟢\u00a099 \| 🟢\u00a0100 \| 🟢\u00a096 \| 🟢\u00a0100 \| 1791 ms \|/); // no desktop row last week
});

test('the lowest score leads, colored the way Lighthouse colors it', () => {
  const md = renderTable([row('/', 'mobile', { perf: 72 }), row('/tv/', 'desktop', { a11y: 41, seo: null })]);
  assert.match(md, /🔴 \*\*Lowest score: 41\*\*, Accessibility on `\/tv\/` \(desktop\)\./);
  assert.match(md, /\| `\/` \| mobile \| 🟠\u00a072 \|/);
});
