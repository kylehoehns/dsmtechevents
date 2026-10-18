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
import { bar, fold, num, spark, table, trend } from './report-md.mjs';

const ACCOUNT = 'd62c22c8dbe2380b540a92580ef4de5c';
const DATASET = 'dsmtechevents_clicks';
// Web Analytics' id for dsmtechevents.com (the account also has other sites).
const SITE_TAG = 'c4817706706548ee80786694560158f2';
const KIND_NAMES = {
  rsvp: 'RSVP button',
  title: 'Event title',
  map: 'Map link',
  poster: 'Headliner poster',
  later: '"Further out" row',
  past: '"Recently" row',
  meetup: 'Groups page: Meetup',
  website: 'Groups page: website',
};

// Pure: the summary that opens the report. Visits and views come as Web
// Analytics rows ({ key, visits, views }); clicks and prevClicks are totals.
export function renderHeadline({ week, prevWeek, month, days, clicks, prevClicks }) {
  const sum = (rows, k) => rows.reduce((n, r) => n + r[k], 0);
  const cell = (now, before) => `**${num(now)}** ${trend(now, before)}`.trim();
  return [
    '# Site report',
    '',
    table(
      ['Visits', 'Page views', 'Clicks out', 'Visits by day'],
      [
        [
          cell(sum(week, 'visits'), sum(prevWeek, 'visits')),
          cell(sum(week, 'views'), sum(prevWeek, 'views')),
          cell(clicks, prevClicks),
          days.length ? `\`${spark(daily(days).map((r) => r.visits))}\`` : '—',
        ],
      ],
    ),
    '',
    `The last 7 days; ▲▼ compare with the 7 before. **${num(sum(month, 'visits'))}** visits in the last 30.`,
    '',
  ].join('\n');
}

// Days rows oldest first, with the days nobody visited filled in as 0.
function daily(days) {
  const by = Object.fromEntries(days.map((r) => [r.key, r]));
  const keys = days.map((r) => r.key).sort();
  const out = [];
  for (let d = new Date(`${keys[0]}T00:00:00Z`); d <= new Date(`${keys.at(-1)}T00:00:00Z`); d = new Date(d.getTime() + 86_400_000)) {
    const key = d.toISOString().slice(0, 10);
    out.push(by[key] ?? { key, visits: 0, views: 0 });
  }
  return out;
}

// Pure: Web Analytics rows in, Markdown out. Each row is { key, visits, views }.
export function renderTraffic({ days, pages, referrers, devices }) {
  const sum = (rows, k) => rows.reduce((n, r) => n + r[k], 0);
  const max = (rows, k) => Math.max(...rows.map((r) => r[k]));
  const share = (rows) => {
    const t = sum(rows, 'visits') || 1;
    return rows.map((r) => [r.key || '(unknown)', num(r.visits), `${Math.round((r.visits / t) * 100)}%`, bar(r.visits, t)]);
  };
  const busiest = days.length && days.reduce((a, b) => (b.visits > a.visits ? b : a));
  return [
    days.length
      ? fold(
          `Visits per day (UTC days): busiest ${busiest.key}, ${num(busiest.visits)} visits`,
          table(
            ['Day', 'Visits', 'Page views'],
            daily(days)
              .reverse()
              .map((r) => [r.key, num(r.visits), num(r.views)]),
          ),
        )
      : '_No visits yet._',
    '',
    '## Top pages, last 7 days',
    '',
    pages.length
      ? table(
          ['Page', 'Views', '', 'Visits'],
          pages.map((r) => [`\`${r.key}\``, num(r.views), bar(r.views, max(pages, 'views')), num(r.visits)]),
        )
      : '_No page views yet._',
    '',
    '## Where visits come from, last 30 days',
    '',
    'Most links opened from Slack, Teams, iMessage or a bookmark carry no referrer, so they show as "direct".',
    '',
    referrers.length
      ? table(
          ['From', 'Visits', 'Share', ''],
          share(referrers).map(([k, ...rest]) => [k === '(unknown)' ? 'direct' : k, ...rest]),
        )
      : '_None yet._',
    '',
    '## Phone or computer, last 30 days',
    '',
    devices.length ? table(['Device', 'Visits', 'Share', ''], share(devices)) : '_None yet._',
    '',
  ].join('\n');
}

const FROM_NAMES = {
  'this-week': 'This week',
  'next-week': 'Next week',
  later: 'Later this month and after',
  further: 'Further out',
  headliners: 'Headliner posters',
  recent: '"Recently"',
  calendar: 'Calendar',
  search: 'Search results',
  'group-filter': "One group's events",
  'groups-page': 'Groups page',
  other: 'Elsewhere',
};
const APP_NAMES = {
  imessage: 'iMessage',
  slack: 'Slack',
  teams: 'Teams',
  discord: 'Discord',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  x: 'X',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
};

