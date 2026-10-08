# DSM Tech Events

https://dsmtechevents.com

One place to see every upcoming Des Moines tech meetup, user group and
conference. A static site on Cloudflare, refreshed four times a day from each group's Meetup
calendar (and a couple of groups' own websites).

## How it works

1. `scripts/fetch-events.mjs` reads `data/groups.yaml`. For each group it pulls
   the public Meetup iCal feed (`meetup.com/<group>/events/ical/`), plus venue,
   photo and RSVP count from the group's events page. Results land in
   `data/cache/<group>.json`.
2. If a feed fails, that group's previous cache file is kept, so a bad run
   never empties the site. The cache is committed so builds work even if
   Meetup is unreachable.
3. `astro build` merges the cache with the hand-added events in
   `data/events.yaml` and writes static HTML to `dist/`.
4. A GitHub Action (`.github/workflows/refresh.yml`) runs the fetch four
   times a day (5:20am, 10:20am, 2:20pm and 6:20pm Des Moines summer time) and
   commits `data/cache/` when anything changed. It also commits once a day no
   matter what (`data/cache/built-on.txt`), because the "This week" headings
   are set at build time. That push is what deploys the site, so the live site
   always matches what's in git.

## Adding things

**A group:** add an entry to `data/groups.yaml`. Paste the Meetup URL into
`meetup:`, and the group's own site into `website:` if it has one. Groups not
on Meetup can use `ical:` with any public calendar feed. Groups with no feed
at all can get a small reader in `scripts/sources/` that pulls events from
their website (see `secdsm.mjs` and `pmi-chapter.mjs`), named with `source:`.
Anything else gets added by hand.

**A one-off event** (conference, joint meetup): add it to `data/events.yaml`.
`featured: true` pins it to the banner at the top.

## Local development

```sh
npm install
npm run fetch    # pull fresh events into data/cache/
npm run dev      # http://localhost:4321
npm run build    # what Cloudflare runs (no fetching, just the committed data)
```

## Deploying

Cloudflare Workers static assets, connected to `main` with Workers Builds.
`wrangler.jsonc` holds the config and lists the dashboard build settings.
Every push to `main` deploys, including the data refresh commits.

To refresh events right away instead of waiting for the next scheduled run:

```sh
gh workflow run refresh.yml
```
