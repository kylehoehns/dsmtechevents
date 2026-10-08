import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReport } from '../scripts/click-report.mjs';

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
