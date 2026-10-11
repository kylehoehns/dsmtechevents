# 4. The refresh pushes with a deploy key to get past main's ruleset

Status: accepted (commit fd151a1, 2026-10-07)

## Context

`main` has a ruleset: changes come through a pull request, the
`test-and-build` check must pass, and force pushes and deletions are blocked.
The refresh workflow has to push new event data to `main` four times a day
with nobody watching. A personal repo cannot list the GitHub Actions app as
a bypass actor (GitHub answers 422, "must be part of the owner
organization"), but deploy keys can bypass a ruleset.

## Decision

`refresh.yml` pushes over SSH with `REFRESH_DEPLOY_KEY`, a deploy key with
write access. The workflow's own `GITHUB_TOKEN` only needs `contents: read`
(plus `issues: write` for source-broken issues).

Since 2026-10-11 the key lives in its own job. The `refresh` job runs
`npm ci`, the fetch and the build, which is third-party code, and passes on
only `data/cache` and `data/archive` as an artifact. The `publish` job starts
on a fresh runner, runs nothing from npm, and is the only place the key is
written to disk, just for the pull and push. In one job, an earlier step
could plant a git hook or config, a line in `$GITHUB_ENV` or `$GITHUB_PATH`,
or a process that reads the push step's environment.

## Consequences

- People still go through pull requests; only the data refresh skips them.
- The refresh runs `npm run build` before it commits, so data that breaks
  the build never reaches `main`.
- It runs `git pull --rebase` before pushing, and tries up to 3 times, so a
  PR merged mid-run neither loses that run's data nor fails the run.
- The key must be rotated by hand; the README has the steps.
