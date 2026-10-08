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

test('parseFeed throws on an empty feed for a group that had events coming up', () => {
  const empty = fixture('meetup-feed-empty.ics');
  assert.throws(() => parseFeed(empty, group, { slug: 'iadnug', now, hadUpcoming: 2 }), /no upcoming events, but the last run had 2/);
  assert.deepEqual(parseFeed(empty, group, { slug: 'iadnug', now }), [], 'a group with nothing scheduled before stays quiet');
});

test('parseEventsPage reads venue, photo, RSVPs and the group logo', () => {
  const { logo, events, members, pastCount, lastMet } = parseEventsPage(fixture('meetup-events-page.html'), 'iadnug');
  assert.equal(logo, 'https://secure.meetupstatic.com/photos/event/a/b/600_111.jpeg');
  assert.equal(members, 1543);
  assert.equal(pastCount, 120, 'the all-time PAST count, not the dated 10-event window');
  assert.equal(lastMet, '2026-09-15T23:00:00.000Z', 'the newest PAST event; the later cancelled one does not count');

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

test('parseEventsPage finds the group even when the URL differs in case', () => {
  assert.equal(parseEventsPage(fixture('meetup-events-page.html'), 'IADNUG').members, 1543);
});

test('parseEventsPage throws when the page has no entry for the group', () => {
  assert.throws(() => parseEventsPage(fixture('meetup-events-page.html'), 'some-other-group'), /no Group entry for some-other-group/);
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
  assert.equal(upcoming[0].title, '.NET@Noon - Build a Voice Agent', "the feed's title wins over the page's");
  assert.deepEqual(recent.map((e) => e.id), ['iadnug-299999990'], 'cancelled and older-than-cutoff events are left out');
});

test('mergeCache keeps past events, lets fresh copies win, and keeps fetchedAt when nothing changed', () => {
  const past = { id: 'g-1', title: 'Old', start: '2026-09-01T23:00:00.000Z', end: '2026-09-02T01:00:00.000Z' };
  const tooOld = { id: 'g-0', title: 'Ancient', start: '2026-01-01T23:00:00.000Z', end: '2026-01-02T01:00:00.000Z' };
  const next = { id: 'g-2', title: 'Next', start: '2026-10-20T23:00:00.000Z', end: '2026-10-21T01:00:00.000Z' };
  const previous = { fetchedAt: '2026-10-06T10:20:00.000Z', logo: 'logo.jpg', events: [past, next] };

  const same = mergeCache(previous, { events: [next], logo: null }, { now, cutoff, fetchedAt: 'NOW' });
  assert.equal(same.fetchedAt, '2026-10-06T10:20:00.000Z', 'unchanged data keeps its timestamp');
  assert.deepEqual(same.events.map((e) => e.id), ['g-1', 'g-2'], 'past events within 90 days are carried forward');
  assert.equal(same.logo, 'logo.jpg', 'previous logo is kept if the fetch found none');

  const aged = mergeCache({ ...previous, events: [tooOld, past, next] }, { events: [next] }, { now, cutoff, fetchedAt: 'NOW' });
  assert.deepEqual(aged.events.map((e) => e.id), ['g-1', 'g-2'], 'events older than 90 days drop off');
  assert.equal(aged.fetchedAt, 'NOW');

  const renamed = mergeCache(previous, { events: [{ ...next, title: 'Next (room change)', status: 'ACTIVE' }] }, { now, cutoff, fetchedAt: 'NOW' });
  assert.equal(renamed.fetchedAt, 'NOW');
  assert.equal(renamed.events.at(-1).title, 'Next (room change)');
  assert.ok(!('status' in renamed.events.at(-1)), 'Meetup status is not stored');
});

test('mergeCache keeps the page details of upcoming events when the page read failed', () => {
  const feedCopy = { id: 'g-2', sourceId: '2', title: 'Next', start: '2026-10-20T23:00:00.000Z', end: '2026-10-21T01:00:00.000Z', allDay: false, url: 'https://www.meetup.com/g/events/2/', description: 'feed text', venue: 'feed location' };
  const enriched = { ...feedCopy, description: 'page text', venue: 'Source Allies', address: '4501 NW Urbandale Dr, Urbandale', online: false, hybrid: false, image: 'photo.jpg', going: 12 };
  const previous = { fetchedAt: 'THEN', logo: 'logo.jpg', members: 300, events: [enriched] };

  const failed = mergeCache(previous, { events: [{ ...feedCopy }], logo: null, pageFailed: true }, { now, cutoff, fetchedAt: 'NOW' });
  assert.equal(JSON.stringify(failed), JSON.stringify(previous), 'byte-identical: nothing lost, fetchedAt unchanged');

  const retitled = mergeCache(previous, { events: [{ ...feedCopy, title: 'Renamed' }], pageFailed: true }, { now, cutoff, fetchedAt: 'NOW' });
  assert.equal(retitled.events[0].title, 'Renamed', 'the feed still wins for the title');
  assert.equal(retitled.events[0].going, 12);

  const plainFeed = mergeCache(previous, { events: [{ ...feedCopy }] }, { now, cutoff, fetchedAt: 'NOW' });
  assert.equal(plainFeed.events[0].venue, 'feed location', 'without a page failure the fresh copy wins');
});

test('mergeCache drops the old enriched flag without moving fetchedAt', () => {
  const next = { id: 'g-2', title: 'Next', start: '2026-10-20T23:00:00.000Z', end: '2026-10-21T01:00:00.000Z' };
  const merged = mergeCache({ fetchedAt: 'THEN', logo: null, events: [next] }, { events: [next] }, { now, cutoff, fetchedAt: 'NOW' });
  assert.equal(merged.fetchedAt, 'THEN');
  assert.ok(!('enriched' in merged));
});

test('formatAddress and cleanDescription', () => {
  assert.equal(formatAddress({ address: '801 Grand Ave, USA', city: 'Des Moines' }), '801 Grand Ave, Des Moines');
  assert.equal(formatAddress({ address: '801 Grand Ave, Des Moines', city: 'Des Moines' }), '801 Grand Ave, Des Moines');
  assert.equal(formatAddress({ address: '4501 NW Urbandale Dr', city: 'Urbandale' }), '4501 NW Urbandale Dr, Urbandale', 'street named after the city');
  assert.equal(formatAddress({ city: 'Ankeny' }), 'Ankeny');
  assert.equal(formatAddress({ address: '801 Grand Ave', city: null }), '801 Grand Ave', 'a venue with no city');
  assert.equal(formatAddress({ address: '801 Grand Ave' }), '801 Grand Ave');
  assert.equal(formatAddress(null), null);
  assert.equal(cleanDescription('Pyowa\r\nHello', 'Pyowa'), 'Hello');
  assert.equal(cleanDescription('Hello', 'Pyowa'), 'Hello');
});

test('mergeCache keeps group facts and leaves them out when unknown', () => {
  const previous = { fetchedAt: 'THEN', logo: null, members: 300, events: [] };
  assert.equal(mergeCache(previous, { events: [] }, { now, cutoff, fetchedAt: 'NOW' }).fetchedAt, 'THEN', 'a missing fact keeps the old one');
  assert.ok(!('pastCount' in mergeCache({ events: [] }, { events: [] }, { now, cutoff })));
  const facts = mergeCache({ events: [], members: 300 }, { events: [], members: 326, pastCount: 19 }, { now, cutoff });
  assert.deepEqual([facts.members, facts.pastCount], [326, 19]);
  assert.ok(!('lastMet' in facts), 'lastMet is left out when unknown, like the others');
  assert.equal(mergeCache({ events: [], lastMet: '2024-08-28T23:00:00.000Z' }, { events: [], enriched: false }, { now, cutoff }).lastMet, '2024-08-28T23:00:00.000Z', 'kept when the page fails');
});

test('enrich drops an upcoming event the page says is cancelled, and ignores missing page fields', () => {
  const upcoming = [
    { id: 'g-1', sourceId: '1', title: 'Kept', start: '2026-10-20T23:00:00Z', end: '2026-10-21T01:00:00Z' },
    { id: 'g-2', sourceId: '2', title: 'Called off', start: '2026-10-21T23:00:00Z', end: '2026-10-22T01:00:00Z' },
  ];
  const details = { events: new Map([
    ['1', { title: undefined, going: 7, venue: undefined, status: 'ACTIVE', end: '2026-10-21T01:00:00Z' }],
    ['2', { status: 'CANCELLED', end: '2026-10-22T01:00:00Z' }],
  ]) };
  enrich(upcoming, details, { id: 'g' }, { now, cutoff });
  assert.deepEqual(upcoming.map((e) => e.title), ['Kept']);
  assert.equal(upcoming[0].going, 7);
  assert.ok(!('venue' in upcoming[0]), 'an undefined page field does not overwrite');
});
