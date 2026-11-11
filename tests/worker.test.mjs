import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { parseClick, previewer, readCapped } from '../worker/index.js';

test('parseClick keeps only a known kind, safe ids and a known part of the site', () => {
  assert.deepEqual(parseClick('{"kind":"rsvp","groups":["pyowa"],"event":"pyowa-316749553","from":"this-week"}'), { kind: 'rsvp', groups: ['pyowa'], event: 'pyowa-316749553', from: 'this-week', term: '' });
  assert.equal(parseClick('{"kind":"track-everything"}'), null);
  assert.equal(parseClick('not json'), null);
  assert.deepEqual(parseClick('{"kind":"map","groups":["<script>",7,"cijug"],"event":"x y","from":"/secret?page"}'), { kind: 'map', groups: ['cijug'], event: '', from: '', term: '' }, 'odd values are dropped, not stored');
  assert.deepEqual(parseClick('{"kind":"poster","groups":"pyowa"}'), { kind: 'poster', groups: [], event: '', from: '', term: '' });
  assert.equal(parseClick('{"kind":"preview"}'), null, 'only the Worker itself writes previews');
});

test('a search miss keeps only a short, plain term; nothing else carries one', () => {
  assert.deepEqual(parseClick('{"kind":"search-miss","term":"rust"}'), { kind: 'search-miss', groups: [], event: '', from: '', term: 'rust' });
  assert.equal(parseClick('{"kind":"search-miss","term":"me@example.com"}'), null, 'an address is refused outright');
  assert.equal(parseClick('{"kind":"search-miss","term":"a"}'), null);
  assert.equal(parseClick('{"kind":"search-miss","term":"a very long sentence someone pasted in"}'), null);
  assert.equal(parseClick('{"kind":"rsvp","term":"rust"}').term, '');
  assert.deepEqual(parseClick('{"kind":"app-open"}'), { kind: 'app-open', groups: [], event: '', from: '', term: '' });
});

