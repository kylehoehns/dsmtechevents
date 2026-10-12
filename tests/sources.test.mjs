import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import secdsm from '../scripts/sources/secdsm.mjs';
import pmiChapter from '../scripts/sources/pmi-chapter.mjs';
import taiTechbrew from '../scripts/sources/tai-techbrew.mjs';
import iowansOfThings from '../scripts/sources/iowans-of-things.mjs';
import iibaChapter from '../scripts/sources/iiba-chapter.mjs';
import issaChapter from '../scripts/sources/issa-chapter.mjs';
import readLuma, { mirrorText } from '../scripts/sources/luma.mjs';
import { decode, toText, httpUrl, safeLinks, checkTimes } from '../scripts/sources/html.mjs';

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
  // The venue box: without it, door time, venue and address would quietly go blank.
  for (const [marker, broken] of [['doors=', 'opens='], ['addr=', 'where='], ['hosts us', 'welcomes us']]) {
    await assert.rejects(secdsm({ id: 'secdsm' }, serve(fixture('secdsm.html').replaceAll(marker, broken))), /venue box/, marker);
  }
  const noDates = fixture('secdsm.html').replaceAll('secdsm-job-date', 'secdsm-job-when');
  await assert.rejects(secdsm({ id: 'secdsm' }, serve(noDates)), /no date could be read/);
});

const PMI = { id: 'pmi', website: 'https://pmi-centraliowa.org/' };
const pmiSite = (page = fixture('pmi-event.html')) => ({
  get: async (url) => (url.includes('pmiAjaxGetEvent')
    ? JSON.stringify([{ id: 47587, name: ' AI as Your Partner ', timeStartRaw: '2026-10-27 17:30:00.0', timeEndRaw: '2026-10-27 20:00:00.0' }])
    : page),
});

test('pmi-chapter maps the JSON calendar to events in local time, with venue from the event page', async () => {
  const [e] = await pmiChapter(PMI, pmiSite());
  const { description, ...rest } = e;
  assert.deepEqual(rest, {
    id: 'pmi-47587', sourceId: '47587', title: 'AI as Your Partner',
    start: '2026-10-27T22:30:00.000Z', end: '2026-10-28T01:00:00.000Z', allDay: false,
    url: 'https://pmi-centraliowa.org/calendar?eventId=47587',
    venue: "Christopher's", address: '2816 Beaver Avenue, Des Moines, IA 50310',
  });
  await assert.rejects(pmiChapter(PMI, serve('{"error":1}')), /unexpected response/);
});

test('pmi-chapter reads the full write-up, minus the date the card already shows', async () => {
  const [{ description }] = await pmiChapter(PMI, pmiSite());
  assert.match(description, /^Following our collaboration with IIBA/);
  assert.match(description, /\n\n🎤 Featured Speaker: Angela Weller\n🤝 Connecting/);
  assert.match(description, /\n\n\*\*Speaker Bio\*\*\n\nAngie Weller is a product/);
  assert.match(description, /leadership at the core\.$/);
  assert.doesNotMatch(description, /Date:|<|Register/);
});

test('pmi-chapter allows an empty Location box', async () => {
  const empty = fixture('pmi-event.html').replace(/(data-label="location"[^>]*>)[\s\S]*?<\/div>/, '$1<p class="page-split-right-side-header h5 underlined bold bigger">Location</p></div>');
  const [e] = await pmiChapter(PMI, pmiSite(empty));
  assert.equal(e.venue, null);
  assert.equal(e.address, null);
});

test('pmi-chapter fails loudly when the event page changes', async () => {
  await assert.rejects(pmiChapter(PMI, pmiSite(fixture('pmi-event.html').replace('editable-text-inner', 'rich-text'))), /no event text/);
  await assert.rejects(pmiChapter(PMI, pmiSite(fixture('pmi-event.html').replace('data-label="location"', 'data-label="where"'))), /no Location box/);
});

