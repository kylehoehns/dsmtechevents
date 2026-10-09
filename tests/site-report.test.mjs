import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHeadline, renderReport, renderTraffic } from '../scripts/site-report.mjs';
import { bar, spark, trend } from '../scripts/report-md.mjs';

const day = (key, visits, views) => ({ key, visits, views });

test('text charts: bars, sparklines and week-over-week arrows', () => {
  assert.equal(bar(3, 10), '███░░░░░░░');
  assert.equal(bar(0, 0), '░░░░░░░░░░');
  assert.equal(bar(1, 100), '█░░░░░░░░░');
  assert.equal(spark([0, 7, 14]), '▁▅█');
  assert.equal(spark([0, 0]), '▁▁');
  assert.equal(trend(118, 100), '▲ 18%');
  assert.equal(trend(96, 100), '▼ 4%');
  assert.equal(trend(5, 5), '± 0%');
  assert.equal(trend(5, 0), '');
});

test('the headline totals the week, compares it with the one before and draws the days', () => {
  const md = renderHeadline({
    week: [day('2026-10-08', 1200, 2000), day('2026-10-06', 10, 20)],
    prevWeek: [day('2026-09-30', 1000, 2020)],
    month: [day('x', 1500, 3000)],
    days: [day('2026-10-08', 1200, 2000), day('2026-10-06', 10, 20)],
    clicks: 17,
    prevClicks: 0,
  });
  assert.match(md, /^# Site report/);
  // The quiet day in between (10-07) shows as the lowest block.
  assert.match(md, /\| \*\*1,210\*\* ▲ 21% \| \*\*2,020\*\* ± 0% \| \*\*17\*\* \| `▁▁█` \|/);
  assert.match(md, /\*\*1,500\*\* visits in the last 30/);
});

test('the click report names groups and events, totals the weeks and folds the long lists', () => {
  const md = renderReport(
    {
      week: [{ key: 'pyowa', clicks: 4 }],
      prevWeek: [{ key: 'pyowa', clicks: 2 }],
      month: [{ key: 'pyowa', clicks: 10 }, { key: '', clicks: 3 }],
      kinds: [{ key: 'rsvp', clicks: 9 }, { key: 'map', clicks: 4 }],
      events: [{ key: 'pyowa-1', clicks: 6 }],
    },
    { groupNames: { pyowa: 'Pyowa' }, eventTitles: { 'pyowa-1': 'Python Office Hours' } },
  );
  assert.match(md, /\*\*4\*\* clicks in the last 7 days \(▲ 100%\), \*\*13\*\* in the last 30/);
  assert.match(md, /\| Pyowa \| 4 \| 10 \| ██████████ \|/);
  assert.match(md, /\| No group \(conference \/ community event\) \| 0 \| 3 \| ███░░░░░░░ \|/);
  assert.match(md, /<summary><b>Listings people clicked through to, last 30 days<\/b>: top is Python Office Hours, 6<\/summary>\n\n/);
  assert.match(md, /\| Python Office Hours \| 6 \|/);
  assert.match(md, /\| RSVP button \| 9 \| ██████████ \|/);
});

test('an empty month still makes a readable report', () => {
  const md = renderReport({ week: [], month: [], kinds: [], events: [] });
  assert.match(md, /\*\*0\*\* clicks in the last 7 days,/);
  assert.match(md, /No clicks yet/);
  assert.match(renderTraffic({ days: [], pages: [], referrers: [], devices: [] }), /No visits yet/);
});

test('the traffic part folds the days, draws shares and calls blank referrers direct', () => {
  const md = renderTraffic({
    days: [day('2026-10-08', 30, 60), day('2026-10-06', 10, 20)],
    pages: [day('/', 40, 1070), day('/groups/', 5, 535)],
    referrers: [day('', 30, 30), day('www.google.com', 10, 10)],
    devices: [day('mobile', 30, 30), day('desktop', 10, 10)],
  });
  assert.match(md, /<summary>Visits per day \(UTC days\): busiest 2026-10-08, 30 visits<\/summary>/);
  assert.match(md, /\| 2026-10-08 \| 30 \| 60 \|\n\| 2026-10-07 \| 0 \| 0 \|\n\| 2026-10-06 \| 10 \| 20 \|/);
  assert.match(md, /\| direct \| 30 \| ████████░░ 75% \|/);
  assert.match(md, /\| www\.google\.com \| 10 \| ███░░░░░░░ 25% \|/);
  assert.match(md, /\| mobile \| 30 \| ████████░░ 75% \|/);
  assert.match(md, /\| `\/` \| 1,070 \| ██████████ \| 40 \|/);
  assert.match(md, /\| `\/groups\/` \| 535 \| █████░░░░░ \| 5 \|/);
});