test('link previews are told apart by the app that drew them; browsers are not previews', () => {
  assert.equal(previewer('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'), 'slack');
  assert.equal(previewer('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0'), 'imessage');
  assert.equal(previewer('LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)'), 'linkedin');
  assert.equal(previewer('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), null);
  assert.equal(previewer('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), null, 'search engines are not previews');
});

test('the share image is served as ever, and a preview bot fetching it is counted', async () => {
  const points = [];
  const env = { CLICKS: { writeDataPoint: (p) => points.push(p) }, ASSETS: { fetch: async () => new Response('png') } };
  const get = (ua) => worker.fetch(new Request('https://dsmtechevents.com/og-image-dark.png?v=5', { headers: { 'User-Agent': ua } }), env);
  assert.equal(await (await get('Slackbot-LinkExpanding 1.0')).text(), 'png');
  assert.equal(await (await get('Mozilla/5.0 (iPhone) Safari/604.1')).text(), 'png');
  assert.deepEqual(points, [{ blobs: ['preview', '', '', 'slack', ''], doubles: [1], indexes: ['none'] }]);
});

test('the Worker records a click per host group and serves everything else from assets', async () => {
  const points = [];
  const env = { CLICKS: { writeDataPoint: (p) => points.push(p) }, ASSETS: { fetch: async () => new Response('static') } };
  const post = (body, headers = { Origin: 'https://dsmtechevents.com' }) => new Request('https://dsmtechevents.com/api/click', { method: 'POST', body, headers });
  assert.equal((await worker.fetch(post('{"kind":"rsvp","groups":["cijug","pyowa"],"event":"cijug-1","from":"search"}'), env)).status, 204);
  assert.equal((await worker.fetch(post('{"kind":"poster","groups":[],"event":"manual-devcon-2026-10-15"}'), env)).status, 204);
  // A joint meetup: a point per host, each half of the one click.
  assert.deepEqual(points, [
    { blobs: ['rsvp', 'cijug', 'cijug-1', 'search', ''], doubles: [0.5], indexes: ['cijug'] },
    { blobs: ['rsvp', 'pyowa', 'cijug-1', 'search', ''], doubles: [0.5], indexes: ['pyowa'] },
    { blobs: ['poster', '', 'manual-devcon-2026-10-15', '', ''], doubles: [1], indexes: ['none'] },
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

test('the Worker passes a Luma photo through resized and without its cookie', async (t) => {
  const asked = [];
  t.mock.method(globalThis, 'fetch', async (u) => {
    asked.push(u);
    if (u.includes('missing')) return new Response('nope', { status: 404 });
    if (u.includes('page')) return new Response('<html>', { headers: { 'Content-Type': 'text/html' } });
    if (u.includes('vector')) return new Response('<svg>', { headers: { 'Content-Type': 'image/svg+xml' } });
    return new Response('webp', { headers: { 'Content-Type': 'image/webp', 'Set-Cookie': '__cf_bm=x' } });
  });
  const get = (path, method = 'GET') => worker.fetch(new Request(`https://dsmtechevents.com${path}`, { method }), {});
  const res = await get('/img/luma/600/uploads/6c/abc.png');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'webp');
  assert.equal(res.headers.get('Content-Type'), 'image/webp');
  assert.equal(res.headers.get('Set-Cookie'), null, "Luma's cookie stays behind");
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(res.headers.get('Content-Security-Policy'), /sandbox/);
  assert.equal(asked[0], 'https://images.lumacdn.com/cdn-cgi/image/format=webp,fit=scale-down,quality=75,width=600/uploads/6c/abc.png');

  assert.equal((await get('/img/luma/9999/uploads/6c/abc.png')).status, 404, 'only the widths the site uses');
  assert.equal((await get('/img/luma/600/uploads/6c/notes.txt')).status, 404, 'only image files');
  assert.equal((await get('/img/luma/600/uploads/missing.png')).status, 404);
  assert.equal((await get('/img/luma/600/uploads/page.png')).status, 502, 'not an image: not passed on');
  assert.equal((await get('/img/luma/600/uploads/vector.png')).status, 502, 'an SVG can carry script: not passed on');
  assert.equal((await get('/img/luma/600/uploads/6c/abc.png', 'POST')).status, 405);
  assert.equal(asked.length, 4, 'refused paths never reach Luma');
});

test('the cron signs in as the App, starts the refresh, and keeps one issue while GitHub refuses', async (t) => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----\n`;
  const env = { REFRESH_APP_CLIENT_ID: 'Iv1.abc', REFRESH_APP_KEY: pem };
  let issues = [];
  let dispatch = 204;
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const path = url.replace('https://api.github.com', '');
    const auth = init.headers.Authorization.replace('Bearer ', '');
    calls.push(`${init.method ?? 'GET'} ${path}`);
    if (path === '/repos/kylehoehns/dsmtechevents/installation') {
      // The JWT is signed with the App's key and names the App.
      const [head, claims, sig] = auth.split('.');
      assert.ok(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pair.publicKey, Buffer.from(sig, 'base64url'), new TextEncoder().encode(`${head}.${claims}`)));
      assert.equal(JSON.parse(Buffer.from(claims, 'base64url')).iss, 'Iv1.abc');
      return Response.json({ id: 42 });
    }
    if (path === '/app/installations/42/access_tokens') return Response.json({ token: 'ghs_hour' }, { status: 201 });
    assert.equal(auth, 'ghs_hour', 'everything after sign-in uses the hour-long token');
    if (path.startsWith('/repos/kylehoehns/dsmtechevents/issues?')) return Response.json(issues);
    if (path.endsWith('/actions/workflows/refresh.yml/dispatches')) {
      assert.deepEqual(JSON.parse(init.body), { ref: 'main' });
      return new Response(dispatch === 204 ? null : 'Bad things', { status: dispatch });
    }
    return Response.json({}, { status: 201 });
  });
  const tail = () => calls.splice(0).slice(3);

  await worker.scheduled({}, env);
  assert.deepEqual(tail(), ['POST /repos/kylehoehns/dsmtechevents/actions/workflows/refresh.yml/dispatches']);

  dispatch = 422;
  await assert.rejects(worker.scheduled({}, env), /422 Bad things/);
  assert.deepEqual(tail(), ['POST /repos/kylehoehns/dsmtechevents/actions/workflows/refresh.yml/dispatches', 'POST /repos/kylehoehns/dsmtechevents/issues']);

  issues = [{ number: 7, title: 'Refresh trigger broken' }];
  await assert.rejects(worker.scheduled({}, env), /422/);
  assert.deepEqual(tail(), ['POST /repos/kylehoehns/dsmtechevents/actions/workflows/refresh.yml/dispatches', 'POST /repos/kylehoehns/dsmtechevents/issues/7/comments'], 'a second failure comments rather than opening another');

  dispatch = 204;
  await worker.scheduled({}, env);
  assert.deepEqual(tail(), ['POST /repos/kylehoehns/dsmtechevents/actions/workflows/refresh.yml/dispatches', 'POST /repos/kylehoehns/dsmtechevents/issues/7/comments', 'PATCH /repos/kylehoehns/dsmtechevents/issues/7']);

  await assert.rejects(worker.scheduled({}, {}), /REFRESH_APP_CLIENT_ID/);
  await assert.rejects(worker.scheduled({}, { ...env, REFRESH_APP_KEY: '-----BEGIN RSA PRIVATE KEY-----\nabc' }), /openssl pkcs8/);
});
