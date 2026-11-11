import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localIso, eventJsonLd, toScript, addressParts } from '../src/lib/jsonld.mjs';

const byId = { cijug: { name: 'Central Iowa Java Users Group', meetupUrl: 'https://www.meetup.com/cijug/', logo: 'https://img/logo.jpeg' } };
const base = { title: 'Lightning Talks', url: 'https://www.meetup.com/cijug/events/1/', start: '2026-10-22T22:30:00.000Z', end: '2026-10-23T00:00:00.000Z', groupIds: ['cijug'] };

test('localIso writes Des Moines time with its offset', () => {
  assert.equal(localIso('2026-10-22T22:30:00.000Z'), '2026-10-22T17:30:00-05:00');
  assert.equal(localIso('2026-12-04T00:00:00.000Z'), '2026-12-03T18:00:00-06:00');
  assert.equal(localIso('2026-11-07T06:00:00.000Z', true), '2026-11-07');
});

test('an in-person event points at its Meetup page and full address', () => {
  const ld = eventJsonLd({ ...base, venue: 'Source Allies', address: '4501 NW Urbandale Dr, Urbandale', fullAddress: '4501 NW Urbandale Dr, Urbandale, IA 50322', description: 'Five  minute\ntalks.' }, byId);
  assert.equal(ld['@type'], 'Event');
  assert.equal(ld.url, base.url);
  assert.equal(ld.eventAttendanceMode, 'https://schema.org/OfflineEventAttendanceMode');
  assert.deepEqual(ld.location.address, { '@type': 'PostalAddress', streetAddress: '4501 NW Urbandale Dr', addressLocality: 'Urbandale', postalCode: '50322', addressRegion: 'IA', addressCountry: 'US' });
  assert.equal(ld.description, 'Five minute talks.');
  assert.deepEqual(ld.image, ['https://dsmtechevents.com/og-image-dark.png'], 'no photo: the site image, never the group logo');
  assert.deepEqual(ld.organizer, [{ '@type': 'Organization', name: 'Central Iowa Java Users Group', url: 'https://www.meetup.com/cijug/' }]);
});

test('online and hybrid events use a virtual location', () => {
  const online = eventJsonLd({ ...base, online: true, venue: 'Online' }, byId);
  assert.deepEqual(online.location, { '@type': 'VirtualLocation', url: base.url });
  assert.equal(online.eventAttendanceMode, 'https://schema.org/OnlineEventAttendanceMode');
  const hybrid = eventJsonLd({ ...base, hybrid: true, venue: 'Source Allies' }, byId);
  assert.equal(hybrid.location.length, 2);
  assert.equal(hybrid.eventAttendanceMode, 'https://schema.org/MixedEventAttendanceMode');
});

test('events with no location or link are left out', () => {
  assert.equal(eventJsonLd({ ...base, venue: null }, byId), null);
  assert.equal(eventJsonLd({ ...base, url: null, venue: 'X' }, byId), null);
});

test('a conference with no host group has no organizer', () => {
  const ld = eventJsonLd({ ...base, groupIds: [], venue: 'Convention Center', allDay: true }, byId);
  assert.ok(!('organizer' in ld));
  assert.equal(ld.startDate, '2026-10-22');
});

test('toScript keeps </script> in a description from closing the tag', () => {
  assert.ok(!toScript({ d: '</script><b>' }).includes('</script>'));
});

test('the description is plain text, without Markdown bold or heading marks', () => {
  const ld = eventJsonLd({ ...base, venue: 'Source Allies', description: '## Agenda\n**6:00** Pizza\n***\n# Speakers\nC# and **F#**' }, byId);
  assert.equal(ld.description, 'Agenda 6:00 Pizza Speakers C# and F#');
});

test('the image is the event photo when it has one', () => {
  const photo = { small: 'https://img/small.webp', large: 'https://img/large.webp' };
  const ld = eventJsonLd({ ...base, venue: 'Source Allies', image: 'https://img/600_1.jpeg', photo }, byId);
  assert.deepEqual(ld.image, ['https://img/600_1.jpeg']);
  // An image that is only the group's logo leaves photo unset (lib/data.mjs).
  const logo = eventJsonLd({ ...base, venue: 'Source Allies', image: 'https://img/logo.jpeg', photo: null }, byId);
  assert.deepEqual(logo.image, ['https://dsmtechevents.com/og-image-dark.png']);
});

test('addressParts reads the city and zip off the end of every address shape the sources send', () => {
  const cases = {
    '4501 NW Urbandale Dr, Urbandale': { streetAddress: '4501 NW Urbandale Dr', addressLocality: 'Urbandale' },
    '9131 Northpark Dr, Johnston, IA 50131': { streetAddress: '9131 Northpark Dr', addressLocality: 'Johnston', postalCode: '50131' },
    '22 9th Street, Des Moines, IA': { streetAddress: '22 9th Street', addressLocality: 'Des Moines' },
    '111 S 11th St, Ste 100, West Des Moines, IA 50265': { streetAddress: '111 S 11th St, Ste 100', addressLocality: 'West Des Moines', postalCode: '50265' },
    '220 SW 9th Street, Suite 150, Des Moines, IA, 50309': { streetAddress: '220 SW 9th Street, Suite 150', addressLocality: 'Des Moines', postalCode: '50309' },
    '750 Park Street, Des Moines IA 50309': { streetAddress: '750 Park Street', addressLocality: 'Des Moines', postalCode: '50309' },
    '555 17th Street,, Des Moines': { streetAddress: '555 17th Street', addressLocality: 'Des Moines' },
    'Ames, IA': { addressLocality: 'Ames' },
  };
  for (const [text, want] of Object.entries(cases)) assert.deepEqual(addressParts(text), want, text);
});

test("addressParts keeps an address it can't read whole, and an empty one empty", () => {
  assert.deepEqual(addressParts('130 E 3rd St Suite 202'), { streetAddress: '130 E 3rd St Suite 202' });
  assert.deepEqual(addressParts('111 S 11th St, Ste 100'), { streetAddress: '111 S 11th St, Ste 100' }, 'a suite is not a city');
  assert.deepEqual(addressParts(undefined), {});
});

test('a venue with no address gives only the region, not its name as a street', () => {
  const ld = eventJsonLd({ ...base, venue: 'Iowa Bankers Association' }, byId);
  assert.equal(ld.location.name, 'Iowa Bankers Association');
  assert.deepEqual(ld.location.address, { '@type': 'PostalAddress', addressRegion: 'IA', addressCountry: 'US' });
});
