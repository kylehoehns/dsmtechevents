import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateArchive } from '../scripts/archive.mjs';

const now = Date.parse('2026-10-08T12:00:00Z');
const ev = (id, start, extra = {}) => ({ id, title: id, start, end: new Date(Date.parse(start) + 7_200_000).toISOString(), venue: 'Source Allies', url: `https://x/${id}`, ...extra });

test('ended events are archived by year; upcoming ones are not', () => {
  const caches = { pyowa: { events: [ev('p-1', '2026-09-22T22:30:00Z', { going: 5 }), ev('p-2', '2026-10-27T22:30:00Z')] } };
  const changed = updateArchive({}, caches, now);
  assert.deepEqual(Object.keys(changed), ['2026']);
  assert.deepEqual(changed['2026'], [{ id: 'p-1', group: 'pyowa', title: 'p-1', start: '2026-09-22T22:30:00Z', end: '2026-09-23T00:30:00.000Z', venue: 'Source Allies', going: 5, url: 'https://x/p-1' }]);
});

test('an unchanged archive is not rewritten, and old records survive leaving the cache', () => {
  const first = updateArchive({}, { pyowa: { events: [ev('p-1', '2026-09-22T22:30:00Z', { going: 5 })] } }, now);
  assert.deepEqual(updateArchive(first, { pyowa: { events: [ev('p-1', '2026-09-22T22:30:00Z', { going: 5 })] } }, now), {});
  assert.deepEqual(updateArchive(first, { pyowa: { events: [] } }, now), {}, 'aged out of the cache: kept, no rewrite');
});

test('a later RSVP count updates the record; online events skip the venue', () => {
  const first = updateArchive({}, { pyowa: { events: [ev('p-1', '2026-09-22T22:30:00Z', { going: 5 })] } }, now);
  assert.equal(updateArchive(first, { pyowa: { events: [ev('p-1', '2026-09-22T22:30:00Z', { going: 7 })] } }, now)['2026'][0].going, 7);
  const online = updateArchive({}, { web: { events: [ev('w-1', '2026-09-14T23:30:00Z', { online: true, venue: 'Online' })] } }, now)['2026'][0];
  assert.equal(online.online, true);
  assert.ok(!('venue' in online));
});

test('events are filed under their Des Moines year', () => {
  // 7pm Dec 31 in Des Moines is already Jan 1 in UTC.
  assert.deepEqual(Object.keys(updateArchive({}, { g: { events: [ev('g-1', '2026-01-01T01:00:00Z')] } }, now)), ['2025']);
});
