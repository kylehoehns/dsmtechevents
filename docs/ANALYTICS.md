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
| `index1`  | group id, or `none`                                           |

Kinds: `rsvp` (the card's button), `title` (the card's title), `map` (the
venue), `poster` (a headliner's Tickets & info), `later` (a "Further out"
row), `past` (a "Recently" row), `meetup` and `website` (the Groups page).
A new kind has to be added to `KINDS` in the Worker too, or it is rejected.

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
