// The weekly site report (see docs/ANALYTICS.md): visits and page views from
// Cloudflare Web Analytics, then outbound clicks from our own counter (which
// groups and events the site sends people to, which links get used).
// Written as Markdown to the GitHub Actions job summary, so it shows on the
// workflow run's page; run locally, it prints to the terminal.
//
//   CF_ANALYTICS_TOKEN=... node scripts/site-report.mjs
//
// The token needs Cloudflare's "Account Analytics: Read" permission. Run
// weekly by .github/workflows/site-report.yml.
import fs from 'node:fs';
import path from 'node:path';
import { loadData } from '../src/lib/data.mjs';

const ACCOUNT = 'd62c22c8dbe2380b540a92580ef4de5c';
const DATASET = 'dsmtechevents_clicks';
// Web Analytics' id for dsmtechevents.com (the account also has other sites).
const SITE_TAG = 'c4817706706548ee80786694560158f2';
const KIND_NAMES = {
  rsvp: 'RSVP button', title: 'Event title', map: 'Map link', poster: 'Headliner poster',
  later: '"Further out" row', past: '"Recently" row', meetup: 'Groups page: Meetup', website: 'Groups page: website',
};

const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map((_, i) => (i ? '---:' : '---')).join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const change = (now, before) => (before ? `${now >= before ? '+' : ''}${Math.round(((now - before) / before) * 100)}% on the week before` : 'no data for the week before');

// Pure: Web Analytics rows in, Markdown out. Each row is { key, visits, views }.
export function renderTraffic({ week, prevWeek, month, days, pages, referrers, devices }) {
  const sum = (rows, k) => rows.reduce((n, r) => n + r[k], 0);
  const [v7, p7, v30] = [sum(week, 'visits'), sum(week, 'views'), sum(month, 'visits')];
  const share = (rows) => { const t = sum(rows, 'visits') || 1; return rows.map((r) => [r.key || '(unknown)', r.visits, `${Math.round((r.visits / t) * 100)}%`]); };
  return [
    '# Site report',
    '',
    `**${v7}** visits and **${p7}** page views in the last 7 days (${change(v7, sum(prevWeek, 'visits'))}). **${v30}** visits in the last 30.`,
    '',
    '## Visits per day (UTC days)',
    '',
    days.length ? table(['Day', 'Visits', 'Page views'], days.map((r) => [r.key, r.visits, r.views])) : '_No visits yet._',
    '',
    '## Top pages, last 7 days',
    '',
    pages.length ? table(['Page', 'Views', 'Visits'], pages.map((r) => [`\`${r.key}\``, r.views, r.visits])) : '_No page views yet._',
    '',
    '## Where visits come from, last 30 days',
    '',
    'Most links opened from Slack, Teams, iMessage or a bookmark carry no referrer, so they show as "direct".',
    '',
    referrers.length ? table(['From', 'Visits', 'Share'], share(referrers).map(([k, v, p]) => [k === '(unknown)' ? 'direct' : k, v, p])) : '_None yet._',
    '',
    '## Phone or computer, last 30 days',
    '',
    devices.length ? table(['Device', 'Visits', 'Share'], share(devices)) : '_None yet._',
    '',
  ].join('\n');
}

// Pure: query results in, Markdown out. rows are { key, clicks } with clicks a number.
export function renderReport({ week, month, kinds, events }, { groupNames = {}, eventTitles = {} } = {}) {
  const total = (rows) => rows.reduce((n, r) => n + r.clicks, 0);
  const groupName = (id) => (id ? groupNames[id] ?? id : 'No group (conference / community event)');
  const weekBy = Object.fromEntries(week.map((r) => [r.key, r.clicks]));
  const lines = [
    '## Outbound clicks',
    '',
    `**${total(week)}** clicks in the last 7 days, **${total(month)}** in the last 30.`,
    'Each click on a joint meetup counts once for every host.',
    '',
    '### By group',
    '',
    month.length ? table(['Group', 'Last 7 days', 'Last 30 days'], month.map((r) => [groupName(r.key), weekBy[r.key] ?? 0, r.clicks])) : '_No clicks yet._',
    '',
    '### Listings people clicked through to, last 30 days',
    '',
    events.length ? table(['Meetup or conference', 'Clicks'], events.map((r) => [eventTitles[r.key] ?? r.key, r.clicks])) : '_No clicks on listings yet._',
    '',
    '### Which links get used, last 30 days',
    '',
    kinds.length ? table(['Link', 'Clicks'], kinds.map((r) => [KIND_NAMES[r.key] ?? r.key, r.clicks])) : '_No clicks yet._',
    '',
  ];
  return lines.join('\n');
}

