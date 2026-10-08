import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadData, shortAddress, sameNight } from '../src/lib/data.mjs';

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
  assert.equal(conf.headliner, true);
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

test('the old featured: key fails loudly instead of quietly un-pinking a conference', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsm-'));
  cpSync(dataDir, dir, { recursive: true });
  writeFileSync(path.join(dir, 'events.yaml'), '- title: Old Conf\n  start: 2026-11-01\n  featured: true\n');
  assert.throws(() => loadData({ dataDir: dir, now }), /now headliner/);
});

test('a joint meetup titled differently by each host is still one event', () => {
  const base = { start: '2026-10-20T22:30:00.000Z', address: '801 Grand Ave, Des Moines', venue: 'F&G' };
  const a = { ...base, title: 'Joint night - JVM vs. CLR', groupIds: ['cijug'] };
  assert.ok(sameNight(a, { ...base, title: 'JVM vs CLR (with CIJUG)', groupIds: ['iadnug'] }));
  assert.ok(!sameNight(a, { ...base, title: 'Kubernetes office hours', groupIds: ['devops'] }), 'two different talks in one building');
  assert.ok(!sameNight(a, { ...base, start: '2026-10-21T22:30:00.000Z', title: 'JVM vs CLR', groupIds: ['iadnug'] }), 'different night');
  assert.ok(!sameNight(a, { ...base, address: '1 Main St', venue: 'Elsewhere', title: 'JVM vs CLR', groupIds: ['iadnug'] }), 'different place');
  assert.ok(!sameNight(a, { ...a }), 'the same group twice is the series logic, not this');
});

test('every hand-written event and group website link is a web address', async () => {
  const YAML = (await import('yaml')).default;
  const { readFileSync } = await import('node:fs');
  const real = (f) => YAML.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
  const links = [
    ...real('events.yaml').map((e) => [e.title, e.url]),
    ...real('groups.yaml').flatMap((g) => [[g.id, g.website], [g.id, g.ical]]),
  ].filter(([, url]) => url != null);
  assert.ok(links.length > 3);
  for (const [name, url] of links) assert.match(String(url), /^https?:\/\//i, `${name}: ${url}`);
});

test('a quiet group (nothing coming up, no meetup in a year) is hidden but kept', () => {
  const ux = data.byId.uxdsm;
  assert.equal(ux.quiet, true);
  assert.equal(ux.lastMet, '2024-08-28T23:00:00.000Z', 'from the Meetup page, via the cache');
  assert.ok(!data.groups.includes(ux), 'not listed');
  assert.ok(data.allGroups.includes(ux), 'still there for /status/');
  assert.equal(ux.returning, false);
});

test('a group that met recently but has nothing scheduled stays listed', () => {
  const azure = data.byId.azure;
  assert.equal(azure.lastMet, '2026-07-22T17:00:00.000Z', 'only the archive knows this one');
  assert.equal(azure.quiet, false);
  assert.ok(data.groups.includes(azure));
});

test('a quiet group that posts an event is listed and marked "Back!" on that event only', () => {
  const idpa = data.byId.idpa;
  assert.deepEqual([idpa.quiet, idpa.returning], [false, true]);
  assert.deepEqual(find('IDPA is back: SQL Server 2025').back, ['idpa']);
  assert.equal(find('IDPA November').back, undefined, 'not the one after');
  // Once that event is over, lastMet catches up and the tag goes away.
  const later = loadData({ dataDir, now: Date.parse('2026-10-28T12:00:00Z') });
  assert.equal(later.byId.idpa.returning, false);
});

test('an ordinary group is neither quiet nor returning', () => {
  const g = data.byId.webgeeks;
  assert.deepEqual([g.quiet, g.returning], [false, false]);
  assert.deepEqual(data.events.filter((e) => e.back).map((e) => e.title), ['IDPA is back: SQL Server 2025']);
});

test('source health comes from status.json; no file means not checked yet', () => {
  assert.deepEqual(data.byId.idpa.health, { kind: 'details', since: '2026-10-03' });
  assert.deepEqual(data.byId.webgeeks.health, { kind: 'ok' });
  assert.equal(data.checkedOn, '2026-10-07');
  const dir = mkdtempSync(path.join(tmpdir(), 'dsm-'));
  cpSync(dataDir, dir, { recursive: true, filter: (f) => !/status\.json|built-on/.test(f) });
  const bare = loadData({ dataDir: dir, now });
  assert.equal(bare.byId.webgeeks.health, null);
  assert.equal(bare.checkedOn, null);
});

test('a group card is printed as it reads now and as it will once an event ending soon is over', () => {
  // Monday Oct 12, 9am: Hacktoberfest is tonight, the monthly series starts in November.
  const monday = loadData({ dataDir, now: Date.parse('2026-10-12T14:00:00Z') });
  const states = monday.byId.webgeeks.states.map((s) => [s.next?.title, s.last?.title, s.count, s.attrs]);
  assert.deepEqual(states, [
    ['Hacktoberfest', 'Spring recap', 2, { 'data-after': undefined, 'data-end': '2026-10-13T01:00:00.000Z', hidden: false }],
    ['Web Geeks Monthly Meeting', 'Hacktoberfest', 1, { 'data-after': '2026-10-13T01:00:00.000Z', 'data-end': undefined, hidden: true }],
  ], 'the series still counts once, and November is too far off to print what follows it');
  assert.equal(monday.byId.webgeeks.states[0].count, monday.byId.webgeeks.upcomingCount);
  // Nothing coming up: one state, the "Nothing scheduled" one.
  assert.deepEqual(monday.byId.uxdsm.states.map((s) => [s.next, s.count, s.attrs.hidden]), [[null, 0, false]]);
  assert.deepEqual(monday.endingSoon.map((e) => e.title), ['Hacktoberfest'], 'Recent events gets it once it ends');
});
