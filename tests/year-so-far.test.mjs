import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yearSoFar } from '../src/lib/year-so-far.mjs';

const NOW = Date.parse('2026-10-14T14:00:00Z'); // Wed Oct 14, 9am in Des Moines
let n = 0;
const ev = (group, start, title = `Talk ${++n}`) => ({ id: `${group}-${n}`, group, title, start, end: start, venue: 'Hub' });
const tenIn = (month, group = 'pyowa') => Array.from({ length: 10 }, (_, i) => ev(group, `2026-${month}-${String(i + 1).padStart(2, '0')}T23:00:00Z`));

test('counts this year by Des Moines date, a bar per month through this one', () => {
  const archive = [
    ...tenIn('03'),
    ev('cijug', '2026-10-01T23:00:00Z'),
    ev('cijug', '2026-01-01T03:00:00Z'), // 9pm Dec 31 in Des Moines: last year
    ev('iadnug', '2025-06-01T23:00:00Z'),
  ];
  const y = yearSoFar(archive, [], NOW);
  assert.equal(y.year, '2026');
  assert.equal(y.events, 11);
  assert.equal(y.groups, 2);
  assert.deepEqual(
    y.months.map((m) => m.label),
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  );
  assert.deepEqual(
    y.months.map((m) => m.n),
    [0, 0, 10, 0, 0, 0, 0, 0, 0, 1, null, null],
  );
  assert.deepEqual(
    y.months.map((m) => m.partial),
    [false, false, false, false, false, false, false, false, false, true, false, false],
  );
  assert.equal(y.busiest, 10);
});

test('counts what is still to come this year, not repeats or next year', () => {
  const upcoming = [ev('a', '2026-11-03T23:00:00Z'), { ...ev('b', '2026-11-04T23:00:00Z'), repeat: true }, ev('c', '2027-01-05T23:00:00Z')];
  assert.equal(yearSoFar(tenIn('02'), upcoming, NOW).ahead, 1);
});

test('stays off while the year has too little to show', () => {
  assert.equal(yearSoFar(tenIn('02').slice(1), [], NOW), null);
});

test('in March, all twelve slots are there and only Jan-Mar have counts', () => {
  const march = Date.parse('2027-03-15T15:00:00Z');
  const y = yearSoFar(
    tenIn('02').map((r) => ({ ...r, start: r.start.replace('2026', '2027') })),
    [],
    march,
  );
  assert.equal(y.year, '2027');
  assert.deepEqual(
    y.months.map((m) => m.n),
    [0, 10, 0, null, null, null, null, null, null, null, null, null],
  );
});

test('a joint meetup counts once, and an event with no host is not a group', () => {
  const archive = [
    ...tenIn('03'),
    ev('cijug', '2026-04-15T22:30:00Z', 'Joint night - JVM vs. CLR'),
    ev('iadnug', '2026-04-15T22:30:00Z', 'JVM vs CLR, with CIJUG'),
    { ...ev(undefined, '2026-05-01T14:00:00Z', 'Tech Fuse DSM 2026'), group: undefined },
  ];
  const y = yearSoFar(archive, [], NOW);
  assert.equal(y.events, 12);
  assert.equal(y.groups, 3);
});
