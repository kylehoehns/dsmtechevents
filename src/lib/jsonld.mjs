// schema.org structured data, so search engines can list our events and name
// the site. Every event points at its own Meetup (or conference) page: we're
// a pointer to where people sign up, never the sign-up itself.
import { site } from './site.mjs';
import { plainText } from './format.mjs';

const offsetFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: site.timeZone, hourCycle: 'h23', timeZoneName: 'longOffset',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

// "2026-10-22T17:30:00-05:00" in Des Moines time, or "2026-11-07" for all-day.
export function localIso(iso, allDay = false) {
  const p = Object.fromEntries(offsetFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return allDay ? date : `${date}T${p.hour}:${p.minute}:${p.second}${p.timeZoneName.slice(3) || '+00:00'}`;
}

// The parts of an address as the sources write it: "street, city" with an
// optional "IA" and zip at the end ("4501 NW Urbandale Dr, Urbandale",
// "22 9th Street, Des Moines, IA", "220 SW 9th Street, Suite 150, Des Moines,
// IA, 50309", "750 Park Street, Des Moines IA 50309"). Only the ending is
// read; anything that doesn't end that way stays whole as the street. The
// text people see on the site is untouched.
export function addressParts(text) {
  const parts = (text ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return {};
  let postalCode;
  if (/^\d{5}$/.test(parts.at(-1))) postalCode = parts.pop();
  const state = /^(?:(.+?)\s+)?IA(?:\s+(\d{5}))?$/.exec(parts.at(-1) ?? '');
  let city;
  if (state) {
    parts.pop();
    postalCode ??= state[2];
    city = state[1] ?? parts.pop();
  } else if (parts.length > 1) {
    city = parts.pop();
  }
  // A "city" with digits is a suite or street ("Ste 100"): don't guess.
  if (!city || /\d/.test(city)) return { streetAddress: text.trim() };
  return { ...(parts.length && { streetAddress: parts.join(', ') }), addressLocality: city, ...(postalCode && { postalCode }) };
}

// One Event, or null when we can't say where it is (search engines require a
// location, and some sources don't give one).
export function eventJsonLd(e, byId) {
  if (!e.url) return null;
  // No address: just the region, rather than the venue's name posing as a street.
  const place = e.venue && e.venue !== 'Online' && {
    '@type': 'Place',
    name: e.venue,
    address: { '@type': 'PostalAddress', ...addressParts(e.fullAddress ?? e.address), addressRegion: 'IA', addressCountry: 'US' },
  };
  const online = { '@type': 'VirtualLocation', url: e.url };
  const location = e.online ? online : e.hybrid && place ? [place, online] : place;
  if (!location) return null;

  const hosts = e.groupIds.map((id) => byId[id]).filter(Boolean);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: e.title,
    url: e.url,
    startDate: localIso(e.start, e.allDay),
    endDate: localIso(e.end, e.allDay),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: `https://schema.org/${e.online ? 'Online' : e.hybrid ? 'Mixed' : 'Offline'}EventAttendanceMode`,
    location,
    // The event's own photo; never the group's logo, which for some groups is
    // a site icon. e.photo is only set for a real photo (lib/data.mjs).
    image: [e.photo ? e.image : new URL('/og-image-dark.png', site.url).href],
  };
  if (e.description) ld.description = plainText(e.description).slice(0, 300);
  if (hosts.length) ld.organizer = hosts.map((g) => ({ '@type': 'Organization', name: g.name, url: g.meetupUrl ?? g.website }));
  return ld;
}

export const websiteJsonLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: site.name,
  alternateName: 'DSM Tech',
  url: new URL('/', site.url).href,
});

// For set:html inside <script type="application/ld+json">: keep "</script>"
// in an event description from closing the tag.
export const toScript = (data) => JSON.stringify(data).replace(/</g, '\\u003c');
