import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateArchive, brief } from '../scripts/archive.mjs';

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

test('a lower RSVP count from a stale copy does not replace the final one', () => {
  const first = updateArchive({}, { iadnug: { events: [ev('i-1', '2026-09-22T22:30:00Z', { going: 32 })] } }, now);
  assert.deepEqual(updateArchive(first, { iadnug: { events: [ev('i-1', '2026-09-22T22:30:00Z', { going: 27 })] } }, now), {}, 'kept at 32, and nothing to rewrite');
  assert.deepEqual(updateArchive(first, { iadnug: { events: [ev('i-1', '2026-09-22T22:30:00Z')] } }, now), {}, 'a copy with no count keeps it too');
});

test('ended hand-added events are archived: no group without hosts, the first host with them', () => {
  const conf = ev('manual-tech-fuse-dsm-2026-2026-10-15', '2026-10-01T13:00:00Z', { headliner: true, groupIds: [] });
  const joint = ev('manual-joint-2026-09-30', '2026-09-30T23:00:00Z', { groupIds: ['cijug', 'iadnug'] });
  const later = ev('manual-code-camp-2026-11-07', '2026-11-07T13:00:00Z', { headliner: true, groupIds: [] });
  const changed = updateArchive({}, {}, now, [conf, joint, later]);
  assert.deepEqual(changed['2026'].map((r) => [r.id, r.group, r.headliner]), [
    ['manual-joint-2026-09-30', 'cijug', undefined],
    ['manual-tech-fuse-dsm-2026-2026-10-15', undefined, true],
  ]);
  assert.ok(!('group' in changed['2026'][1]), 'no group key at all, rather than null');
  assert.deepEqual(updateArchive(changed, {}, now, [conf, joint, later]), {}, 'a quiet refresh changes nothing');
});

test('an archived record keeps a short plain-text description for search', () => {
  const long = `**Agenda**\n\n## The talk\n${'word '.repeat(200)}`;
  const d = brief(long);
  assert.ok(d.startsWith('Agenda The talk word'), d.slice(0, 30));
  assert.ok(d.length <= 600 && !d.endsWith(' '), `${d.length} chars`);
  assert.equal(brief(''), '');
  const caches = { pyowa: { events: [{ id: 'pyowa-1', title: 'Talk', start: '2026-01-05T18:00:00Z', end: '2026-01-05T20:00:00Z', description: 'Our speaker walks through it.' }, { id: 'pyowa-2', title: 'Social', start: '2026-01-06T18:00:00Z', end: '2026-01-06T20:00:00Z', description: '' }] } };
  const [r1, r2] = updateArchive({}, caches, Date.parse('2026-02-01T00:00:00Z'))[2026];
  assert.equal(r1.description, 'Our speaker walks through it.');
  assert.equal('description' in r2, false, 'no description, no field (byte-stable records)');
});
