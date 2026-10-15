// An Eventbrite organizer page (eventbrite.com/o/…) server-renders the
// organizer's upcoming events into its Next.js data: every published event,
// not just the ones they add to a collection. Times are local wall-clock
// (start_date "2026-11-09", start_time "09:00:00") in the event's timezone.
// The page has no past events; once an event ends the cache carries it.
// It is the group's `eventbrite:`; their `website:` stays their own site.
import { localToUtc } from '../../src/lib/time.mjs';
import { site } from '../../src/lib/site.mjs';
import { decode } from './html.mjs';

export default async function eventbrite(group, { get }) {
  const html = await get(group.eventbrite);
  const json = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  const page = json && JSON.parse(json).props?.pageProps;
  // An empty list is normal (nothing scheduled); a missing or failed one isn't.
  if (!Array.isArray(page?.upcomingEvents) || page.upcomingEventsFailed) throw new Error(`no event list on ${group.eventbrite}`);

  return page.upcomingEvents.filter((e) => !e.is_cancelled && !e.hide_start_date).map((e) => {
    if (!e.id || !e.name || !e.url || !e.start_date || !e.start_time) throw new Error(`unreadable event in ${group.eventbrite}`);
    if (e.timezone !== site.timeZone) throw new Error(`event ${e.id} is in ${e.timezone}, not ${site.timeZone}`);
    const at = (date, time) => localToUtc(date, time.slice(0, 5));
    const online = Boolean(e.is_online_event);
    return {
      id: `${group.id}-${e.id}`,
      sourceId: String(e.id),
      title: decode(e.name).trim(),
      start: at(e.start_date, e.start_time),
      end: at(e.end_date ?? e.start_date, e.end_time ?? e.start_time),
      allDay: false,
      url: e.url,
      description: decode(e.summary ?? '').trim(),
      ...(online ? { venue: 'Online', address: null, online } : place(e.primary_venue)),
      image: e.image?.url ?? null,
    };
  });
}

// "West48" + "1601 48th St, West Des Moines, IA 50266". A venue named with
// its own street ("7200 NW 62nd Ave") has no name worth showing beside it.
function place(venue) {
  const a = venue?.address ?? {};
  const region = [a.region, a.postal_code].filter(Boolean).join(' ');
  const address = [a.address_1, a.address_2, a.city, region].filter(Boolean).join(', ') || null;
  const name = decode(venue?.name ?? '').trim();
  return { venue: name && !/^\d/.test(name) ? name : null, address };
}
