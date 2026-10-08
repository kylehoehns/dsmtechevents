import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import secdsm from '../scripts/sources/secdsm.mjs';
import pmiChapter from '../scripts/sources/pmi-chapter.mjs';
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

test('html helpers decode entities and strip tags', () => {
  assert.equal(decode('Q&amp;A &#8212; &#x2192; &rsquo;s &bogus;'), 'Q&A — → ’s &bogus;');
  assert.equal(toText('<p>Hi<br/>there  <b>you</b></p>'), 'Hi\nthere you');
});
