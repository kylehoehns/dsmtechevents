import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { parseClick, readCapped } from '../worker/index.js';

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
  const post = (body, headers = { Origin: 'https://dsmtechevents.com' }) => new Request('https://dsmtechevents.com/api/click', { method: 'POST', body, headers });
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

test('the Worker turns away other sites, floods and oversized bodies', async () => {
  const points = [];
  let left = 1; // the limiter lets one request through, then says no
  const env = {
    CLICKS: { writeDataPoint: (p) => points.push(p) },
    CLICK_LIMIT: { limit: async () => ({ success: left-- > 0 }) },
  };
  const post = (body, origin = 'https://dsmtechevents.com') => new Request('https://dsmtechevents.com/api/click', { method: 'POST', body, headers: origin ? { Origin: origin } : {} });
  const ok = '{"kind":"rsvp","groups":["cijug"],"event":"cijug-1"}';
  assert.equal((await worker.fetch(post(ok, 'https://evil.example'), env)).status, 403);
  assert.equal((await worker.fetch(post(ok, null), env)).status, 403, 'no Origin header: not from a browser page');
  assert.equal((await worker.fetch(post(ok + ' '.repeat(2000)), env)).status, 413);
  assert.equal((await worker.fetch(post(ok), env)).status, 429, 'over the limit');
  assert.equal(points.length, 0);
});

test('the Worker refuses a large body before reading it', async () => {
  const env = { CLICKS: { writeDataPoint: () => assert.fail('nothing is stored') } };
  const headers = { Origin: 'https://dsmtechevents.com' };
  let pulled = 0;
  const endless = new ReadableStream({ pull: (c) => { pulled++; c.enqueue(new Uint8Array(512)); } });
  const stated = new Request('https://dsmtechevents.com/api/click', { method: 'POST', body: endless, duplex: 'half', headers: { ...headers, 'Content-Length': '999999' } });
  await new Promise((r) => setTimeout(r));
  pulled = 0; // a stream pre-fills one chunk on its own
  assert.equal((await worker.fetch(stated, env)).status, 413);
  assert.ok(stated.body && !stated.bodyUsed && pulled === 0, 'a stated Content-Length over the cap is refused unread');

  pulled = 0;
  const chunked = new Request('https://dsmtechevents.com/api/click', { method: 'POST', body: new ReadableStream({ pull: (c) => { pulled++; c.enqueue(new Uint8Array(512)); } }), duplex: 'half', headers });
  assert.equal((await worker.fetch(chunked, env)).status, 413);
  assert.ok(pulled <= 4, `stops reading at the cap (read ${pulled} chunks)`);

  assert.equal(await readCapped(new Request('https://x/', { method: 'POST', body: 'héllo' }), 6), 'héllo', 'multi-byte text is decoded whole');
  assert.equal(await readCapped(new Request('https://x/', { method: 'POST', body: 'héllo' }), 5), null, 'the cap counts bytes, not characters');
  assert.equal(await readCapped(new Request('https://x/'), 5), '');
});
