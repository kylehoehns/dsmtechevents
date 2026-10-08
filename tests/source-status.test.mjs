import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceStatus } from '../scripts/source-status.mjs';

const now = Date.parse('2026-10-08T15:00:00Z');
const later = Date.parse('2026-10-10T15:00:00Z');
const failing = (kind, message = 'HTTP 503') => ({ ok: [], problems: [{ id: 'secdsm', name: 'SecDSM', kind, message }] });

test('only failing groups are listed, with the day they started failing', () => {
  assert.deepEqual(sourceStatus({}, failing('fetch'), now), { secdsm: { kind: 'fetch', since: '2026-10-08' } });
  assert.deepEqual(sourceStatus({}, { ok: ['cijug'], problems: [] }, now), {}, 'all well: empty');
});

test('a failure keeps its first day, so the file stays the same while it lasts', () => {
  const first = sourceStatus({}, failing('fetch'), now);
  assert.deepEqual(sourceStatus(first, failing('fetch', 'timeout'), later), first, 'a different error message changes nothing');
  assert.equal(sourceStatus(first, failing('details'), later).secdsm.since, '2026-10-10', 'a different kind of failure starts over');
  assert.deepEqual(sourceStatus(first, { ok: ['secdsm'], problems: [] }, later), {}, 'recovered: gone');
});
