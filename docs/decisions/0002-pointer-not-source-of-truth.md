# 2. The site is a pointer, not the source of truth

Status: accepted (product rule in AGENTS.md, added in 53bb009)

## Context

Every event already has a home: the group's Meetup page or website. That is
where people RSVP, where the organizer edits details, and where changes and
cancellations show up first. A second copy that people act on would drift
from the original.

## Decision

DSM Tech Events lists events and links out. Each event links to its own
page, and people sign up there. The site does not offer calendar exports
(`.ics`), feeds, sign-up forms or its own per-event pages. The Add page says
the same thing to organizers: "We link to your Meetup page or site, and
people sign up there, not here."

## Consequences

- No accounts, no forms and no user data to look after.
- A wrong detail is fixed at the source and shows up at the next refresh.
- Feature requests for exports, feeds or event pages are out of scope; the
  answer is to subscribe to the group's own calendar.
- The outbound links matter a lot, so they are checked weekly
  (`scripts/check-links.mjs`).
