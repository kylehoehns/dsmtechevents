import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { inlineScripts, scriptHash, scriptSrc } from '../scripts/csp.mjs';

test('inlineScripts finds the scripts a browser runs, not data blocks or files', () => {
  const html = `
    <script>a()</script>
    <script type="module">b()</script>
    <script type="application/ld+json">{"x":1}</script>
    <script type="application/json" id="calendar-data">{}</script>
    <script type="module" src="/_astro/x.js"></script>
    <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{}'></script>`;
  assert.deepEqual(inlineScripts(html), ['a()', 'b()']);
});

test('scriptHash is the CSP sha256 source of the exact script text', () => {
  const body = '\n  doThing();\n';
  assert.equal(scriptHash(body), `'sha256-${crypto.createHash('sha256').update(body).digest('base64')}'`);
  assert.notEqual(scriptHash(body), scriptHash(body.trim()), 'whitespace counts, so hashes come from the built HTML');
});

test("/tv/ gets a second policy that leaves out Cloudflare's analytics (event mode's #fragment holds the host's Wi-Fi password)", async () => {
  const fs = await import('node:fs');
  const headers = fs.readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  const tv = /^\/tv\/\n((?:[ \t]+.*\n?)+)/m.exec(headers)?.[1] ?? '';
  const policy = /Content-Security-Policy:\s*(.*)/.exec(tv)?.[1] ?? '';
  assert.match(policy, /script-src 'self' 'inline-script-hashes';/);
  assert.match(policy, /connect-src 'self'$/);
  assert.doesNotMatch(policy, /cloudflareinsights/);
});

test('scriptSrc reads the script-src of each CSP line in _headers', () => {
  const headers = "/*\n  X-Frame-Options: DENY\n  Content-Security-Policy: script-src 'self' 'sha256-abc=' https://x; object-src 'none'\n";
  assert.deepEqual(scriptSrc(headers), [["'self'", "'sha256-abc='", 'https://x']]);
});
