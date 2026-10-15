// An Eventbrite collection page (eventbrite.com/cc/…) carries its events as a
// schema.org ItemList of Events in JSON-LD: name, url, startDate/endDate with
// their UTC offset, a one-line summary, a photo and the Place. The collection
// is curated by the organizer, so it lists only what they add to it. It is
// the group's `eventbrite:`; their `website:` stays their own site.
import { decode } from './html.mjs';

export default async function eventbrite(group, { get }) {
  const html = await get(group.eventbrite);
  const list = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .find((d) => d['@type'] === 'ItemList');
  if (!list) throw new Error(`no event list on ${group.eventbrite}`);

  return list.itemListElement.map(({ item: e }) => {
    const sourceId = /-(\d+)\/?$/.exec(e.url ?? '')?.[1];
    if (e['@type'] !== 'Event' || !sourceId || !e.name || !e.startDate) throw new Error(`unreadable event in ${group.eventbrite}`);
    const online = e.eventAttendanceMode === 'https://schema.org/OnlineEventAttendanceMode';
    return {
      id: `${group.id}-${sourceId}`,
      sourceId,
      title: decode(e.name).trim(),
      start: new Date(e.startDate).toISOString(),
      end: new Date(e.endDate ?? e.startDate).toISOString(),
      allDay: false,
      url: e.url,
      description: decode(e.description ?? '').trim(),
      ...(online ? { venue: 'Online', address: null, online } : place(e.location)),
      image: e.image ?? null,
    };
  });
}

// "West48" + "1601 48th St, West Des Moines, IA 50266". A Place named with
// its own street ("7200 NW 62nd Ave") has no name worth showing beside it.
function place(location) {
  const a = location?.address ?? {};
  const region = [a.addressRegion, a.postalCode].filter(Boolean).join(' ');
  const address = [a.streetAddress, a.addressLocality, region].filter(Boolean).join(', ') || null;
  const name = decode(location?.name ?? '').trim();
  return { venue: name && !/^\d/.test(name) ? name : null, address };
}
