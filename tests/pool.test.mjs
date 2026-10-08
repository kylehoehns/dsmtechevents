import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pastEvents } from '../src/lib/pool.mjs';

const byId = { cijug: { short: 'CIJUG' }, iadnug: { short: 'IADNUG' } };
const rec = (id, group, title, start) => ({ id, group, title, start, end: start, venue: 'Hub', url: `https://x/${id}` });

test('past events: the cache\'s ones plus older archived ones, newest first, no repeats', () => {
  const past = [{ id: 'c-2', title: 'Records', start: '2026-10-01T22:30:00Z', groupIds: ['cijug'], hostsLabel: 'CIJUG' }];
  const archive = [
    rec('c-2', 'cijug', 'Records', '2026-10-01T22:30:00Z'), // still in the cache
    rec('c-1', 'cijug', 'JVM vs CLR', '2026-04-15T22:30:00Z'),
    rec('i-1', 'iadnug', 'JVM vs. CLR', '2026-04-15T22:30:00Z'), // the same joint night on the other host's feed
    rec('c-0', 'cijug', 'Kickoff', '2025-12-01T22:30:00Z'),
  ];
  const list = pastEvents({ past, archive, byId });
  assert.deepEqual(list.map((e) => e.id), ['c-2', 'c-1', 'c-0']);
  assert.equal(list[1].hostsLabel, 'CIJUG + IADNUG');
  assert.deepEqual(list[1].groupIds, ['cijug', 'iadnug']);
});

test('an archived hand-added event with no host reads as a conference or community event', () => {
  const { group: _, ...noHost } = rec('x', 'none', '', '');
  const archive = [
    { ...noHost, id: 'manual-tech-fuse', title: 'Tech Fuse DSM 2026', start: '2026-10-15T13:00:00Z', headliner: true },
    { ...noHost, id: 'manual-social', title: 'Holiday social', start: '2026-12-10T23:00:00Z' },
  ];
  const list = pastEvents({ past: [], archive, byId });
  assert.deepEqual(list.map((e) => [e.hostsLabel, e.groupIds]), [['Community event', []], ['Conference', []]]);
});
