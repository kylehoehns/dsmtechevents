// Which events get a full card in the home page's list, and which only get
// one in the card pool (/cards/), the file the calendar's day panel fetches
// its other cards from. index.astro and cards.astro both split this way, so
// between them every event has exactly one card.
import { dayKey } from './format.mjs';

export function splitEvents({ upcoming, past }, now = Date.now()) {
  const today = dayKey(now);
  // Full rows through the end of next month; anything later is a compact set list.
  const [ty, tm] = today.split('-').map(Number);
  const horizon = new Date(Date.UTC(ty, tm + 1, 0)).toISOString().slice(0, 10);
  const listed = upcoming.filter((e) => !e.repeat);
  const near = listed.filter((e) => dayKey(e.start) <= horizon);
  const far = listed.filter((e) => dayKey(e.start) > horizon);
  // Every event that doesn't get a full row in the list still needs a card
  // for the day panel.
  const pooled = [...upcoming.filter((e) => e.repeat), ...far, ...past];
  return { today, listed, near, far, pooled };
}
