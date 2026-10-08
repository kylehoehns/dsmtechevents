// A weekly summary of outbound clicks (see docs/ANALYTICS.md): which groups
// the site sends people to, which events, and which kinds of links get used.
// Written as Markdown to the GitHub Actions job summary, so it shows on the
// workflow run's page; run locally, it prints to the terminal.
//
//   CF_ANALYTICS_TOKEN=... node scripts/click-report.mjs
//
// The token needs Cloudflare's "Account Analytics: Read" permission. Run
// weekly by .github/workflows/click-report.yml.
import fs from 'node:fs';
import path from 'node:path';
import { loadData } from '../src/lib/data.mjs';

const ACCOUNT = 'd62c22c8dbe2380b540a92580ef4de5c';
const DATASET = 'dsmtechevents_clicks';
const KIND_NAMES = {
  rsvp: 'RSVP button', title: 'Event title', map: 'Map link', poster: 'Headliner poster',
  later: '"Further out" row', past: '"Recently" row', meetup: 'Groups page: Meetup', website: 'Groups page: website',
};

// Pure: query results in, Markdown out. rows are { key, clicks } with clicks a number.
export function renderReport({ week, month, kinds, events }, { groupNames = {}, eventTitles = {} } = {}) {
  const total = (rows) => rows.reduce((n, r) => n + r.clicks, 0);
  const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map((_, i) => (i ? '---:' : '---')).join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
  const groupName = (id) => (id ? groupNames[id] ?? id : 'No group (conference / community event)');
  const weekBy = Object.fromEntries(week.map((r) => [r.key, r.clicks]));
  const lines = [
    '# Outbound clicks',
    '',
    `**${total(week)}** clicks in the last 7 days, **${total(month)}** in the last 30.`,
    'Each click on a joint meetup counts once for every host.',
    '',
    '## By group',
    '',
    month.length ? table(['Group', 'Last 7 days', 'Last 30 days'], month.map((r) => [groupName(r.key), weekBy[r.key] ?? 0, r.clicks])) : '_No clicks yet._',
    '',
    '## Top events, last 30 days',
    '',
    events.length ? table(['Event', 'Clicks'], events.map((r) => [eventTitles[r.key] ?? r.key ?? '(group link)', r.clicks])) : '_No event clicks yet._',
    '',
    '## Which links get used, last 30 days',
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
  const report = renderReport({ week, month, kinds, events }, names(path.resolve(import.meta.dirname, '..')));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report);
}
