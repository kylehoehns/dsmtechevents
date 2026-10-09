# Contributing

Thanks for helping keep the Des Moines tech calendar complete. There are two
ways in: as an organizer who wants a group or event listed, and as a
developer changing the site.

## Organizers: get your group or event listed

**What fits:** public, community, tech. That means tech-focused events
(software, data, security, product, design, hardware and so on), open to
anyone, in the Des Moines area or online and run by a local group. No
members-only or invite-only events.

**How to ask**, whichever is easier:

- Email hello@dsmtechevents.com. The [For organizers page](https://dsmtechevents.com/organizers/)
  lists what to send and has a fill-in email.
- Open an issue with the
  [Add a group or event](https://github.com/kylehoehns/dsmtechevents/issues/new?template=add-listing.yml) form.

**For a group on Meetup, the link is all we need.** The site reads every
group's public Meetup calendar every few hours, so new events show up on
their own and fixes you make on Meetup carry over. Groups not on Meetup can
send a website or public calendar (`.ics`) link. For a one-off event, send
the date, time, venue and an RSVP link.

People RSVP on your page, not ours. The site only links to it.

Something wrong with a listing? Use the
[listing form](https://github.com/kylehoehns/dsmtechevents/issues/new?template=fix-listing.yml), or fix it on
Meetup and it will update at the next refresh.

## Developers

The [README](README.md) explains how the site works, and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has a diagram. The house rules
and known traps are in [AGENTS.md](AGENTS.md); read it before your first
change. Why things are the way they are: [docs/decisions/](docs/decisions/).

### Setup

You need Node 26 or newer, the version in `.nvmrc` (CI and Cloudflare's build use it too).

```sh
npm install
npm run fetch    # pull fresh events into data/cache/
npm run dev      # http://localhost:4321
npm test         # unit tests, on saved fixtures, no network
npm run build    # tests, then astro build, then scripts/check-dist.mjs
npm run spell    # spelling in page copy and docs (not event text)
npm run check    # lint, knip, typecheck and spell: run before a PR
```

The spelling check runs in CI next to the build. It covers the words we write
(`src/pages`, `src/components`, `src/layouts` and the Markdown docs), never the
event titles and descriptions that come from the groups. If it flags a real
word, like a group's name, add it to `words` in `cspell.json`.

`npm run check` runs the spelling check plus three code checks. `lint` is
ESLint with correctness rules only (unused variables, undefined names,
`==`), not style. `knip` finds files, exports and dependencies nothing
uses; delete them rather than keeping them "just in case". `typecheck`
(`astro check`) catches a wrong prop or a misspelled field in `.astro` and
`.ts` files. CI also lints the workflows with actionlint and zizmor. When a
check is wrong about something deliberate, switch it off as narrowly as you
can (one rule, one file) in `eslint.config.mjs` or `knip.jsonc`, with a
comment that says why.

### Browser tests

```sh
npx playwright install chromium   # once
npm run test:e2e
```

Playwright drives the built site in Chromium at desktop (1280×900) and phone
(390×844) sizes, with axe accessibility checks on every page in light and
dark. Any console error fails a test.

The live data changes four times a day, so these tests never use it. They
build their own copy of the site into `dist-e2e/` from
`tests/e2e/fixtures/data/` (`DSM_DATA_DIR`), as if it were Wednesday
Oct 14 2026, 9am (`FAKE_NOW` with `scripts/fake-now.mjs`), and set the
browser's clock to the same moment. `playwright.config.mjs` does the build;
`tests/e2e/fixtures.mjs` sets the clock. To test a new date-dependent case,
add an event to the fixture data.

### Making a change

1. Branch from `main` and open a pull request. Nobody pushes to `main`
   directly.
2. Two checks run: `test-and-build` (`npm run build` and `npm run check`) and
   `e2e` (the browser tests below). A PR can merge only when both are green.
3. Each PR branch gets a preview at
   `<branch>-dsmtechevents.kyhoehns.workers.dev`. Merging deploys to
   dsmtechevents.com. Never deploy from your machine.

### Don't commit a local fetch

`data/cache/` and `data/archive/` are owned by the refresh workflow, which
commits them four times a day. After `npm run fetch`, throw the changes
away:

```sh
git checkout data/cache data/archive
```

The one exception: when you add a new group, commit its new
`data/cache/<id>.json` so it shows up before the next refresh.

### Adding a group or event by PR

- A group: add an entry to `data/groups.yaml` (the comment at the top lists
  the fields).
- A one-off event: add it to `data/events.yaml`.

### Adding a source reader

For a group with no Meetup page and no calendar feed, write a reader that
pulls events from its website:

1. Add `scripts/sources/<name>.mjs` exporting
   `async (group, { get }) => events[]`. `iowans-of-things.mjs` is a small
   example.
2. Throw when the page doesn't look as expected. That keeps the last good
   events and opens a `source-broken` issue, instead of the group quietly
   going empty.
3. Register it in `SOURCES` in `scripts/fetch-events.mjs`, and set
   `source: <name>` on the group in `data/groups.yaml`.
4. Save a trimmed copy of the page in `tests/fixtures/` and add a test in
   `tests/sources.test.mjs`: one that reads the fixture, and one that proves
   the throw.
