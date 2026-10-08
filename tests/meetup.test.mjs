import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { meetupSlug, meetupPhoto } from '../src/lib/meetup.mjs';
import { parseFeed, parseEventsPage, enrich, mergeCache, formatAddress, cleanDescription } from '../scripts/sources/meetup.mjs';

const fixture = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const group = { id: 'iadnug', name: 'Iowa .NET User Group' };
const now = Date.parse('2026-10-07T17:00:00Z');
const cutoff = now - 90 * 86_400_000;

test('meetupSlug accepts a URL or a bare slug', () => {
  assert.equal(meetupSlug('https://www.meetup.com/central-iowa-java-users-group/'), 'central-iowa-java-users-group');
  assert.equal(meetupSlug('https://www.meetup.com/dsmsql/events/?type=past'), 'dsmsql');
  assert.equal(meetupSlug('pyowa'), 'pyowa');
  assert.equal(meetupSlug(undefined), null);
});

test('meetupPhoto picks the small and medium webp versions', () => {
  assert.deepEqual(meetupPhoto('https://secure.meetupstatic.com/photos/event/a/b/600_12345.jpeg'), {
    small: 'https://secure.meetupstatic.com/photos/event/a/b/global_12345.webp',
    large: 'https://secure.meetupstatic.com/photos/event/a/b/600_12345.webp',
  });
  assert.equal(meetupPhoto('https://example.com/flyer.png'), null);
  assert.equal(meetupPhoto(null), null);
});

test('parseFeed keeps upcoming, confirmed events', () => {
  const events = parseFeed(fixture('meetup-feed.ics'), group, { slug: 'iadnug', now });
  assert.equal(events.length, 1, 'cancelled and past events are dropped');
  const [e] = events;
  assert.equal(e.id, 'iadnug-300000001');
  assert.equal(e.sourceId, '300000001');
  assert.equal(e.title, '.NET@Noon - Build a Voice Agent');
  assert.equal(e.start, '2026-10-08T17:00:00.000Z');
  assert.equal(e.url, 'https://www.meetup.com/iadnug/events/300000001/');
  assert.equal(e.description, 'Bring your laptop.\n\nPizza provided.', 'group name line is stripped');
});

test('parseFeed rejects something that is not a calendar', () => {
  assert.throws(() => parseFeed('<html>Rate limited</html>', group, { now }), /did not return a calendar/);
});

test('parseEventsPage reads venue, photo, RSVPs and the group logo', () => {
  const { logo, events } = parseEventsPage(fixture('meetup-events-page.html'), 'iadnug');
  assert.equal(logo, 'https://secure.meetupstatic.com/photos/event/a/b/600_111.jpeg');

  const online = events.get('300000001');
  assert.equal(online.venue, 'Online');
  assert.equal(online.online, true);
  assert.equal(online.address, null);
  assert.equal(online.going, 20);
  assert.equal(online.image, 'https://secure.meetupstatic.com/photos/event/c/d/600_222.jpeg');

  const inPerson = events.get('299999990');
  assert.equal(inPerson.title, "Last month's talk");
  assert.equal(inPerson.venue, 'Source Allies');
  assert.equal(inPerson.address, '4501 NW Urbandale Dr, Urbandale');
  assert.equal(inPerson.start, '2026-09-15T23:00:00.000Z');

  assert.equal(events.get('299999991').hybrid, true);
});

test('parseEventsPage fails loudly when Meetup changes the page', () => {
  assert.throws(() => parseEventsPage('<html></html>', 'iadnug'), /no __NEXT_DATA__/);
  assert.throws(() => parseEventsPage('<script id="__NEXT_DATA__">{"props":{}}</script>', 'iadnug'), /no Apollo state/);
});

test('enrich fills feed events from the page and adds recent past events', () => {
  const upcoming = parseFeed(fixture('meetup-feed.ics'), group, { slug: 'iadnug', now });
  const details = parseEventsPage(fixture('meetup-events-page.html'), 'iadnug');
  const recent = enrich(upcoming, details, group, { now, cutoff });

  assert.equal(upcoming[0].going, 20);
  assert.equal(upcoming[0].venue, 'Online');
  assert.deepEqual(recent.map((e) => e.id), ['iadnug-299999990'], 'cancelled and older-than-cutoff events are left out');
});

test('mergeCache keeps past events, lets fresh copies win, and keeps fetchedAt when nothing changed', () => {
  const past = { id: 'g-1', title: 'Old', start: '2026-09-01T23:00:00.000Z', end: '2026-09-02T01:00:00.000Z' };
  const tooOld = { id: 'g-0', title: 'Ancient', start: '2026-01-01T23:00:00.000Z', end: '2026-01-02T01:00:00.000Z' };
  const next = { id: 'g-2', title: 'Next', start: '2026-10-20T23:00:00.000Z', end: '2026-10-21T01:00:00.000Z' };
  const previous = { fetchedAt: '2026-10-06T10:20:00.000Z', logo: 'logo.jpg', enriched: true, events: [past, next] };

  const same = mergeCache(previous, { events: [next], logo: null, enriched: true }, { now, cutoff, fetchedAt: 'NOW' });
  assert.equal(same.fetchedAt, '2026-10-06T10:20:00.000Z', 'unchanged data keeps its timestamp');
  assert.deepEqual(same.events.map((e) => e.id), ['g-1', 'g-2'], 'past events within 90 days are carried forward');
  assert.equal(same.logo, 'logo.jpg', 'previous logo is kept if the fetch found none');

  const aged = mergeCache({ ...previous, events: [tooOld, past, next] }, { events: [next], enriched: true }, { now, cutoff, fetchedAt: 'NOW' });
  assert.deepEqual(aged.events.map((e) => e.id), ['g-1', 'g-2'], 'events older than 90 days drop off');
  assert.equal(aged.fetchedAt, 'NOW');

  const renamed = mergeCache(previous, { events: [{ ...next, title: 'Next (room change)', status: 'ACTIVE' }], enriched: true }, { now, cutoff, fetchedAt: 'NOW' });
  assert.equal(renamed.fetchedAt, 'NOW');
  assert.equal(renamed.events.at(-1).title, 'Next (room change)');
  assert.ok(!('status' in renamed.events.at(-1)), 'Meetup status is not stored');
});

test('formatAddress and cleanDescription', () => {
  assert.equal(formatAddress({ address: '801 Grand Ave, USA', city: 'Des Moines' }), '801 Grand Ave, Des Moines');
  assert.equal(formatAddress({ address: '801 Grand Ave, Des Moines', city: 'Des Moines' }), '801 Grand Ave, Des Moines');
  assert.equal(formatAddress({ address: '4501 NW Urbandale Dr', city: 'Urbandale' }), '4501 NW Urbandale Dr, Urbandale', 'street named after the city');
  assert.equal(formatAddress({ city: 'Ankeny' }), 'Ankeny');
  assert.equal(formatAddress(null), null);
  assert.equal(cleanDescription('Pyowa\r\nHello', 'Pyowa'), 'Hello');
  assert.equal(cleanDescription('Hello', 'Pyowa'), 'Hello');
});
