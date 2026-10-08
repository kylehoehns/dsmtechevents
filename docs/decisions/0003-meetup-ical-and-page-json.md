# 3. Read Meetup's public iCal feed and page JSON, not its API

Status: accepted (since the first commit, 1230375)

## Context

Most groups are on Meetup. Meetup's API needs an OAuth client, which Meetup
only offers to paid Meetup Pro accounts. Every public group, though, has a
public iCal feed at `meetup.com/<group>/events/ical/`, and its `/events/`
page embeds JSON for its own scripts. The commit history does not record
the API being weighed; this records the choice as the code makes it.

## Decision

`scripts/fetch-events.mjs` treats the iCal feed as the source of truth for
upcoming events: title, time and link. The JSON in the events page only adds
venue, address, photo, RSVP count, description and recent past events
(`enrich()` in `scripts/sources/meetup.mjs`). No keys or accounts are
needed.

## Consequences

- Nothing to pay for and no secrets for the fetch.
- The page JSON is not a public API and can change without notice. When it
  does, the events still come in from the feed; only the extra details are
  missing, and a `source-broken` issue says so.
- Requests send a descriptive User-Agent and pause between groups to stay
  polite.
