# 5. One shared format.mjs for build and browser date logic

Status: accepted (commit b45d9de, 2026-10-08)

## Context

The Today / Tonight / Tomorrow / Happening now tag was worked out in four
places with different rules. `EventCard` said "Today" on day two of a
conference while `app.js` said "Happening now", so the text changed as the
page loaded. The TV page used "now + 24 hours" for tomorrow, which is a day
off across a daylight saving change. Posters printed "1 days out", and five
files hard-coded `America/Chicago`.

## Decision

`src/lib/format.mjs` holds the date logic, built on `site.timeZone`:
`whenLabel()`, `countdown()`, `lastDay()`, day math and formatters. The
Astro build, `src/scripts/app.js` and the TV page all import it. The build
prints a label and the browser re-checks it with the same function.

## Consequences

- One place to fix a date rule, with tests in `tests/format.test.mjs`
  (including day two of a conference and the night clocks fall back).
- `format.mjs` ships to the browser, so it can't import anything
  Node-only (today it imports only `site.mjs`).
- New date code goes in `format.mjs` (or `time.mjs` for local-to-UTC),
  not in a component.
