# Analytics

Two things are counted, neither with cookies or anything that identifies a
visitor.

## Page views

Cloudflare Web Analytics, which Cloudflare injects for the domain. See the
dashboard: **Analytics & Logs → Web Analytics → dsmtechevents.com**.

## Outbound clicks

How many people the site sends to each group's page. Every outbound link we
want counted carries `data-click="<kind>"`; one listener in
`src/layouts/Layout.astro` sends a small beacon to `/api/click` with that kind,
the groups from the nearest `data-groups`, and the event from the nearest
`data-id`. The Worker (`worker/index.js`) writes one data point per host group
(a joint meetup counts for each) to Workers Analytics Engine, dataset
`dsmtechevents_clicks`:

| field     | holds                                                         |
|-----------|---------------------------------------------------------------|
| `blob1`   | kind (below)                                                  |
| `blob2`   | group id (`pyowa`), empty for a conference with no group      |
| `blob3`   | event id (`pyowa-316749553`), empty for group links           |
| `blob4`   | where: the part of the site for a click (below), the app for a preview |
| `blob5`   | the term, for a search that found nothing; empty otherwise   |
| `double1` | this point's share of the click: 1 ÷ the number of host groups |
| `index1`  | group id, or `none`                                           |

Per-group counts sum the points; totals sum `double1`, so a joint meetup's
click is one click, not one per host. (Points from before 2026-10-15 have no
`double1` and count whole.)

Kinds: `rsvp` (the card's button), `title` (the card's title), `map` (the
venue), `poster` (a headliner's Tickets & info), `later` (a "Further out"
row), `past` (a "Recently" row), `meetup` and `website` (the Groups page).
A new kind has to be added to `KINDS` in the Worker too, or it is rejected.

Where (`blob4`), worked out in the listener: `search` or `group-filter` when
the list is filtered, otherwise `calendar`, `headliners`, `recent`,
`groups-page`, or the list section the link sits in (`this-week`,
`next-week`, `further`, `later` for the month sections), else `other`. The
Worker keeps only those values.

### The site's own signals

The same dataset holds a few non-click points, kept out of the click counts:

- `search-miss`: a search on the home page that found nothing at all, coming
  up or past, sent by `app.js` two seconds after the typing settles, once
  per term per page. Only the term, lowercased, and only if it's 2 to 30
  letters, digits, spaces or `.#+-` (the Worker checks again), so a pasted
  sentence or an email address is never sent. Searches that find something
  aren't recorded. The report lists terms seen 3 or more times in 30 days,
  so one person's one-off never shows. This is the evidence decision 0006
  asks for before topic tags come back.
- `install` (the browser's `appinstalled`) and `app-open` (a page load in the
  installed app that didn't come from one of its own pages): openings, not
  people.
- `preview`: written by the Worker, not the page. Apps that draw a link
  preview (Slack, iMessage, Teams, LinkedIn…) fetch `/og-image-dark.png`; a
  person's browser looking at the page never does. The Worker runs first on
  that path (`wrangler.jsonc`), keeps just the app's name from its bot's user
  agent (`previewer()`), and serves the image as before. Apps cache
  previews, so this counts fewer than the real shares; search engines aren't counted.

Nothing else is stored: no IP address, user agent, referrer or cookie.

### Abuse

- Cloudflare's network DDoS protection sits in front of everything.
- Only `/api/*` runs the Worker. A flood that used up the daily Worker
  quota would make clicks fail (429) for the rest of the day; the pages
  themselves are static files and keep serving.
- The Worker refuses posts whose `Origin` isn't the site itself (403),
  bodies over 1 KB (413), and more than 30 posts a minute from one address
  (429, the `CLICK_LIMIT` binding). The address is only an in-memory
  counter key and is never stored.
- The rate limit is loose: Cloudflare counts per location and catches up
  late, so a fast burst gets mostly through (tested at launch: 4 of 150
  rapid posts got 429). It stops a sustained flood, not a burst. For a hard
  cap, add a WAF rate-limiting rule for `/api/click` on the
  dsmtechevents.com zone (the free plan includes one).
- Someone scripting fake clicks slowly can still nudge the counts. Treat
  them as a rough signal, not an audit.

### The weekly site report

Every Monday, `.github/workflows/site-report.yml` runs
`scripts/site-report.mjs` and writes a summary to that run's page
(**Actions → site report → the latest run**): visits and page views with the
week-on-week change, visits per day, top pages, where visits come from and
phone vs computer (Cloudflare Web Analytics), then the outbound clicks above
(per group for 7 and 30 days, which links get used). The run page is public,
because the repo is, so groups are listed A to Z with no bars and no list of
the most-clicked listings: the report never ranks one group against another. Run it any
time with `gh workflow run site-report.yml`. It needs a repository secret
`CF_ANALYTICS_TOKEN`: a Cloudflare API token with **Account Analytics: Read**.

The report opens with a one-row summary (visits, page views and clicks out,
each with ▲/▼ against the week before, and a small chart of visits per day).
Run pages don't allow styles or images, so the charts are text: bars made of
`█` blocks and the `▁▃█` line. Long lists are folded and open on a click. The
helpers are in `scripts/report-md.mjs`.

The same run ends with a **Lighthouse** table (`scripts/lighthouse-report.mjs`):
phone and desktop scores and load times for the home page, calendar view,
groups page and TV screen, each score marked 🟢 90+, 🟠 50–89 or 🔴 below 50
the way Lighthouse marks them, the lowest score called out above the table, and
last week's change shown only when it is bigger
than normal run-to-run noise.

Between those, a **Google Search** section (`scripts/search-report.mjs`): for
the last full week Google has settled (its numbers run about three days
late), how many times the site showed up in results, clicks, click rate and
average position against the week before, then the top searches and the
pages people reached. It reads Search Console with a Google Cloud service
account whose JSON key is the repository secret `GSC_SERVICE_ACCOUNT`; the
account is a **Restricted** (read-only) user on the Search Console property,
and needs the Search Console API turned on in its Cloud project. Without the
secret the section just says it isn't set up.

### Querying

Analytics Engine has a SQL API. Make an API token with the **Account
Analytics: Read** permission, then:

```sh
ACCOUNT=d62c22c8dbe2380b540a92580ef4de5c
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/analytics_engine/sql" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -d "SELECT blob2 AS group, blob1 AS kind, SUM(_sample_interval) AS clicks
      FROM dsmtechevents_clicks
      WHERE timestamp > NOW() - INTERVAL '30' DAY
      GROUP BY group, kind
      ORDER BY clicks DESC"
```

Launch-day test clicks have `blob3 = 'smoke-test'`; add
`AND blob3 != 'smoke-test'` to leave them out.

`SUM(_sample_interval)` rather than `COUNT()`: Analytics Engine may sample at
high volume, and this corrects for it. Data is kept for three months.

Useful questions: RSVP clicks per group this month (`WHERE blob1 = 'rsvp'`),
the most-clicked events (`GROUP BY blob3`), whether anyone uses the map links.
