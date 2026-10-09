import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { windows, assertion, renderSearch } from '../scripts/search-report.mjs';

test('reports the last full week Google has settled, and the week before', () => {
  assert.deepEqual(windows(new Date('2026-10-26T15:00:00Z')), {
    week: { startDate: '2026-10-17', endDate: '2026-10-23' },
    prev: { startDate: '2026-10-10', endDate: '2026-10-16' },
  });
});

test('signs a token request the service account key can verify', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = { client_email: 'site-report@x.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const [head, body, sig] = assertion(key, Date.parse('2026-10-26T15:00:00Z')).split('.');
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${head}.${body}`), publicKey, Buffer.from(sig, 'base64url')));
  const claims = JSON.parse(Buffer.from(body, 'base64url'));
  assert.equal(claims.iss, key.client_email);
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/webmasters.readonly');
  assert.equal(claims.exp - claims.iat, 3600);
});

const week = { startDate: '2026-10-17', endDate: '2026-10-23' };
const prev = { startDate: '2026-10-10', endDate: '2026-10-16' };

test('the section: totals with real changes, top searches and pages', () => {
  const md = renderSearch({
    week, prev,
    totals: { clicks: 12, impressions: 340, ctr: 12 / 340, position: 8.43 },
    prevTotals: { clicks: 11, impressions: 200, ctr: 0.055, position: 11.2 },
    queries: [{ keys: ['des moines tech events'], clicks: 7, impressions: 40, ctr: 0.175, position: 1.2 }],
    pages: [{ keys: ['https://dsmtechevents.com/groups/'], clicks: 3, impressions: 90, ctr: 0.033, position: 6 }],
  });
  assert.match(md, /showed up \*\*340\*\* times \(\+140\) and got \*\*12\*\* clicks, 3\.5% of the time\. Average position 8\.4 \(11\.2 the week before 2026-10-10\)\./);
  assert.match(md, /\| des moines tech events \| 7 \| 40 \| 17\.5% \| 1\.2 \|/);
  assert.match(md, /\| `\/groups\/` \| 3 \| 90 \| 6\.0 \|/);
});

test('the section says so when Google has nothing for the week yet', () => {
  assert.match(renderSearch({ week, prev, totals: undefined, queries: [], pages: [] }), /No Google results recorded for 2026-10-17 to 2026-10-23 yet/);
});
