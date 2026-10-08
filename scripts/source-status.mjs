// data/cache/status.json: which groups' sources failed on the latest refresh,
// and since which day, for the public /status/ page. fetch-report.json has
// the same facts but isn't committed, and the deploy builds from git.
//
// Only failing groups are listed ({} when all is well), and a failure keeps
// the day it started, so the file changes only when a source breaks, breaks
// differently, or recovers. Like the cache files, a quiet refresh leaves it alone.
import { dayKey } from '../src/lib/format.mjs';

// previous: the last status.json ({} if none). report: this run's
// fetch-report.json ({ ok, problems: [{ id, kind }] }).
export function sourceStatus(previous, report, now) {
  const status = {};
  for (const { id, kind } of report.problems) {
    const before = previous[id];
    status[id] = { kind, since: before?.kind === kind ? before.since : dayKey(now) };
  }
  return status;
}
