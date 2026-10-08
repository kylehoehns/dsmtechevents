import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReport, renderTraffic } from '../scripts/site-report.mjs';

test('the click report names groups and events and totals the weeks', () => {
  const md = renderReport(
    {
      week: [{ key: 'pyowa', clicks: 4 }],
      month: [{ key: 'pyowa', clicks: 10 }, { key: '', clicks: 3 }],
      kinds: [{ key: 'rsvp', clicks: 9 }, { key: 'map', clicks: 4 }],
      events: [{ key: 'pyowa-1', clicks: 6 }],
    },
    { groupNames: { pyowa: 'Pyowa' }, eventTitles: { 'pyowa-1': 'Python Office Hours' } },
  );
  assert.match(md, /\*\*4\*\* clicks in the last 7 days, \*\*13\*\* in the last 30/);
  assert.match(md, /\| Pyowa \| 4 \| 10 \|/);
  assert.match(md, /\| No group \(conference \/ community event\) \| 0 \| 3 \|/);
  assert.match(md, /\| Python Office Hours \| 6 \|/);
  assert.match(md, /\| RSVP button \| 9 \|/);
});

test('an empty month still makes a readable report', () => {
  const md = renderReport({ week: [], month: [], kinds: [], events: [] });
  assert.match(md, /\*\*0\*\* clicks in the last 7 days/);
  assert.match(md, /No clicks yet/);
});

test('the traffic part totals visits, compares weeks and calls blank referrers direct', () => {
  const day = (key, visits, views) => ({ key, visits, views });
  const md = renderTraffic({
    week: [day('2026-10-08', 30, 60), day('2026-10-07', 10, 20)],
    prevWeek: [day('2026-09-30', 20, 30)],
    month: [day('x', 50, 90)],
    days: [day('2026-10-08', 30, 60)],
    pages: [day('/', 40, 70)],
    referrers: [day('', 30, 30), day('www.google.com', 10, 10)],
    devices: [day('mobile', 30, 30), day('desktop', 10, 10)],
  });
  assert.match(md, /\*\*40\*\* visits and \*\*80\*\* page views in the last 7 days \(\+100% on the week before\)\. \*\*50\*\* visits in the last 30/);
  assert.match(md, /\| direct \| 30 \| 75% \|/);
  assert.match(md, /\| www\.google\.com \| 10 \| 25% \|/);
  assert.match(md, /\| mobile \| 30 \| 75% \|/);
  assert.match(md, /\| `\/` \| 70 \| 40 \|/);
});
