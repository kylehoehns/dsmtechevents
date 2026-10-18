import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendar, readState, stateQuery, addMonths } from '../src/lib/calendar.mjs';

const today = '2026-10-14'; // a Wednesday
const ev = (start, end, groups = ['cijug']) => ({ start, end, groups });
const events = [
  ev('2026-08-20T23:00:00Z', '2026-08-21T01:00:00Z'), // the oldest on file
  ev('2026-10-08T23:00:00Z', '2026-10-09T01:00:00Z', ['pyowa']),
  ev('2026-10-21T00:30:00Z', '2026-10-21T02:00:00Z'), // 7:30pm Tue Oct 20 in Des Moines, Oct 21 in UTC
  ev('2026-10-22T13:00:00Z', '2026-10-23T22:00:00Z', []), // a two-day conference
  ev('2026-12-31T23:00:00Z', '2027-01-01T03:00:00Z', ['pyowa']), // New Year's Eve, into the night
];
const cal = calendar(events, today);

test('the grid is whole weeks from Sunday, with the days around the month', () => {
  const oct = cal.cells('2026-10');
  assert.equal(oct.length, 35);
  assert.deepEqual([oct[0], oct.at(-1)], ['2026-09-27', '2026-10-31']);
  const feb = cal.cells('2026-02'); // starts on a Sunday, 28 days: exactly four weeks
  assert.deepEqual([feb.length, feb[0], feb.at(-1)], [28, '2026-02-01', '2026-02-28']);
});

test('a day lists its events by Des Moines date, a conference on each of its days, by group', () => {
  assert.equal(cal.on('2026-10-20').length, 1, 'already the 21st in UTC, still the 20th here');
  assert.equal(cal.on('2026-10-21').length, 0);
  assert.equal(cal.on('2026-10-23').length, 1, 'day two of the conference');
  assert.equal(cal.on('2026-12-31').length, 1);
  assert.equal(cal.on('2027-01-01').length, 0, 'a night running past midnight is one day');
  assert.equal(cal.on('2026-10-08', 'cijug').length, 0);
  assert.equal(cal.on('2026-10-08', 'pyowa').length, 1);
});

test('the months on file run from the oldest event to the last day of the latest', () => {
  assert.deepEqual([cal.first, cal.last], ['2026-08', '2026-12']);
  assert.ok(cal.inRange('2026-08-01') && cal.inRange('2026-12-31'));
  assert.ok(!cal.inRange('2026-07-31') && !cal.inRange('2027-01-01'));
  const empty = calendar([], today);
  assert.deepEqual([empty.first, empty.last], ['2026-10', '2026-10'], 'this month always counts');
});

test('a month opens on today, else its next day with events, else its first such day once it is over', () => {
  assert.equal(cal.pick('2026-10'), '2026-10-20', 'nothing today, so the next day with events');
  assert.equal(cal.pick('2026-10', 'pyowa'), '2026-10-14', 'nothing ahead for the group: today');
  assert.equal(calendar(events, '2026-10-20').pick('2026-10'), '2026-10-20');
  assert.equal(cal.pick('2026-08'), '2026-08-20', 'a past month: its first day with events');
  assert.equal(cal.pick('2026-11'), '2026-11-01', 'a quiet month: the 1st');
});

test('the URL can only ask for groups, days and views that exist', () => {
  const known = { groups: { cijug: {} }, inRange: cal.inRange, today };
  assert.deepEqual(readState('?view=calendar&group=cijug&day=2026-10-20', known), {
    view: 'calendar',
    group: 'cijug',
    day: '2026-10-20',
    month: '2026-10',
    q: '',
  });
  assert.deepEqual(readState('', known), { view: 'list', group: '', day: null, month: '2026-10', q: '' });
  assert.equal(readState('?group=constructor', known).group, '', 'not an inherited name');
  assert.equal(readState('?group=nope', known).group, '');
  assert.equal(readState('?day=2026-02-30', known).day, null, 'no such day');
  assert.equal(readState('?day=2025-01-01', known).day, null, 'not on file');
  assert.equal(readState('?view=grid', known).view, 'list');
  const search = readState(`?view=calendar&group=cijug&q=${'  java '.padEnd(200, 'x')}`, known);
  assert.deepEqual([search.view, search.group, search.q.length], ['list', '', 100], 'a search shows every group, in the list');
});

test('a view writes back to the same URL, and the plain list to none', () => {
  const known = { groups: { cijug: {} }, inRange: cal.inRange, today };
  for (const q of ['?view=calendar&group=cijug&day=2026-10-20', '?group=cijug', '?q=java']) {
    assert.equal(stateQuery(readState(q, known)), q);
  }
  assert.equal(stateQuery(readState('', known)), '');
  assert.equal(stateQuery({ view: 'list', group: '', day: '2026-10-20', q: '' }), '', 'a day only counts in the calendar');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
});
