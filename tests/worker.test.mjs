import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { parseClick } from '../worker/index.js';

test('parseClick keeps only a known kind and safe ids', () => {
  assert.deepEqual(parseClick('{"kind":"rsvp","groups":["pyowa"],"event":"pyowa-316749553"}'), { kind: 'rsvp', groups: ['pyowa'], event: 'pyowa-316749553' });
  assert.equal(parseClick('{"kind":"track-everything"}'), null);
  assert.equal(parseClick('not json'), null);
  assert.deepEqual(parseClick('{"kind":"map","groups":["<script>",7,"cijug"],"event":"x y"}'), { kind: 'map', groups: ['cijug'], event: '' }, 'odd ids are dropped, not stored');
  assert.deepEqual(parseClick('{"kind":"poster","groups":"pyowa"}'), { kind: 'poster', groups: [], event: '' });
});

test('the Worker records a click per host group and serves everything else from assets', async () => {
  const points = [];
  const env = { CLICKS: { writeDataPoint: (p) => points.push(p) }, ASSETS: { fetch: async () => new Response('static') } };
  const post = (body) => new Request('https://dsmtechevents.com/api/click', { method: 'POST', body });
  assert.equal((await worker.fetch(post('{"kind":"rsvp","groups":["cijug","pyowa"],"event":"cijug-1"}'), env)).status, 204);
  assert.equal((await worker.fetch(post('{"kind":"poster","groups":[],"event":"manual-devcon-2026-10-15"}'), env)).status, 204);
  assert.deepEqual(points, [
    { blobs: ['rsvp', 'cijug', 'cijug-1'], indexes: ['cijug'] },
    { blobs: ['rsvp', 'pyowa', 'cijug-1'], indexes: ['pyowa'] },
    { blobs: ['poster', '', 'manual-devcon-2026-10-15'], indexes: ['none'] },
  ]);
  assert.equal((await worker.fetch(new Request('https://dsmtechevents.com/api/click'), env)).status, 405);
  assert.equal((await worker.fetch(post('{}'), env)).status, 400);
  assert.equal(await (await worker.fetch(new Request('https://dsmtechevents.com/groups/'), env)).text(), 'static');
});
