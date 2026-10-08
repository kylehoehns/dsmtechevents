import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadData, shortAddress, topVenues } from '../src/lib/data.mjs';

const dataDir = fileURLToPath(new URL('./fixtures/data', import.meta.url));
const now = Date.parse('2026-10-07T17:00:00Z');
const data = loadData({ dataDir, now });
const find = (title) => data.events.find((e) => e.title === title);

test('events split into upcoming and past around "now"', () => {
  assert.deepEqual(data.past.map((e) => e.title), ['Spring recap']);
  assert.equal(data.upcoming[0].title, 'Hacktoberfest', 'upcoming is sorted by start');
});

test('a meetup posted by two groups shows once, with both hosts', () => {
  const joint = data.events.filter((e) => e.start === '2026-10-22T22:30:00.000Z');
  assert.equal(joint.length, 1);
  assert.deepEqual(joint[0].groupIds.sort(), ['cijug', 'iadnug']);
});

test('a photo is shown only when it is not just the group logo', () => {
  assert.equal(find('Hacktoberfest').photo, null, 'same photo id as the Web Geeks logo');
  assert.deepEqual(find('Joint Night: JVM vs CLR').photo, {
    small: 'https://secure.meetupstatic.com/photos/event/a/b/global_888.webp',
    large: 'https://secure.meetupstatic.com/photos/event/a/b/600_888.webp',
  }, 'Meetup photos get their small webp copies');
});

test('the full group name shows only when it adds something', () => {
  assert.equal(data.byId.webgeeks.showFullName, false, '"Web Geeks" vs "DSM Web Geeks"');
  assert.equal(data.byId.iadnug.showFullName, true, '"IADNUG" vs "Iowa .NET User Group"');
});

test('repeating meetups collapse into one row with a series summary', () => {
  const monthly = data.upcoming.filter((e) => e.title === 'Web Geeks Monthly Meeting');
  assert.equal(monthly.length, 3);
  assert.deepEqual(monthly[0].series, { count: 3, rule: 'Every 2nd Monday', until: 'Jan 2027' });
  assert.ok(monthly.slice(1).every((e) => e.repeat));
});

test('hand-added events use Des Moines time and span days', () => {
  const conf = find('Test Conf 2026');
  assert.equal(conf.start, '2026-10-15T13:00:00.000Z');
  assert.equal(conf.end, '2026-10-16T22:00:00.000Z');
  assert.equal(conf.multiDay, true);
  assert.equal(conf.featured, true);
  assert.equal(conf.address, '833 5th Ave');
});

test('groups know their next event, upcoming count and last event', () => {
  const g = data.byId.webgeeks;
  assert.equal(g.nextEvent.title, 'Hacktoberfest');
  assert.equal(g.upcomingCount, 2, 'Hacktoberfest + the monthly series, counted once like its row and chip');
  assert.equal(g.lastEvent.title, 'Spring recap');
  assert.equal(data.byId.cijug.logo, null);
  assert.equal(data.updatedAt, '2026-10-07T15:20:00.000Z', 'newest fetch time across groups');
});

test('shortAddress drops the Des Moines ending but keeps suburbs', () => {
  assert.equal(shortAddress('833 5th Ave, Des Moines, IA 50309'), '833 5th Ave');
  assert.equal(shortAddress('555 17th Street,, Des Moines'), '555 17th Street');
  assert.equal(shortAddress('111 S 11th St, Ste 100, West Des Moines, IA 50265'), '111 S 11th St, Ste 100, West Des Moines');
  assert.equal(shortAddress('9131 Northpark Dr, Johnston, IA 50131-1234'), '9131 Northpark Dr, Johnston');
  assert.equal(shortAddress('22 9th Street, Des Moines, IA'), '22 9th Street', 'no ZIP');
  assert.equal(shortAddress('1055 SW Prairie Trail Pkwy, Ankeny, Iowa'), '1055 SW Prairie Trail Pkwy, Ankeny');
  assert.equal(shortAddress(undefined), null);
});

test('two spellings of one venue at the same street address count as one venue', () => {
  const keys = data.events.filter((e) => e.address?.startsWith('4501 NW Urbandale')).map((e) => e.venueKey);
  assert.ok(keys.length >= 2);
  assert.equal(new Set(keys).size, 1);
});

test('topVenues counts in-person events per venue, under its most common spelling', () => {
  const v = topVenues(data.events);
  assert.equal(v[0].name, 'Source Allies');
  assert.ok(v.every((x) => x.name !== 'Online'));
  assert.deepEqual(topVenues([
    { venue: 'Big Hall', venueKey: '833 5th ave' }, { venue: 'Big Hall', venueKey: '833 5th ave' }, { venue: 'Big Hall Center', venueKey: '833 5th ave' },
    { venue: 'Online', online: true, venueKey: 'online' },
  ]), [{ name: 'Big Hall', count: 3 }]);
});
