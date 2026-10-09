// The Google Search part of the weekly site report (see docs/ANALYTICS.md):
// how often the site showed up in Google, how often people clicked, and for
// which searches and pages, from the Search Console API. Appended to the
// GitHub Actions job summary after the Cloudflare and Lighthouse parts; run
// locally, it prints to the terminal.
//
//   GSC_SERVICE_ACCOUNT="$(cat key.json)" node scripts/search-report.mjs
//
// GSC_SERVICE_ACCOUNT is a Google Cloud service account's JSON key; the
// account is a "Restricted" (read-only) user on the Search Console property.
// No key, or a Google error: the section says so and the run carries on.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fold, num, table, trend } from './report-md.mjs';

// The property: a Domain property, or else the URL-prefix one.
const SITES = ['sc-domain:dsmtechevents.com', 'https://dsmtechevents.com/'];
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
// Search Console's numbers settle about three days late.
const LAG_DAYS = 3;

const day = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);

// The last full week Google has settled, and the week before it.
export function windows(now = new Date()) {
  const end = addDays(now, -LAG_DAYS);
  return {
    week: { startDate: day(addDays(end, -6)), endDate: day(end) },
    prev: { startDate: day(addDays(end, -13)), endDate: day(addDays(end, -7)) },
  };
}

const b64url = (s) => Buffer.from(s).toString('base64url');

// A signed request for an access token (OAuth 2 JWT bearer, RS256).
export function assertion({ client_email, private_key }, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 }));
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), private_key).toString('base64url');
  return `${head}.${body}.${sig}`;
}

const pct = (n) => `${(n * 100).toFixed(1)}%`;
const pos = (n) => n.toFixed(1);
// Paths read better than full URLs in a table.
const shortPage = (url) => { try { return new URL(url).pathname + new URL(url).search; } catch { return url; } };

// Pure: Search Console rows in, Markdown out. totals are { clicks, impressions,
// ctr, position } (or undefined with no data); queries and pages are rows with keys[0].
export function renderSearch({ week, prev, totals, prevTotals, queries, pages }) {
  const out = ['## Google Search', ''];
  if (!totals || !totals.impressions) {
    out.push(`_No Google results recorded for ${week.startDate} to ${week.endDate} yet._`, '');
    return out.join('\n');
  }
  const cell = (now, before) => `**${num(now)}** ${trend(now, before)}`.trim();
  out.push(
    table(['Shown in Google', 'Clicks', 'Click rate', 'Average position'], [[
      cell(totals.impressions, prevTotals?.impressions),
      cell(totals.clicks, prevTotals?.clicks),
      pct(totals.ctr),
      `**${pos(totals.position)}**${prevTotals?.impressions ? ` (was ${pos(prevTotals.position)})` : ''}`,
    ]]),
    '',
    `${week.startDate} to ${week.endDate}; ▲▼ compare with the week from ${prev.startDate}. Google's numbers settle about three days late. A lower position is better: 1 is the top result.`,
    '',
    queries.length
      ? fold(`<b>Searches that showed the site</b>: top is "${queries[0].keys[0]}", shown ${num(queries[0].impressions)} times`,
        'Google leaves out rare searches, so these add up to less than the total.\n\n'
        + table(['Search', 'Clicks', 'Shown', 'Click rate', 'Position'], queries.map((r) => [r.keys[0], num(r.clicks), num(r.impressions), pct(r.ctr), pos(r.position)])))
      : '_No searches listed yet._',
    '',
    '### Pages people reached from Google',
    '',
    pages.length ? table(['Page', 'Clicks', 'Shown', 'Position'], pages.map((r) => [`\`${shortPage(r.keys[0])}\``, num(r.clicks), num(r.impressions), pos(r.position)])) : '_None yet._',
    '',
  );
  return out.join('\n');
}

async function token(key) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: assertion(key) }),
  });
  if (!res.ok) throw new Error(`Google sign-in: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function query(access, site, body) {
  const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const err = new Error(`Search Console ${site}: ${res.status} ${await res.text()}`); err.status = res.status; throw err; }
  return (await res.json()).rows ?? [];
}

async function main() {
  // The run's summary page, and the log too: the summary can't be read
  // from the command line, the log can (gh run view --log).
  const out = (md) => { console.log(md); if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`); };
  if (!process.env.GSC_SERVICE_ACCOUNT) {
    out('## Google Search\n\n_Not set up: add the GSC_SERVICE_ACCOUNT secret (see docs/ANALYTICS.md)._\n');
    return;
  }
  try {
    const access = await token(JSON.parse(process.env.GSC_SERVICE_ACCOUNT));
    const { week, prev } = windows();
    // Whichever property this account can read.
    let site; let totals;
    for (const s of SITES) {
      try { [totals] = await query(access, s, week); site = s; break; } catch (e) { if (e.status !== 403 && e.status !== 404) throw e; }
    }
    if (!site) throw new Error(`the service account can't read ${SITES.join(' or ')}; add it as a user on the property`);
    const [[prevTotals], queries, pages] = await Promise.all([
      query(access, site, prev),
      query(access, site, { ...week, dimensions: ['query'], rowLimit: 15 }),
      query(access, site, { ...week, dimensions: ['page'], rowLimit: 10 }),
    ]);
    out(renderSearch({ week, prev, totals, prevTotals, queries, pages }));
  } catch (e) {
    out(`## Google Search\n\n_Couldn't read Search Console: ${e.message.split('\n')[0].slice(0, 300)}_\n`);
    process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) main();
