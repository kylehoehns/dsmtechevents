import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRows, renderHeadline, renderReport, renderSignals, renderTraffic } from '../scripts/site-report.mjs';
import { bar, spark, trend } from '../scripts/report-md.mjs';

const day = (key, visits, views) => ({ key, visits, views });

test('text charts: bars, sparklines and week-over-week arrows', () => {
  assert.equal(bar(3, 10), '███');
  assert.equal(bar(0, 0), '');
  assert.equal(bar(1, 100), '█');
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

test('the click report lists groups A to Z with no bars or top lists, and totals real clicks', () => {
  const md = renderReport(
    {
      week: [{ key: 'pyowa', clicks: 4 }],
      month: [{ key: 'pyowa', clicks: 10 }, { key: '', clicks: 3 }, { key: 'cijug', clicks: 12 }],
      kinds: [{ key: 'rsvp', clicks: 9 }, { key: 'map', clicks: 4 }],
      totals: { week: 4, prevWeek: 2, month: 20 }, // less than the groups' 25: joint meetups count once
    },
    { groupNames: { pyowa: 'Pyowa', cijug: 'CIJUG' } },
  );
  assert.match(md, /\*\*4\*\* clicks in the last 7 days \(▲ 100%\), \*\*20\*\* in the last 30/);
  // The report is public: A to Z, not by clicks, and no bars to compare.
  assert.match(md, /\| CIJUG \| 0 \| 12 \|\n\| Pyowa \| 4 \| 10 \|\n\| No group \(conference \/ community event\) \| 0 \| 3 \|/);
  assert.doesNotMatch(md, /Listings people clicked through to/);
  assert.match(md, /\| RSVP button \| 9 \| ██████████ \|/);
});

test('an empty month still makes a readable report', () => {
  const md = renderReport({ week: [], month: [], kinds: [], totals: { week: 0, prevWeek: 0, month: 0 } });
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
  assert.match(md, /\| direct \| 30 \| 75% \| ████████ \|/);
  assert.match(md, /\| www\.google\.com \| 10 \| 25% \| ███ \|/);
  assert.match(md, /\| mobile \| 30 \| 75% \| ████████ \|/);
  assert.match(md, /\| `\/` \| 1,070 \| ██████████ \| 40 \|/);
  assert.match(md, /\| `\/groups\/` \| 535 \| █████ \| 5 \|/);
});

test('weeks of traffic add up into one row per key, in the order asked for', () => {
  const rows = [day('direct', 300, 500), day('google', 10, 12), day('direct', 200, 400), day('linkedin', 40, 900)];
  assert.deepEqual(mergeRows(rows, 'sum_visits_DESC').map((r) => [r.key, r.visits, r.views]), [['direct', 500, 900], ['linkedin', 40, 900], ['google', 10, 12]]);
  assert.deepEqual(mergeRows(rows, 'count_DESC').map((r) => r.key).slice(0, 2).sort(), ['direct', 'linkedin']);
  assert.deepEqual(mergeRows([day('2026-10-07', 1, 1), day('2026-10-09', 1, 1), day('2026-10-08', 1, 1)], 'date_DESC').map((r) => r.key), ['2026-10-09', '2026-10-08', '2026-10-07']);
});

test('the site signals: where people click, searches that found nothing, the app, link previews', () => {
  const md = renderSignals({
    where: [{ key: 'this-week', clicks: 20 }, { key: 'search', clicks: 5 }],
    misses: [{ key: 'rust', clicks: 4 }],
    installs: 2, opens: 9,
    previews: [{ key: 'slack', clicks: 6 }, { key: 'imessage', clicks: 3 }],
  });
  assert.match(md, /\| This week \| 20 \| ██████████ \|/);
  assert.match(md, /\| Search results \| 5 \|/);
  assert.match(md, /\| `rust` \| 4 \|/);
  assert.match(md, /\*\*Installed app:\*\* 2 installed, 9 times opened\./);
  assert.match(md, /\| Slack \| 6 \|/);
  assert.match(md, /\| iMessage \| 3 \|/);
  const empty = renderSignals({ where: [], misses: [], installs: 0, opens: 0, previews: [] });
  assert.match(empty, /_None\._/);
});
