import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import secdsm from '../scripts/sources/secdsm.mjs';
import pmiChapter from '../scripts/sources/pmi-chapter.mjs';
import taiTechbrew from '../scripts/sources/tai-techbrew.mjs';
import { decode, toText } from '../scripts/sources/html.mjs';

const fixture = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const serve = (body) => ({ get: async () => body });

test('secdsm reads meetings, talks, venue and door time from the homepage', async () => {
  const events = await secdsm({ id: 'secdsm', website: 'https://secdsm.org/' }, serve(fixture('secdsm.html')));
  assert.deepEqual(events.map((e) => e.id), ['secdsm-2026-11-05', 'secdsm-2026-12-03', 'secdsm-2027-01-07']);

  const [one, two, tba] = events;
  assert.equal(one.title, 'Tokens, Tickets, & Thievery');
  assert.equal(one.start, '2026-11-06T00:00:00.000Z', 'doors at 6pm CST');
  assert.equal(one.venue, 'Example Hall');
  assert.equal(one.address, '111 S 11th St, Ste 100, West Des Moines, IA 50265');
  assert.equal(one.url, 'https://secdsm.org/#schedule');
  assert.match(one.description, /Doors open at 6 PM\./);
  assert.match(one.description, /\*\*7:00 PM · Tokens, Tickets, & Thievery\*\* — Pat Example\nLine one\.\nLine two\./);

  assert.equal(two.title, 'Main talk + 1 more');
  assert.equal(tba.title, 'Monthly Security Meetup', 'placeholder talks get a generic title');
  assert.match(tba.description, /schedule pending/i);
});

test('secdsm fails loudly when the page layout changes', async () => {
  await assert.rejects(secdsm({ id: 'secdsm' }, serve('<html>redesigned</html>')), /no schedule blocks/);
});

test('pmi-chapter maps the JSON calendar to events in local time', async () => {
  const json = JSON.stringify([{ id: 42, name: ' AI as Your Partner ', timeStartRaw: '2026-10-27 17:00:00.0', timeEndRaw: '2026-10-27 19:00:00.0' }]);
  const [e] = await pmiChapter({ id: 'pmi', website: 'https://pmi-centraliowa.org/' }, serve(json));
  assert.deepEqual(e, {
    id: 'pmi-42', sourceId: '42', title: 'AI as Your Partner',
    start: '2026-10-27T22:00:00.000Z', end: '2026-10-28T00:00:00.000Z', allDay: false,
    url: 'https://pmi-centraliowa.org/calendar?eventId=42', description: '', venue: null,
  });
  await assert.rejects(pmiChapter({ id: 'pmi', website: 'https://pmi-centraliowa.org/' }, serve('{"error":1}')), /unexpected response/);
});

// The feed fixture holds four TechBrews (Sept–Dec 2026) and one CIO
// Roundtable moved to Nov 2026, so it would be upcoming if not filtered out.
const FEED = 'https://www.technologyiowa.org/events/calendar/techbrews/ics/';
const techbrewSite = (pages = {}) => {
  const requested = [];
  return {
    requested,
    now: Date.parse('2026-10-01T00:00:00Z'),
    get: async (url) => {
      requested.push(url);
      if (url === FEED) return fixture('tai-techbrews.ics');
      return pages[url] ?? fixture('tai-techbrew-event.html');
    },
  };
};

test('tai-techbrew reads upcoming TechBrews with local times and venue from the event page', async () => {
  const site = techbrewSite();
  const events = await taiTechbrew({ id: 'techbrew' }, site);
  assert.deepEqual(events.map((e) => e.id), ['techbrew-techbrew-october-2026', 'techbrew-techbrew-november-2026', 'techbrew-techbrew-december-2026']);

  const [oct, nov] = events;
  assert.equal(oct.title, 'TechBrew – October 2026');
  assert.equal(oct.start, '2026-10-08T13:00:00.000Z', '8am CDT');
  assert.equal(oct.end, '2026-10-08T14:00:00.000Z');
  assert.equal(nov.start, '2026-11-12T14:00:00.000Z', '8am CST, after the clocks change');
  assert.equal(oct.url, 'https://www.technologyiowa.org/events/techbrew-october-2026/');
  assert.equal(oct.venue, 'West End Architectural Salvage');
  assert.equal(oct.address, '22 9th Street, Des Moines, IA');
  assert.match(oct.description, /^Join us for coffee and a tech discussion/);
  assert.match(oct.description, /TechBrew is presented by Zirous$/, 'trailing "Register Now:" and the sign-up iframe are dropped');
  assert.doesNotMatch(oct.description, /<|iframe|regfox/);
});

test('tai-techbrew keeps only TechBrew: other TAI events are dropped even if upcoming', async () => {
  const site = techbrewSite();
  const events = await taiTechbrew({ id: 'techbrew' }, site);
  assert.ok(events.every((e) => /techbrew/i.test(e.title)));
  assert.ok(!site.requested.some((u) => u.includes('cio-roundtable')), 'CIO Roundtable is never even looked at');
  assert.ok(!site.requested.some((u) => u.includes('techbrew-with-featured-guest')), 'past TechBrews are skipped');
});

test('tai-techbrew skips TechBrews outside the Des Moines metro', async () => {
  const url = 'https://www.technologyiowa.org/events/techbrew-november-2026/';
  const cedarRapids = fixture('tai-techbrew-event.html').replace('22 9th Street, Des Moines.', '333 1st St SE, Cedar Rapids.');
  const events = await taiTechbrew({ id: 'techbrew' }, techbrewSite({ [url]: cedarRapids }));
  assert.deepEqual(events.map((e) => e.sourceId), ['techbrew-october-2026', 'techbrew-december-2026']);
});

test('tai-techbrew fails loudly when the feed or event page changes', async () => {
  await assert.rejects(taiTechbrew({ id: 'techbrew' }, { get: async () => '<html>not a calendar</html>' }), /did not return a calendar/);
  const site = techbrewSite({ 'https://www.technologyiowa.org/events/techbrew-october-2026/': '<html>redesigned</html>' });
  await assert.rejects(taiTechbrew({ id: 'techbrew' }, site), /no venue\/location/);
});

test('html helpers decode entities and strip tags', () => {
  assert.equal(decode('Q&amp;A &#8212; &#x2192; &rsquo;s &bogus;'), 'Q&A — → ’s &bogus;');
  assert.equal(toText('<p>Hi<br/>there  <b>you</b></p>'), 'Hi\nthere you');
});
