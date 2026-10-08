import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localIso, eventJsonLd, toScript } from '../src/lib/jsonld.mjs';

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
  assert.equal(ld.location.address.streetAddress, '4501 NW Urbandale Dr, Urbandale, IA 50322');
  assert.equal(ld.description, 'Five minute talks.');
  assert.deepEqual(ld.image, ['https://img/logo.jpeg'], 'falls back to the group logo');
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
