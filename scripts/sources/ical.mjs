// Reading iCal feeds (Meetup's, TAI's, any public calendar). The callers decide
// which events they want; this only parses and normalises.
import ical from 'node-ical';

// Every VEVENT in a feed. Throws if the response isn't a calendar at all (an
// error page, a login wall), so the caller keeps its last good data.
export function calendarEvents(ics, what = 'feed') {
  if (!ics.includes('BEGIN:VCALENDAR')) throw new Error(`${what} did not return a calendar`);
  return Object.values(ical.sync.parseICS(ics)).filter((e) => e.type === 'VEVENT');
}

// Not cancelled, and not over yet.
export const isUpcoming = (e, now) => e.status !== 'CANCELLED' && (e.end ?? e.start).getTime() >= now;

// Start, end and all-day in the shape the cache stores.
export const times = (e) => ({
  start: e.start.toISOString(),
  end: (e.end ?? e.start).toISOString(),
  allDay: e.datetype === 'date',
});

// When the event was put on the calendar, if the feed says (Meetup's do).
// mergeCache uses it to date events it has no record of seeing appear.
export const created = (e) => e.created?.toISOString();

// node-ical gives URL as a string or as { val }.
export const eventUrl = (e) => e.url?.val ?? e.url ?? null;