// The IIBA feed fixture holds five events: "Test" and the Annual General
// Meeting (January, skipped), AI Tips (February, no location), AI as Your BA
// Partner (August, with a location) and Trunk or Treat (October 22, upcoming).
// Event pages are served for Trunk or Treat and BA Partner (the latter made
// from the Trunk or Treat page); any other URL is a 404.
const IIBA = { id: 'iiba', website: 'https://centraliowa.iiba.org/' };
const PARTNER = 'AI as Your BA Partner: Plan Faster. Lead Smarter. Deliver Better.';
const iibaPage = (slug) => `https://centraliowa.iiba.org/events/${slug}/`;
const partnerPage = fixture('iiba-event.html')
  .replace('content="IIBA Trunk or Treat"', `content="${PARTNER}"`)
  .replace('Genesis Health Clubs', 'QCi')
  .replace('4875 Mills Civic Parkway', '3001 Westown Parkway');
const iibaSite = (pages = {}) => ({
  now: Date.parse('2026-10-12T12:00:00Z'),
  since: Date.parse('2026-01-01T00:00:00Z'),
  get: async (url) => {
    const body = url in pages ? pages[url] : {
      'https://centraliowa.iiba.org/calendar-feed': fixture('iiba-feed.ics'),
      'https://centraliowa.iiba.org/Events': fixture('iiba-events.html'),
      'https://centraliowa.iiba.org/Events/iiba-trunk-or-treat': fixture('iiba-event.html'),
      [iibaPage('iiba-trunk-or-treat')]: fixture('iiba-event.html'),
      [iibaPage('ai-as-your-ba-partner-plan-faster.-lead-smarter.-deliver-better.')]: partnerPage,
    }[url];
    if (body == null) throw new Error(`404 from ${url}`);
    return body;
  },
});

test('iiba-chapter reads the feed, with link and venue from each event page', async () => {
  const events = await iibaChapter(IIBA, iibaSite());
  assert.deepEqual(events.map((e) => e.title), ['AI Tips & Tricks - Using AI as a Force Multiplier', PARTNER, 'IIBA Trunk or Treat']);
  const [tips, partner, trunk] = events;
  const { description, ...rest } = trunk;
  assert.deepEqual(rest, {
    id: 'iiba-4015ea6b-10a3-436a-8d9f-5ebdc822aa32', sourceId: '4015ea6b-10a3-436a-8d9f-5ebdc822aa32',
    title: 'IIBA Trunk or Treat', start: '2026-10-22T22:00:00.000Z', end: '2026-10-23T01:00:00.000Z', allDay: false,
    url: iibaPage('iiba-trunk-or-treat'),
    venue: 'Genesis Health Clubs', address: '4875 Mills Civic Parkway, West Des Moines, IA',
  });
  // The slug keeps the periods from the title.
  assert.equal(partner.url, iibaPage('ai-as-your-ba-partner-plan-faster.-lead-smarter.-deliver-better.'));
  assert.deepEqual([partner.venue, partner.address], ['QCi', '3001 Westown Parkway, West Des Moines, IA']);
  // No page found for a past event: the Events page, and no venue (it has no location).
  assert.equal(tips.url, 'https://centraliowa.iiba.org/Events');
  assert.deepEqual([tips.venue, tips.address], [null, null]);
});

test('iiba-chapter falls back when a guessed page is missing or is a different event', async () => {
  // A past event with no page keeps the street from the feed as its venue.
  const [, partner, trunk] = await iibaChapter(IIBA, iibaSite({ [iibaPage('ai-as-your-ba-partner-plan-faster.-lead-smarter.-deliver-better.')]: null }));
  assert.equal(partner.url, 'https://centraliowa.iiba.org/Events');
  assert.deepEqual([partner.venue, partner.address], ['3001 Westown Parkway', 'West Des Moines, IA']);
  // An upcoming event whose guessed page has another title is found on the Events page instead.
  const other = fixture('iiba-event.html').replace('content="IIBA Trunk or Treat"', 'content="Something Else"');
  const [, , moved] = await iibaChapter(IIBA, iibaSite({ [iibaPage('iiba-trunk-or-treat')]: other }));
  assert.equal(moved.url, 'https://centraliowa.iiba.org/Events/iiba-trunk-or-treat');
  assert.equal(trunk.url, iibaPage('iiba-trunk-or-treat'));
});

