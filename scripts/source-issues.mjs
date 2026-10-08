// Turns fetch-report.json (written by fetch-events.mjs) into GitHub issues, so
// a source that stops working gets noticed:
//   - a group that failed gets one open issue, titled "Source broken: <name> (<id>)"
//   - later runs that still fail update that issue instead of opening another
//   - once the group fetches cleanly again, its issue is closed
// Run by the refresh workflow with GH_TOKEN set. `--dry-run` prints the plan.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export const LABEL = 'source-broken';
const tag = (id) => `(${id})`;

// Decide what to do, given this run's report and the open source-broken issues
// ([{ number, title }]). Pure, so it can be tested.
export function planIssues(report, openIssues, runUrl = '') {
  const issueFor = (id) => openIssues.find((i) => i.title.endsWith(tag(id)));
  const actions = [];
  for (const p of report.problems) {
    const what = p.kind === 'details'
      ? 'Its events still came in, but the extra details (venue, photo, RSVP count) from its Meetup events page did not.'
      : 'Its events could not be read, so the site is showing what it had from the last good run.';
    const body = [
      `The scheduled refresh couldn't fully read **${p.name}** (\`${p.id}\`). ${what}`,
      '',
      '```',
      p.message,
      '```',
      '',
      `Other groups are unaffected. This issue closes itself once a refresh reads ${p.id} cleanly again.`,
      ...(runUrl ? ['', `Last failed run: ${runUrl}`] : []),
    ].join('\n');
    const open = issueFor(p.id);
    actions.push(open
      ? { type: 'update', number: open.number, id: p.id, body }
      : { type: 'open', id: p.id, title: `Source broken: ${p.name} ${tag(p.id)}`, body });
  }
  for (const id of report.ok) {
    const open = issueFor(id);
    if (open) actions.push({ type: 'close', number: open.number, id, comment: `Fixed: the latest refresh read ${id} cleanly.${runUrl ? ` (${runUrl})` : ''}` });
  }
  return actions;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes('--dry-run');
  const report = JSON.parse(fs.readFileSync('fetch-report.json', 'utf8'));
  const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' });
  // The REST list, not `gh issue list`: that one goes through search, which
  // can miss an issue opened seconds earlier and so open a duplicate.
  const open = JSON.parse(gh('api', '--paginate', `repos/{owner}/{repo}/issues?labels=${LABEL}&state=open&per_page=100`))
    .filter((i) => !i.pull_request)
    .map(({ number, title }) => ({ number, title }));
  const run = process.env.GITHUB_RUN_ID && `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const actions = planIssues(report, open, run ?? '');
  if (!actions.length) console.log('Every source is fine; no issues to change.');
  if (!dryRun && actions.some((a) => a.type === 'open')) {
    gh('label', 'create', LABEL, '--color', 'd73a4a', '--description', 'A group\'s events could not be fetched', '--force');
  }
  for (const a of actions) {
    console.log(`${dryRun ? '[dry run] ' : ''}${a.type} ${a.id}${a.number ? ` #${a.number}` : ''}`);
    if (dryRun) continue;
    try {
      if (a.type === 'open') gh('issue', 'create', '--title', a.title, '--body', a.body, '--label', LABEL);
      if (a.type === 'update') gh('issue', 'edit', String(a.number), '--body', a.body);
      if (a.type === 'close') gh('issue', 'close', String(a.number), '--comment', a.comment);
    } catch (err) {
      // e.g. closing one that was closed by hand; carry on with the rest
      console.warn(`  couldn't ${a.type} ${a.id}: ${err.message.split('\n')[0]}`);
    }
  }
}
