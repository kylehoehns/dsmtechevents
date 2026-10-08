// TechBrew, the Technology Association of Iowa's monthly public coffee
// meetup. TAI's site runs Sugar Calendar, which publishes an iCal feed per
// category; /events/calendar/techbrews/ics/ holds only TechBrews. The feed's
// LOCATION is just a street, so each upcoming event's own page is read for
// the venue name, city and a clean description.
//
// Only TechBrew is wanted from TAI (no roundtables, member events, awards or
// conferences), so titles must also match an allow-list. TechBrews outside
// the Des Moines metro are skipped, based on the venue's city.
import { toText } from './html.mjs';
import { calendarEvents, isUpcoming, times, eventUrl } from './ical.mjs';

const FEED = 'https://www.technologyiowa.org/events/calendar/techbrews/ics/';
const TECHBREW = /tech\s*brew/i;
const METRO = ['Des Moines', 'West Des Moines', 'Urbandale', 'Clive', 'Johnston', 'Ankeny', 'Altoona', 'Grimes', 'Waukee', 'Windsor Heights', 'Pleasant Hill'];

export default async function taiTechbrew(group, { get, now = Date.now() }) {
  const all = calendarEvents(await get(FEED), 'TAI TechBrew feed');
  // TAI's feed always holds past TechBrews too; an empty one means it broke.
  if (!all.length) throw new Error('TAI TechBrew feed has no events');
  const upcoming = all.filter((e) => isUpcoming(e, now) && TECHBREW.test(e.summary ?? ''));

  const events = [];
  for (const e of upcoming) {
    const url = eventUrl(e);
    if (!url) throw new Error(`TechBrew "${e.summary}" has no URL`);
    const page = readEventPage(await get(url), url);
    if (!METRO.includes(page.city)) continue;
    const sourceId = /\/events\/([^/?#]+)\/?$/.exec(url)?.[1] ?? e.uid;
    events.push({
      id: `${group.id}-${sourceId}`,
      sourceId,
      title: e.summary.trim(),
      ...times(e),
      url,
      description: page.description,
      venue: page.venue,
      address: page.address,
    });
  }
  return events;
}

// Venue, "street, City." and the body text of a Sugar Calendar event page.
function readEventPage(html, url) {
  const row = (name) => new RegExp(`sc-frontend-single-event__details__${name} [\\s\\S]*?__details__val">([\\s\\S]*?)</div>`).exec(html)?.[1];
  const venueHtml = row('venue');
  const locationHtml = row('location');
  if (venueHtml == null || locationHtml == null) throw new Error(`no venue/location on ${url}`);

  const location = toText(locationHtml.replace(/<a [^>]*>More info<\/a>/i, '')).replace(/\.$/, '');
  const city = location.includes(',') ? location.split(',').pop().trim() : null;

  const body = /<!--end \.sc_event_details-->([\s\S]*?)(?:<div class="icon_social_holder"|<\/article>)/.exec(html)?.[1] ?? '';
  const description = toText(body.replace(/<iframe[\s\S]*?<\/iframe>/gi, '').replace(/<\/(p|li|ul|h\d)>/gi, '$&\n'))
    .replace(/\s*Register (Now|Today)[:!]?\s*$/i, '')
    .trim().slice(0, 2000);
  return { venue: toText(venueHtml) || null, city, address: location ? `${location}, IA` : null, description };
}
