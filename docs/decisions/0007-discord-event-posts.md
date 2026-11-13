# 7. Every event gets a post in the community Discord's #events forum

Status: accepted (2026-11-13)

## Context

[Decision 6](0006-ideas-turned-down.md) turned down auto-posting events
elsewhere, for the same reasons as feeds and digests: a copied time or place
goes stale, a post can stand in for the RSVP the group needs, and the site
already says it once.

The community Discord (`infra/discord`) changes two of those. The bot that
makes a post can also edit it, so a post doesn't go stale: the sync runs
after every refresh and makes each post match the site. And a Discord post
is a place the site can't offer: somewhere to say you're going, find a
carpool or talk about the talk afterwards. The owner chose to try it, for
every event on the site.

## Decision

`#events` is a forum in the Discord's Start Here section with one post per
upcoming event. `scripts/discord-events.mjs` keeps it in step after each
refresh:

- A new event gets a post: who, when (Des Moines time), where, and the RSVP
  link to the group's own page. A series' repeats are skipped, as the site
  folds them.
- A post is edited when its event changes. A placeholder replaced by the
  real event (same hosts, same day, new id) keeps its post.
- A post is closed (archived and locked) 3 days after its event ends.
- A post whose upcoming event disappears is marked cancelled and closed.

Members reply in posts but can't start them. Each post ends with a small
"ref" line naming its event, so the posts are their own record and nothing
else is stored.

The sync runs in its own job of `refresh.yml`. It holds the Discord bot's
token, so like `publish` ([decision 4](0004-refresh-pushes-with-deploy-key.md))
it installs nothing from npm: the `refresh` job writes `discord-events.json`,
and this job runs the repo's own script on it with plain Node.

## Consequences

- The RSVP still happens on the group's page: every post links there, and
  none copies the RSVP count.
- Discord being down fails only this job; the site's data still publishes.
- Feeds, digests and auto-posting anywhere else stay turned down
  (decision 6).