async function query(sql, token) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/analytics_engine/sql`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: sql,
  });
  if (!res.ok) throw new Error(`Analytics Engine ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).data.map((r) => ({ key: r.key, clicks: Number(r.clicks) }));
}

// Web Analytics (GraphQL): visits and page views for dsmtechevents.com,
// grouped by one dimension, between two dates.
// Cloudflare's analytics API sometimes answers "unable to execute query,
// please try again later" (serviceUnavailable); try twice more before failing.
async function traffic(token, ...args) {
  for (let attempt = 1; ; attempt++) {
    try { return await trafficOnce(token, ...args); } catch (e) {
      if (attempt === 3 || !/serviceUnavailable|try again later/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, attempt * 5000));
    }
  }
}

async function trafficOnce(token, dim, from, to, limit = 10, order = 'sum_visits_DESC') {
  const query = `query($a: String!, $s: Time!, $e: Time!) { viewer { accounts(filter: { accountTag: $a }) {
    rumPageloadEventsAdaptiveGroups(limit: ${limit}, orderBy: [${order}], filter: { siteTag: "${SITE_TAG}", datetime_geq: $s, datetime_leq: $e }) {
      count sum { visits } dimensions { ${dim} } } } } }`;
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { a: ACCOUNT, s: from.toISOString(), e: to.toISOString() } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors?.length) throw new Error(`Web Analytics: ${JSON.stringify(json.errors ?? res.status).slice(0, 300)}`);
  return json.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups.map((r) => ({ key: r.dimensions[dim], visits: r.sum.visits, views: r.count }));
}

// Group names and event titles, so the report says "Pyowa" and the talk's
// title instead of ids: the site's own data (cache plus hand-added events),
// then the archive for anything older.
function names(root) {
  const { groups, events } = loadData({ dataDir: path.join(root, 'data') });
  const eventTitles = {};
  const archive = path.join(root, 'data/archive');
  for (const f of fs.readdirSync(archive).filter((f) => f.endsWith('.json'))) {
    for (const e of JSON.parse(fs.readFileSync(path.join(archive, f), 'utf8'))) eventTitles[e.id] = e.title;
  }
  for (const e of events) eventTitles[e.id] = e.title;
  return { groupNames: Object.fromEntries(groups.map((g) => [g.id, g.short])), eventTitles };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const token = process.env.CF_ANALYTICS_TOKEN;
  if (!token) {
    console.error('CF_ANALYTICS_TOKEN is not set. See the comment at the top of this file.');
    process.exit(1);
  }
  // Launch-day test clicks are tagged smoke-test; leave them out.
  const since = (days) => `FROM ${DATASET} WHERE timestamp > NOW() - INTERVAL '${days}' DAY AND blob3 != 'smoke-test'`;
  const [week, month, kinds, events] = await Promise.all([
    query(`SELECT blob2 AS key, SUM(_sample_interval) AS clicks ${since(7)} GROUP BY key ORDER BY clicks DESC`, token),
    query(`SELECT blob2 AS key, SUM(_sample_interval) AS clicks ${since(30)} GROUP BY key ORDER BY clicks DESC`, token),
    query(`SELECT blob1 AS key, SUM(_sample_interval) AS clicks ${since(30)} GROUP BY key ORDER BY clicks DESC`, token),
    query(`SELECT blob3 AS key, SUM(_sample_interval) AS clicks ${since(30)} AND blob3 != '' GROUP BY key ORDER BY clicks DESC LIMIT 10`, token),
  ]);
  const now = new Date();
  const ago = (days) => new Date(now - days * 86_400_000);
  const [tWeek, tPrev, tMonth, tDays, tPages, tRefs, tDevices] = await Promise.all([
    traffic(token, 'date', ago(7), now, 10),
    traffic(token, 'date', ago(14), ago(7), 10),
    traffic(token, 'date', ago(30), now, 40),
    traffic(token, 'date', ago(7), now, 10, 'date_DESC'),
    traffic(token, 'requestPath', ago(7), now, 10, 'count_DESC'),
    traffic(token, 'refererHost', ago(30), now, 8),
    traffic(token, 'deviceType', ago(30), now, 5),
  ]);
  // Visits from our own pages (moving between pages) aren't "where from".
  const referrers = tRefs.filter((r) => r.key !== 'dsmtechevents.com' && r.visits > 0);
  const report = renderTraffic({ week: tWeek, prevWeek: tPrev, month: tMonth, days: tDays, pages: tPages, referrers, devices: tDevices })
    + '\n' + renderReport({ week, month, kinds, events }, names(path.resolve(import.meta.dirname, '..')));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report);
}
