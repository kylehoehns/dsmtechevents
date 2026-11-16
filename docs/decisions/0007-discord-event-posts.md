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

- A new event gets a post: who, when (Des Moines time), where, the group's
  whole write-up (formatted as the site formats it, so it reads in one
  place), and the RSVP link to the group's own page. A series' repeats are
  skipped, as the site folds them. (The write-up was a 300-character excerpt
  until 2026-11-14.)
- A post is edited when its event changes. A placeholder replaced by the
  real event (same hosts, same day, new id) keeps its post.
- A post is closed (archived and locked) 3 days after its event ends.
- A post whose upcoming event disappears is marked cancelled and closed.
- One pinned, locked post, "Coming up", lists the next two weeks soonest
  first, each line linking to its event's post. Discord sorts a forum only
  by newest post or latest reply, so a reply on an event six weeks out would
  otherwise sit above tonight's. (Added 2026-11-13. Since 2026-11-16 it's a
  pink V2 card like the event posts, a heading per day and a line per event
  whose title links to its post: channel mentions were cut short and
  repeated each date.)

Members reply in posts but can't start them. Each post ends with a small
"ref" line naming its event, so the posts are their own record and nothing
else is stored.

How a post looks (2026-11-14, chosen from real mock-ups in a private
forum): one Components V2 message. A V2 post shows no text in the forum's
list, only its title and its first image, so the title carries the facts
("Tue Nov 17 · 5:30p–7:30p · DSM AI · The Distributed Graph…", only the
event's name ever cut). The message is one card: one picture (the event's
photo, else the group's logo, never both, since the list shows the first
and the gallery view shows all of them side by side), the place with a
Directions button beside it, the write-up, and "Starts in 3 days" beside a
"Details on <site>" button. The ref line sits under the card. A V2
message can't be turned back, and older posts can't be turned into one, so
the switch made every open post again (none had replies yet).

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
