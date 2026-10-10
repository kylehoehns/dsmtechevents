# 6. Ideas turned down, and what would reopen them

Status: accepted (2026-10-09)

## Context

The same feature ideas keep coming up, from people and from AI agents
reviewing the repo, because most event sites have them. Each was weighed
for this site and turned down, mostly because of three rules in AGENTS.md:
the site is a **pointer, not the source of truth** (people RSVP on the
group's page, which organizers need for headcount; see
[decision 2](0002-pointer-not-source-of-truth.md)), it stays **hands-off**
(nothing hand-kept), and it **says each thing once**. Feeds and digests
also work against the site's own point: a feed carries one group's next
meetup, while a visit shows the headliner conferences, a group that's back
after a quiet year, and everything else on this week. How often an idea is
suggested isn't evidence people want it; what reopens one is listed below.

## Decision

| Idea | Why not | What would reopen it |
|---|---|---|
| Calendar feed (ICS/webcal), per event "add to calendar", per-group or per-topic feeds | Copies of times go stale on people's calendars and skip the RSVP the group needs. Linking to a group's own Meetup feed doesn't help either: it skips the RSVP just the same, and the Meetup link is already on every card. | Organizers asking for it |
| Weekly digest (email, RSS, RSS-to-email) | A feed in a nicer wrapper; same reasons as above. | Organizers asking for it |
| Auto-posting "this week" to Bluesky, LinkedIn or X | Same as the digest. | Organizers asking for it |
| Speakers wanted / open calls for speakers | Needs hand-kept data; no evidence anyone would use it. | A group asking to list a CFP |
| Topic tags and filter chips | Needs a hand-kept topic list or guessing from scraped titles. Search covers it, past talks included. Chips were built and removed. | Search data showing people can't find topics |
| "New since your last visit" | Needs to remember each visitor in their browser; tried as an idea and turned down by the owner. (Not the same as the "New" tag on an event posted in the last day, which is the same for everyone and comes from the refresh.) | Not planned |
| A /week/ share link with a this-week preview image | Duplicates the home page; Slack and Messages cache previews, so last week's image sticks; no sign people share links. | The weekly report showing traffic from shared links |
| Open-nights planner / clash checker | Dropped by the owner; "check the calendar for clashes" on /organizers/ covers it. | Organizers asking for it |
| Venue pages or notes (parking, which door), a "rooms that have hosted" list | Hand-kept notes; the automatic list needs venue names from different groups to match, and they don't. | Not planned |
| Per-event pages | The group's own page is the event page. | Not planned |
| Accounts, sign-ups, notifications | No accounts, by design. | Not planned |
| "Free" labels or "it's all free" | Can't be confirmed for every group. A hand-added event that really is free (Iowa Code Camp) can say so in its own description. | Not planned |
| Cleaning up or normalizing text scraped from groups | Means hard-coded per-source checks. Gross text stays gross; only tiny generic Markdown rules in `formatDescription`. | Not planned |
| New groups (West DEV Moines, Salesforce, BSides…) | Owner's call for now. | The owner adding them |
| Page and tab animations (view transitions) | Built and removed: cross-page ones were uneven, in-page ones swallowed quick clicks. | Not planned |
| An MCP server, agent skill or llms.txt | Agents read the plain HTML fine; nobody would wire it up. | AI tools starting to fetch llms.txt on their own |
| A personal bio on /about/ | Felt out of place. | Not planned |
| A "may be out of date" banner | The footer's last-updated time covers it; the refresh failing emails the owner. | Not planned |

## Consequences

- A proposal for any of these starts from this table: what's changed since,
  against the "what would reopen it" column.
- Planned, not turned down: a Year in Review page from the archive, in
  December.
