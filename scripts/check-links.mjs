// Checks the outbound links people click that can rot: each group's `meetup:`
// and `website:` in data/groups.yaml and each event's `url:` in
// data/events.yaml. (Meetup event links come from the feed four times a day,
// so they are not checked here.)
//
//   node scripts/check-links.mjs           print the results; exit 1 if any are broken
//   node scripts/check-links.mjs --issue   also keep ONE GitHub issue labeled
//                                          broken-link up to date (needs GH_TOKEN):
//                                          open it, update it, close it when all pass
//
// Run weekly by .github/workflows/links.yml with --issue.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';

const LABEL = 'broken-link';
const TITLE = 'Broken links on the site';
// Same as scripts/fetch-events.mjs, so site owners see one polite visitor.
const UA = 'dsmtechevents/1.0 (+https://dsmtechevents.com; community event calendar, fetched four times a day)';
const TIMEOUT = 20_000;

// Every link to check, once each, with where it came from. Pure.
export function collectLinks(groups, events) {
  const links = new Map();
  const add = (url, where) => {
    if (url && !links.has(url)) links.set(url, where);
  };
  for (const g of groups ?? []) {
    add(g.meetup, `groups.yaml: ${g.id} meetup`);
    add(g.website, `groups.yaml: ${g.id} website`);
  }
  for (const e of events ?? []) add(e.url, `events.yaml: ${e.title}`);
  return [...links].map(([url, where]) => ({ url, where }));
}

// What to do with the one broken-link issue, given this run's results
// ([{ url, where, ok, detail }]) and the open broken-link issues
// ([{ number, title }]). Pure, so it can be tested.
export function planIssue(results, openIssues, runUrl = '') {
  const broken = results.filter((r) => !r.ok);
  const open = openIssues.find((i) => i.title === TITLE);
  if (!broken.length) {
    return open
      ? { type: 'close', number: open.number, comment: `Fixed: every link passed the latest check.${runUrl ? ` (${runUrl})` : ''}` }
      : { type: 'none' };
  }
  const body = [
    `The weekly link check couldn't open ${broken.length === 1 ? 'this link' : `these ${broken.length} links`} (each was tried twice):`,
    '',
    ...broken.map((r) => `- ${r.url} (${r.where}): ${r.detail}`),
    '',
    'Fix or remove each one in `data/groups.yaml` or `data/events.yaml`. A site that is only down for a day can be left alone; this issue updates on the next run and closes itself once every link works.',
    ...(runUrl ? ['', `Last run: ${runUrl}`] : []),
  ].join('\n');
  return open ? { type: 'update', number: open.number, body } : { type: 'open', title: TITLE, body };
}

// One try: HEAD, then GET if HEAD fails or is refused (some sites answer
// HEAD with 403/405). Redirects are followed; 2xx and 3xx count as working.
async function tryOnce(url) {
  let last;
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, { method, redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(TIMEOUT) });
      await res.body?.cancel();
      if (res.status < 400) return { ok: true, detail: `${res.status}` };
      last = `${res.status} from ${method}`;
    } catch (err) {
      last = `${err.cause?.code ?? err.name}: ${err.message}`;
    }
  }
  return { ok: false, detail: last };
}

async function check(url) {
  const first = await tryOnce(url);
  if (first.ok) return first;
  await new Promise((r) => setTimeout(r, 5_000));
  return tryOnce(url);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(import.meta.dirname, '..');
  const read = (f) => YAML.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8')) ?? [];
  const links = collectLinks(read('groups.yaml'), read('events.yaml'));

  const results = [];
  for (const link of links) {
    const r = { ...link, ...(await check(link.url)) };
    console.log(`${r.ok ? '✓' : '✗'} ${r.url} (${r.where}): ${r.detail}`);
    results.push(r);
    await new Promise((res) => setTimeout(res, 500)); // be polite
  }
  const broken = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length} links checked, ${broken} broken.`);

  if (!process.argv.includes('--issue')) process.exit(broken ? 1 : 0);

  const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' });
  // The REST list, not `gh issue list` (search can miss a brand-new issue);
  // see scripts/source-issues.mjs.
  const open = JSON.parse(gh('api', '--paginate', `repos/{owner}/{repo}/issues?labels=${LABEL}&state=open&per_page=100`))
    .filter((i) => !i.pull_request)
    .map(({ number, title }) => ({ number, title }));
  const run = process.env.GITHUB_RUN_ID && `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const action = planIssue(results, open, run ?? '');
  console.log(`issue: ${action.type}${action.number ? ` #${action.number}` : ''}`);
  if (action.type === 'open') {
    gh('label', 'create', LABEL, '--color', 'fbca04', '--description', 'A link on the site no longer works', '--force');
    gh('issue', 'create', '--title', action.title, '--body', action.body, '--label', LABEL);
  }
  if (action.type === 'update') gh('issue', 'edit', String(action.number), '--body', action.body);
  if (action.type === 'close') gh('issue', 'close', String(action.number), '--comment', action.comment);
}
