# Tech DSM

https://techdsm.com

One place to see every upcoming Des Moines tech meetup, user group and
conference. A static site on Cloudflare Pages, rebuilt every night from each
group's Meetup calendar.

## How it works

1. `scripts/fetch-events.mjs` reads `data/groups.yaml`. For each group it pulls
   the public Meetup iCal feed (`meetup.com/<group>/events/ical/`), plus venue,
   photo and RSVP count from the group's events page. Results land in
   `data/cache/<group>.json`.
2. If a feed fails, that group's previous cache file is kept, so a bad night
   never empties the site. The cache is committed so builds work even if
   Meetup is unreachable.
3. `astro build` merges the cache with the hand-added events in
   `data/events.yaml` and writes static HTML to `dist/`.

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
npm run fetch          # pull fresh events into data/cache/
npm run dev            # http://localhost:4321
npm run build          # fetch + build, what Cloudflare runs
npm run build:offline  # build from the cache only
```

## Deploying to Cloudflare

**Site (Pages):** Workers & Pages → Create → Pages → connect this repo.
Build command `npm run build`, output directory `dist`. Every push to `main`
deploys.

**Nightly refresh:** Pages project → Settings → Builds → Deploy hooks → add one
and copy its URL. Then:

```sh
cd workers/rebuild
npx wrangler deploy
npx wrangler secret put DEPLOY_HOOK_URL   # paste the hook URL
```

The Worker calls the hook at 10:00 UTC daily. You can also `curl -X POST` the
hook URL any time to refresh right away.