// Pure: the site's own signals, last 30 days. Rows are { key, clicks }:
// where is clicks by part of the site, misses is search terms that found
// nothing (already only those seen 3+ times), previews is link previews by
// app; installs and opens are numbers.
export function renderSignals({ where, misses, installs, opens, previews }) {
  const max = (rows) => Math.max(...rows.map((r) => r.clicks));
  const rows = (list, names) => list.map((r) => [names[r.key] ?? r.key, num(r.clicks), bar(r.clicks, max(list))]);
  return [
    '## Around the site, last 30 days',
    '',
    where.length
      ? fold('<b>Where on the site people click out</b>', table(['Part of the site', 'Clicks', ''], rows(where, FROM_NAMES)))
      : '_No clicks with a place yet._',
    '',
    '**Searches that found nothing**, seen 3 or more times (one-offs are left out, so a name typed once never shows):',
    '',
    misses.length
      ? table(
          ['Search', 'Times'],
          misses.map((r) => [`\`${r.key}\``, num(r.clicks)]),
        )
      : '_None._',
    '',
    `**Installed app:** ${num(installs)} installed, ${num(opens)} times opened.`,
    '',
    '**Link previews**: how often an app drew a preview of a link to the site (Slack, iMessage and the like fetch the share image). Apps cache previews, so this counts fewer than the real shares.',
    '',
    previews.length ? table(['App', 'Previews', ''], rows(previews, APP_NAMES)) : '_None yet._',
    '',
  ].join('\n');
}

// Pure: query results in, Markdown out. rows are { key, clicks } with clicks
// a number; totals are each window's real clicks ({ week, prevWeek, month }).
// The report is public (anyone can open a run on a public repo), so groups
// are listed A to Z with no bars and no per-listing top list: nothing here
// ranks one group against another.
export function renderReport({ week, month, kinds, totals }, { groupNames = {} } = {}) {
  const max = (rows) => Math.max(...rows.map((r) => r.clicks));
  const groupName = (id) => (id ? (groupNames[id] ?? id) : 'No group (conference / community event)');
  const weekBy = Object.fromEntries(week.map((r) => [r.key, r.clicks]));
  // A to Z by name; events with no group last.
  const groups = [...month].sort((x, y) => !x.key - !y.key || groupName(x.key).localeCompare(groupName(y.key)));
  const top = (rows, name) => `${name(rows[0].key)}, ${num(rows[0].clicks)}`;
  const change = trend(totals.week, totals.prevWeek);
  const lines = [
    '## Outbound clicks',
    '',
    `**${num(totals.week)}** clicks in the last 7 days${change && ` (${change})`}, **${num(totals.month)}** in the last 30.`,
    '',
    '### By group, A to Z',
    '',
    'A joint meetup counts for each of its hosts, so these add up to more than the total.',
    '',
    groups.length
      ? table(
          ['Group', 'Last 7 days', 'Last 30 days'],
          groups.map((r) => [groupName(r.key), num(weekBy[r.key] ?? 0), num(r.clicks)]),
        )
      : '_No clicks yet._',
    '',
    kinds.length
      ? fold(
          `<b>Which links get used, last 30 days</b>: top is ${top(kinds, (k) => KIND_NAMES[k] ?? k)}`,
          table(
            ['Link', 'Clicks', ''],
            kinds.map((r) => [KIND_NAMES[r.key] ?? r.key, num(r.clicks), bar(r.clicks, max(kinds))]),
          ),
        )
      : '_No clicks yet._',
    '',
  ];
  return lines.join('\n');
}

