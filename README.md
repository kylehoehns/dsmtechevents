# DSM Tech Events

https://dsmtechevents.com

One place to see every upcoming Des Moines tech meetup, user group and
conference. A static site on Cloudflare, refreshed four times a day from each
group's Meetup calendar or, for groups not on Meetup, their own website.

## How it works

1. `scripts/fetch-events.mjs` reads `data/groups.yaml`. For a Meetup group it
   pulls the public iCal feed (`meetup.com/<group>/events/ical/`), plus venue,
   photo and RSVP count from the group's events page. Groups with `source:`
   use a reader in `scripts/sources/` for their own site (SecDSM, PMI, TAI's
   TechBrews, Iowans of Things). Results land in `data/cache/<group>.json`.
2. If a feed fails, that group's previous cache file is kept, so a bad run
   never empties the site, and the other groups refresh as usual. The refresh
   workflow then opens a GitHub issue labeled `source-broken` for that group
   (`scripts/source-issues.mjs`): one per group, updated rather than duplicated
   on later runs, and closed automatically once the group fetches cleanly. The
   cache is committed so builds work even if a source is unreachable.
3. `astro build` merges the cache with the hand-added events in
   `data/events.yaml` and writes static HTML to `dist/`.
4. A GitHub Action (`.github/workflows/refresh.yml`) runs the fetch four
   times a day (5:20am, 10:20am, 2:20pm and 6:20pm Des Moines summer time) and
   commits `data/cache/` when anything changed. It also commits once a day no
   matter what (`data/cache/built-on.txt`), because the "This week" headings
   are set at build time. That push is what deploys the site, so the live site
   always matches what's in git.

## Adding things

Not into YAML? The site's [Add your group or event](https://dsmtechevents.com/add/) page
explains what fits and has the email address (hello@dsmtechevents.com).
Otherwise, open a pull request:

**A group:** add an entry to `data/groups.yaml`. Paste the Meetup URL into
`meetup:`, and the group's own site into `website:` if it has one. Groups not
on Meetup can use `ical:` with any public calendar feed. Groups with no feed
at all can get a small reader in `scripts/sources/` that pulls events from
their website (see `scripts/sources/`; `iowans-of-things.mjs` is a small one),
named with `source:`. Each reader throws when the page doesn't look as
expected, and has a test against a saved copy in `tests/fixtures/`.
Anything else gets added by hand.

**A one-off event** (conference, joint meetup): add it to `data/events.yaml`.
`featured: true` makes it a headliner: a pink row in the list, and a poster at
the top (side rail on desktop) from 30 days out until it ends.

## Local development

```sh
npm install
npm run fetch    # pull fresh events into data/cache/
npm run dev      # http://localhost:4321
npm run build    # what Cloudflare runs (no fetching, just the committed data)
```

## Lobby TV

`/tv/` is a full-screen, self-running version for a screen at a coworking
space or meetup venue: a "Coming up" overview, then one poster per event in
the next three weeks with a QR code to its Meetup or conference page. It
reloads itself hourly to pick up new events. ← → step through slides, space
pauses. The About page mentions it; it's kept out of search.

## Tests

```sh
npm test
```

Node's built-in test runner, no extra packages. The tests in `tests/` cover the
parts that break quietly: Des Moines time zones and daylight saving, reading
Meetup's feed and events page, every website reader, merging with the
previous cache, and the build-time rules (joint meetups, repeating series,
hiding logo photos and repeated names, short addresses). They run on saved
fixtures in `tests/fixtures/`, never the network.

`npm run build` runs the tests first, so a failing test stops the build
everywhere it runs: the `ci` check on pull requests, Cloudflare's deploy, and
the event refresh. When a source's page changes, save a trimmed copy of the
new page as a fixture and update the reader until the test passes.

## Deploying

Cloudflare Workers static assets, connected to `main` with Workers Builds.
`wrangler.jsonc` holds the config and lists the dashboard build settings.
Every push to `main` deploys, including the data refresh commits.

`main` is protected by a GitHub ruleset: no direct pushes, no force pushes,
and pull requests merge only after the `ci` check (`test-and-build`) passes.
The refresh workflow is the one exception. It pushes event data with a deploy
key (secret `REFRESH_DEPLOY_KEY`), and the ruleset lets deploy keys bypass it.
To rotate the key, make a new one with `ssh-keygen -t ed25519`, add the public
half under Settings → Deploy keys with write access, and replace the secret.

To refresh events right away instead of waiting for the next scheduled run:

```sh
gh workflow run refresh.yml
```