test('iiba-chapter drops the lines the card already shows from the write-up', async () => {
  const [, partner, trunk] = await iibaChapter(IIBA, iibaSite());
  assert.match(trunk.description, /^🎃 Trick or treat, Des Moines Analysts!\n\n/);
  assert.doesNotMatch(trunk.description, /📅|📍/);
  assert.match(partner.description, /^AI can bring speed/, 'the bold title at the top is dropped');
  assert.match(partner.description, /\n\n\*\*Speaker Bio\*\*\n\n/);
  assert.doesNotMatch(partner.description, /<|&nbsp/);
});

test('iiba-chapter fails loudly when the feed or pages change', async () => {
  await assert.rejects(iibaChapter(IIBA, iibaSite({ 'https://centraliowa.iiba.org/calendar-feed': '<html>Just a moment...</html>' })), /did not return a calendar/);
  await assert.rejects(iibaChapter(IIBA, iibaSite({ 'https://centraliowa.iiba.org/calendar-feed': 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n' })), /has no events/);
  const noGuess = { [iibaPage('iiba-trunk-or-treat')]: null };
  await assert.rejects(iibaChapter(IIBA, iibaSite({ ...noGuess, 'https://centraliowa.iiba.org/Events': fixture('iiba-events.html').replaceAll('EAS-Name', 'EAS-Title') })), /no events listed/);
  await assert.rejects(iibaChapter(IIBA, iibaSite({ [iibaPage('iiba-trunk-or-treat')]: fixture('iiba-event.html').replace('>Where<', '>Location<') })), /no Where box/);
  const oddLocation = fixture('iiba-feed.ics').replace('3001 Westown Parkway 3001 Westown Parkway', '3001 Westown Parkway');
  await assert.rejects(iibaChapter(IIBA, iibaSite({ 'https://centraliowa.iiba.org/calendar-feed': oddLocation })), /unexpected location/);
});

// The ISSA list fixture holds three posts: the September meeting, a "Coming
// Soon" announcement with no date, and the April meeting (served here as the
// September page with its date and place changed).
const ISSA = { id: 'issa', website: 'https://issadesmoines.org/' };
const issaPage = (url) => `https://issadesmoines.org/events/${url}/`;
const issaApril = fixture('issa-event.html')
  .replace('September 29, 2026 11:30 am', 'April 21, 2026 11:30 am')
  .replace(/<p><strong>Principal[^<]*<\/strong><\/p>/, '<p><strong>Apex Systems</strong></p>');
const issaSite = (pages = {}) => ({
  now: Date.parse('2026-10-12T12:00:00Z'),
  since: Date.parse('2026-01-01T00:00:00Z'),
  get: async (url) => pages[url] ?? {
    'https://issadesmoines.org/events/': fixture('issa-events.html'),
    [issaPage('september-quarterly-issa-meeting')]: fixture('issa-event.html'),
    [issaPage('coming-soon-information-about-a-fall-event')]: fixture('issa-event-coming-soon.html'),
    [issaPage('april-issa-des-moines-chapter-meeting')]: issaApril,
  }[url] ?? assert.fail(`unexpected fetch ${url}`),
});

test('issa-chapter reads each listed meeting page, skipping posts with no date yet', async () => {
  const [sept, april, ...more] = await issaChapter(ISSA, issaSite());
  assert.equal(more.length, 0);
  const { description, ...rest } = sept;
  assert.deepEqual(rest, {
    id: 'issa-september-quarterly-issa-meeting', sourceId: 'september-quarterly-issa-meeting',
    title: 'September Quarterly ISSA Meeting', start: '2026-09-29T16:30:00.000Z', end: '2026-09-29T18:00:00.000Z', allDay: false,
    url: issaPage('september-quarterly-issa-meeting'),
    venue: 'Principal Financial Group', address: '750 Park Street, Des Moines IA 50309',
  });
  assert.match(description, /^\*\*Presenting:\*\* Lucy Berry & Kaylee Fletcher \(DEFCON Talk\)/);
  assert.match(description, /\n\nWhat:\s+Free lunch/);
  assert.doesNotMatch(description, /Where:|-->|September 29/, 'no venue line repeated, nothing from the commented-out markup');
  assert.deepEqual([april.venue, april.address], ['Apex Systems', null], 'a place with no street is a name alone');
});

test('issa-chapter skips meetings before the cutoff', async () => {
  const events = await issaChapter(ISSA, { ...issaSite(), since: Date.parse('2026-06-01T00:00:00Z') });
  assert.deepEqual(events.map((e) => e.sourceId), ['september-quarterly-issa-meeting']);
});

test('issa-chapter fails loudly when the pages change', async () => {
  await assert.rejects(issaChapter(ISSA, issaSite({ 'https://issadesmoines.org/events/': '<html>redesigned</html>' })), /no events listed/);
  const noHeading = fixture('issa-event.html').replace('<h2>September', '<h3>September').replace('am</h2>', 'am</h3>');
  await assert.rejects(issaChapter(ISSA, issaSite({ [issaPage('september-quarterly-issa-meeting')]: noHeading })), /no date heading/);
  const oddDate = fixture('issa-event.html').replace('September 29, 2026 11:30 am', '9/29/2026 11:30');
  await assert.rejects(issaChapter(ISSA, issaSite({ [issaPage('september-quarterly-issa-meeting')]: oddDate })), /unreadable date/);
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
  assert.ok(!site.requested.some((u) => u.includes('techbrew-september-2026')), 'past TechBrews are skipped by default');
});

test('tai-techbrew includes past TechBrews back to the fetch cutoff, for Recently', async () => {
  const site = techbrewSite();
  const events = await taiTechbrew({ id: 'techbrew' }, { ...site, since: site.now - 90 * 86_400_000 });
  const ids = events.map((e) => e.sourceId);
  assert.ok(ids.includes('techbrew-september-2026'), 'the September TechBrew is in');
  assert.ok(ids.includes('techbrew-october-2026'));
});

test('tai-techbrew skips TechBrews outside the Des Moines metro', async () => {
  const url = 'https://www.technologyiowa.org/events/techbrew-november-2026/';
  const cedarRapids = fixture('tai-techbrew-event.html').replace('22 9th Street, Des Moines.', '333 1st St SE, Cedar Rapids.');
  const events = await taiTechbrew({ id: 'techbrew' }, techbrewSite({ [url]: cedarRapids }));
  assert.deepEqual(events.map((e) => e.sourceId), ['techbrew-october-2026', 'techbrew-december-2026']);
});

test('tai-techbrew counts the wider metro: Norwalk, Bondurant, Indianola, Polk City', async () => {
  const url = 'https://www.technologyiowa.org/events/techbrew-november-2026/';
  for (const city of ['Norwalk', 'Bondurant', 'Indianola', 'Polk City']) {
    const page = fixture('tai-techbrew-event.html').replace('22 9th Street, Des Moines.', `1 Main St, ${city}.`);
    const events = await taiTechbrew({ id: 'techbrew' }, techbrewSite({ [url]: page }));
    assert.equal(events.find((e) => e.sourceId === 'techbrew-november-2026')?.address, `1 Main St, ${city}, IA`);
  }
});

test('tai-techbrew fails loudly when no TechBrew passes the city check', async () => {
  const noCity = fixture('tai-techbrew-event.html').replace('22 9th Street, Des Moines.', '22 9th Street Des Moines.');
  const site = techbrewSite();
  await assert.rejects(taiTechbrew({ id: 'techbrew' }, { ...site, get: async (u) => (u === FEED ? site.get(u) : noCity) }), /every TechBrew was outside the metro/);
});

test('tai-techbrew fails loudly when the feed or event page changes', async () => {
  await assert.rejects(taiTechbrew({ id: 'techbrew' }, { get: async () => '<html>not a calendar</html>' }), /did not return a calendar/);
  const site = techbrewSite({ 'https://www.technologyiowa.org/events/techbrew-october-2026/': '<html>redesigned</html>' });
  await assert.rejects(taiTechbrew({ id: 'techbrew' }, site), /no venue\/location/);
  const noBody = fixture('tai-techbrew-event.html').replace('<!--end .sc_event_details-->', '');
  await assert.rejects(taiTechbrew({ id: 'techbrew' }, techbrewSite({ 'https://www.technologyiowa.org/events/techbrew-october-2026/': noBody })), /no event text/);
});

test('html helpers decode entities and strip tags', () => {
  assert.equal(decode('Q&amp;A &#8212; &#x2192; &rsquo;s &bogus;'), 'Q&A — → ’s &bogus;');
  assert.equal(toText('<p>Hi<br/>there  <b>you</b></p>'), 'Hi\nthere you');
});

test('iowans-of-things reads the Upcoming Events section of the homepage', async () => {
  const events = await iowansOfThings({ id: 'iot', website: 'https://iowansofthings.com/' }, serve(fixture('iowans-of-things.html')));
  assert.deepEqual(events.map((e) => e.id), ['iot-ff-october-2026', 'iot-hh-november-2026'], 'past events are left out');
  const [ff, hh] = events;
  assert.equal(ff.title, 'Firmware Fellowship - October 2026');
  assert.equal(ff.start, '2026-10-09T00:00:00.000Z', '7pm CDT');
  assert.equal(ff.end, '2026-10-09T01:00:00.000Z');
  assert.equal(ff.venue, 'Area515, Des Moines Maker Space');
  assert.equal(ff.address, '108 Jefferson Avenue, Des Moines, IA 50314');
  assert.equal(ff.url, 'https://iowansofthings.com/ff-october-2026');
  assert.equal(ff.image, 'https://iowansofthings.com/assets/images/banner_ff.png');
  assert.equal(ff.description, 'A technical discussion series on embedded firmware. Don’t be afraid to join us!\n\nThis month: an open-source project review.');
  assert.equal(hh.start, '2026-11-13T00:30:00.000Z', '6:30pm CST');
  assert.ok(!('image' in hh));
});

test('iowans-of-things never ends an event before it starts', async () => {
  const read = (time) => iowansOfThings({ id: 'iot' }, serve(fixture('iowans-of-things.html').replace(/7:00 PM\s*-\s*8:00 PM/, time)));
  const [late] = await read('7:00 PM - 12:00 AM');
  assert.equal(late.end, '2026-10-09T05:00:00.000Z', 'midnight is the next day');
  const [open] = await read('7:00 PM');
  assert.equal(open.end, '2026-10-09T02:00:00.000Z', 'no end time: two hours');
});

test('checkTimes stops any source from writing an event that ends before it starts', () => {
  const ok = { title: 'A', start: '2026-10-09T00:00:00.000Z', end: '2026-10-09T01:00:00.000Z' };
  assert.deepEqual(checkTimes([ok]), [ok]);
  assert.throws(() => checkTimes([{ ...ok, end: '2026-10-08T23:00:00.000Z' }]), /"A" ends before it starts/);
  assert.throws(() => checkTimes([{ ...ok, start: 'soon' }]), /"A" has no start/);
});

test('iowans-of-things fails loudly when the homepage changes', async () => {
  await assert.rejects(iowansOfThings({ id: 'iot' }, serve('<html>new site</html>')), /no Upcoming Events section/);
  const noDates = fixture('iowans-of-things.html').replace(/<strong>\s*Date:/g, '<strong>When:');
  await assert.rejects(iowansOfThings({ id: 'iot' }, serve(noDates)), /none had a link and date/);
  const empty = '<section id="upcoming-events"></section><section id="past-events"></section>';
  assert.deepEqual(await iowansOfThings({ id: 'iot' }, serve(empty)), [], 'nothing scheduled is not an error');
});

test('secdsm says "at" inside a venue name written with "@"', async () => {
  const html = fixture('secdsm.html').replace('Example Hall', 'T12 Distillery @ The Foundry');
  const [e] = await secdsm({ id: 'secdsm', website: 'https://secdsm.org/' }, { get: async () => html });
  assert.equal(e.venue, 'T12 Distillery at The Foundry');
});

test('safeLinks keeps only http(s) event links and photos', () => {
  assert.equal(httpUrl('https://www.meetup.com/pyowa/events/1/'), 'https://www.meetup.com/pyowa/events/1/');
  assert.equal(httpUrl('HTTP://example.com/'), 'HTTP://example.com/');
  for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,hi', '//evil.example/', '/relative', null, undefined, 42]) assert.equal(httpUrl(bad), null, String(bad));

  const group = { website: 'https://pyowa.org/' };
  const [bad, good, noImage] = safeLinks([
    { id: 'a', url: 'javascript:alert(1)', image: 'data:image/svg+xml,<svg/>' },
    { id: 'b', url: 'https://example.com/e', image: 'https://example.com/p.jpg' },
    { id: 'c', url: null },
  ], group);
  assert.deepEqual(bad, { id: 'a', url: 'https://pyowa.org/', image: null }, "a bad link falls back to the group's site");
  assert.deepEqual(good, { id: 'b', url: 'https://example.com/e', image: 'https://example.com/p.jpg' });
  assert.ok(!('image' in noImage), 'no image key is added, so cache files stay byte-stable');
  assert.equal(safeLinks([{ id: 'd', url: 'javascript:x' }], { website: 'javascript:y' })[0].url, null);
});

const LUMA = 'https://luma.com/04xz1l03';
const lumaApi = (edit = (j) => j) => ({
  get: async (url) => {
    assert.equal(url, 'https://api.lu.ma/url?url=04xz1l03');
    return JSON.stringify(edit(JSON.parse(fixture('luma-event.json'))));
  },
});

test('luma reads an event\'s time, place, photo, RSVPs and write-up', async () => {
  const { description, ...rest } = await readLuma(LUMA, lumaApi());
  assert.deepEqual(rest, {
    title: 'Github Dev Days | Des Moines, Iowa, USA',
    start: '2026-10-20T20:00:00.000Z', end: '2026-10-20T22:00:00.000Z', allDay: false,
    url: LUMA,
    venue: 'Lean Techniques Office', address: '9131 Northpark Dr, Johnston, IA 50131',
    image: 'https://images.lumacdn.com/uploads/6c/d3c66d47-fef4-4f9d-b0b0-03ec162c8b3e.png',
    going: 14,
  });
  assert.match(description, /^✨ Dev Days is a global/);
  assert.match(description, /\n\nDisclaimer: this event utilizes AI credits\./, 'a quote is a paragraph');
  assert.match(description, /\n\n## Code of Conduct\n\n/);
  assert.match(description, /\*\*Event Code of Conduct\*\*: https:\/\/github\.com\/github\/dev-days\/blob\/main\/EVENT_CODE_OF_CONDUCT\.md$/, 'a bare link stays bare');
});

test('luma: an online event has no place, and hidden RSVPs stay hidden', async () => {
  const online = await readLuma(LUMA, lumaApi((j) => ({ ...j, data: { ...j.data, event: { ...j.data.event, location_type: 'online', hide_rsvp: true } } })));
  assert.equal(online.online, true);
  assert.ok(!('venue' in online) && !('address' in online) && !('going' in online));
});

// Place shapes seen on real Luma events (Oct 2026).
const lumaPlace = async (geo) => {
  const e = await readLuma(LUMA, lumaApi((j) => {
    j.data.event.geo_address_info = geo;
    return j;
  }));
  return [e.venue, e.address];
};

test("luma: Google's place name is the venue, and the organizer's note only when it names one", async () => {
  assert.deepEqual(await lumaPlace({
    address: 'CrossRoads Shooting Sports', description: 'Parking is available and free.',
    full_address: 'CrossRoads Shooting Sports, 5550 NW Johnston Dr, Johnston, IA 50131, USA',
  }), ['CrossRoads Shooting Sports', '5550 NW Johnston Dr, Johnston, IA 50131'], 'a parking note is not a venue');
  assert.deepEqual(await lumaPlace({
    address: 'Sheslow Auditorium', description: '', full_address: 'Sheslow Auditorium, 2507 University Ave, Des Moines, IA 50311, USA',
  }), ['Sheslow Auditorium', '2507 University Ave, Des Moines, IA 50311'], 'the name is said once, not again in the address');
  assert.deepEqual(await lumaPlace({ address: '315 5th St', short_address: '315 5th St, West Des Moines', full_address: '315 5th St, West Des Moines, IA 50265, USA' }), [null, '315 5th St, West Des Moines, IA 50265']);
  assert.deepEqual(await lumaPlace({ city_state: 'Des Moines, IA', mode: 'obfuscated' }), [null, 'Des Moines, IA'], 'address for guests only');
  assert.deepEqual(await lumaPlace({ address: 'Microsoft Memphis Office', short_address: null, full_address: null }), ['Microsoft Memphis Office', null], 'typed in by hand');
  assert.deepEqual(await lumaPlace({
    address: 'Via Jacopo Durandi, 10', short_address: 'Via Jacopo Durandi, 10, Torino', description: 'Aula 10',
    full_address: 'Via Jacopo Durandi, 10, 10144 Torino TO, Italy',
  }), ['Aula 10', 'Via Jacopo Durandi, 10, 10144 Torino TO, Italy'], 'a street with no number first is still a street');
});

test('luma fails loudly when Luma changes its response', async () => {
  await assert.rejects(readLuma(LUMA, serve('<html>Not found</html>')), /did not return JSON/);
  await assert.rejects(readLuma(LUMA, lumaApi((j) => ({ ...j, kind: 'calendar' }))), /unexpected response/);
  await assert.rejects(readLuma(LUMA, lumaApi((j) => {
    delete j.data.event.start_at;
    return j;
  })), /unexpected response/);
  await assert.rejects(readLuma('https://example.com/04xz1l03', lumaApi()), /not a Luma event link/);
});

test('luma descriptions keep lists, line breaks and links', () => {
  const text = (t, marks) => ({ type: 'text', text: t, ...(marks && { marks }) });
  const p = (...content) => ({ type: 'paragraph', content });
  assert.equal(mirrorText({ content: [
    p(text('Line one'), { type: 'hard_break' }, text('RSVP '), text('here', [{ type: 'link', attrs: { href: 'https://x.test/' } }])),
    { type: 'bullet_list', content: [{ type: 'list_item', content: [p(text('Pizza'))] }, { type: 'list_item', content: [p(text('Talks'))] }] },
    { type: 'ordered_list', content: [{ type: 'list_item', content: [p(text('Doors'))] }] },
    p(text('bad', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
    { type: 'horizontal_rule' },
  ] }), 'Line one\nRSVP [here](https://x.test/)\n\n- Pizza\n- Talks\n\n1. Doors\n\nbad');
});
