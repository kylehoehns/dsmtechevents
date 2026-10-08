# 1. A static site rebuilt from committed data

Status: accepted (commit 49b15db, 2026-10-07)

## Context

The first version ran on Cloudflare Pages. A separate cron Worker called a
Pages deploy hook every night, and the build itself fetched events from
Meetup. That meant every deploy depended on the network at build time, and
Meetup might block Cloudflare's build machines.

## Decision

The site is plain static HTML with no server and no API. Events are fetched
only by a GitHub Action (`.github/workflows/refresh.yml`), which commits the
results to `data/cache/`. `astro build` reads only what is in the repo, and
Cloudflare Workers Builds deploys `main` as static assets.

## Consequences

- What is live is exactly what is in git. Any commit can be rebuilt and gives
  the same site.
- A data refresh is a commit, and the commit is what deploys. The history
  has many "Refresh event data" commits.
- Cache files have to stay byte-stable when nothing changed, or every
  refresh would commit and deploy.
- Anything time-sensitive on the page has to be re-checked in the browser,
  because the HTML can be hours old.
