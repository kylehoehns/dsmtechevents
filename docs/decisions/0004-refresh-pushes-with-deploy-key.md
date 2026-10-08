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

`refresh.yml` checks out with `ssh-key: ${{ secrets.REFRESH_DEPLOY_KEY }}`, a
deploy key with write access, so its `git push` goes over SSH as that key.
The workflow's own `GITHUB_TOKEN` only needs `contents: read` (plus
`issues: write` for source-broken issues).

## Consequences

- People still go through pull requests; only the data refresh skips them.
- The refresh runs `npm run build` before it commits, so data that breaks
  the build never reaches `main`.
- It runs `git pull --rebase` before pushing, so a PR merged mid-run does
  not lose that run's data.
- The key must be rotated by hand; the README has the steps.