async function query(sql, token) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/analytics_engine/sql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: sql,
  });
  if (!res.ok) throw new Error(`Analytics Engine ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).data.map((r) => ({ key: r.key, clicks: Number(r.clicks) }));
}

// Web Analytics (GraphQL): visits and page views for dsmtechevents.com,
// grouped by one dimension, between two dates.
// Cloudflare answers a range longer than a week from a much thinner sample:
// on 2026-10-09 a 7-day query counted about 4 in 5 page loads and a 30-day
// one about 1 in 13, so 30-day visits came out lower than 7-day visits. A
// long range is asked for a week at a time and the weeks added up.
const WEEK = 7 * 86_400_000;
async function traffic(token, dim, from, to, limit = 10, order = 'sum_visits_DESC') {
  if (to - from <= WEEK) return trafficRetry(token, dim, from, to, limit, order);
  const weeks = [];
  // datetime_geq and datetime_leq both include their end, so each earlier
  // week stops 1 ms short of the next.
  for (let end = to; end > from; end = new Date(end - WEEK - 1)) weeks.push([new Date(Math.max(from, end - WEEK)), end]);
  const parts = await Promise.all(weeks.map(([s, e]) => trafficRetry(token, dim, s, e, 1000, order)));
  return mergeRows(parts.flat(), order).slice(0, limit);
}

// Rows from several weeks into one row per key, sorted the way the query asked.
export function mergeRows(rows, order) {
  const by = new Map();
  for (const r of rows) {
    const m = by.get(r.key) ?? { key: r.key, visits: 0, views: 0 };
    m.visits += r.visits;
    m.views += r.views;
    by.set(r.key, m);
  }
  const sorts = { date_DESC: (a, b) => (a.key < b.key ? 1 : -1), count_DESC: (a, b) => b.views - a.views, sum_visits_DESC: (a, b) => b.visits - a.visits };
  return [...by.values()].sort(sorts[order]);
}

// Cloudflare's analytics API sometimes answers "unable to execute query,
// please try again later" (serviceUnavailable); try twice more before failing.
async function trafficRetry(token, ...args) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await trafficOnce(token, ...args);
    } catch (e) {
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
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { a: ACCOUNT, s: from.toISOString(), e: to.toISOString() } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors?.length) throw new Error(`Web Analytics: ${JSON.stringify(json.errors ?? res.status).slice(0, 300)}`);
  return json.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups.map((r) => ({ key: r.dimensions[dim], visits: r.sum.visits, views: r.count }));
}

// Group names, so the report says "Pyowa" instead of an id.
function groupNames(root) {
  const { groups } = loadData({ dataDir: path.join(root, 'data') });
  return { groupNames: Object.fromEntries(groups.map((g) => [g.id, g.short])) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const token = process.env.CF_ANALYTICS_TOKEN;
  if (!token) {
    console.error('CF_ANALYTICS_TOKEN is not set. See the comment at the top of this file.');
    process.exit(1);
  }
  // Launch-day test clicks are tagged smoke-test; leave them out.
  const since = (days) => `FROM ${DATASET} WHERE timestamp > NOW() - INTERVAL '${days}' DAY AND blob3 != 'smoke-test'`;
  // A joint meetup's click is one point per host group (worker/index.js),
  // each weighted 1/hosts in double1, so per-group counts use the points and
  // totals use the weights. Points from before the weights count whole.
  const ONE = `SUM(_sample_interval * IF(double1 > 0, double1, 1.0))`;
  // Clicks out are the link kinds; the dataset also holds the site's own
  // signals (search-miss, install, app-open, preview).
  const links = (days) =>
    `${since(days)} AND blob1 IN (${Object.keys(KIND_NAMES)
      .map((k) => `'${k}'`)
      .join(', ')})`;
  const prev = `${links(14)} AND timestamp <= NOW() - INTERVAL '7' DAY`;
  const kindIs = (kind) => `${since(30)} AND blob1 = '${kind}'`;
  const [week, month, kinds, [tw], [tp], [tm], where, misses, [installs], [opens], previews] = await Promise.all([
    query(`SELECT blob2 AS key, SUM(_sample_interval) AS clicks ${links(7)} GROUP BY key`, token),
    query(`SELECT blob2 AS key, SUM(_sample_interval) AS clicks ${links(30)} GROUP BY key`, token),
    query(`SELECT blob1 AS key, ${ONE} AS clicks ${links(30)} GROUP BY key ORDER BY clicks DESC`, token),
    query(`SELECT 'all' AS key, ${ONE} AS clicks ${links(7)}`, token),
    query(`SELECT 'all' AS key, ${ONE} AS clicks ${prev}`, token),
    query(`SELECT 'all' AS key, ${ONE} AS clicks ${links(30)}`, token),
    query(`SELECT blob4 AS key, ${ONE} AS clicks ${links(30)} AND blob4 != '' GROUP BY key ORDER BY clicks DESC`, token),
    query(`SELECT blob5 AS key, SUM(_sample_interval) AS clicks ${kindIs('search-miss')} GROUP BY key HAVING clicks >= 3 ORDER BY clicks DESC LIMIT 20`, token),
    query(`SELECT 'all' AS key, SUM(_sample_interval) AS clicks ${kindIs('install')}`, token),
    query(`SELECT 'all' AS key, SUM(_sample_interval) AS clicks ${kindIs('app-open')}`, token),
    query(`SELECT blob4 AS key, SUM(_sample_interval) AS clicks ${kindIs('preview')} GROUP BY key ORDER BY clicks DESC`, token),
  ]);
  const whole = (rows) => rows.map((r) => ({ ...r, clicks: Math.round(r.clicks) }));
  const totals = { week: Math.round(tw?.clicks ?? 0), prevWeek: Math.round(tp?.clicks ?? 0), month: Math.round(tm?.clicks ?? 0) };
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
  const report =
    renderHeadline({ week: tWeek, prevWeek: tPrev, month: tMonth, days: tDays, clicks: totals.week, prevClicks: totals.prevWeek }) +
    '\n' +
    renderTraffic({ days: tDays, pages: tPages, referrers, devices: tDevices }) +
    '\n' +
    renderReport({ week, month, kinds: whole(kinds), totals }, groupNames(path.resolve(import.meta.dirname, '..'))) +
    '\n' +
    renderSignals({ where: whole(where), misses, installs: installs?.clicks ?? 0, opens: opens?.clicks ?? 0, previews });
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report);
}
