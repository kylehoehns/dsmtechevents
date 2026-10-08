import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, readTvParams, tvUrl, wifiCode, CAPS } from '../src/lib/tv-slides.mjs';
import { liveLabel, lineup } from '../src/lib/format.mjs';

test('clean keeps plain text, strips control characters and caps the length', () => {
  assert.equal(clean('  <b>x</b>  '), '<b>x</b>'); // left as text; the TV never parses it
  assert.equal(clean('a\u0000b\u0007c‮d', 10), 'abcd');
  assert.equal(clean('one\ntwo\tthree', 40), 'one two three');
  assert.equal(clean('one\n\n\n\ntwo', 40, { lines: true }), 'one\n\ntwo');
  const long = clean('x'.repeat(1000), CAPS.welcome);
  assert.equal([...long].length, CAPS.welcome);
  assert.ok(long.endsWith('…'));
  assert.equal(clean(null, 5), '');
});

test('readTvParams: the default order is the event, host slides with text, then Up next', () => {
  assert.deepEqual(readTvParams('event=x').order, ['event', 'next-all']);
  assert.deepEqual(readTvParams('event=x&wifi=Guest&note=Hi').order, ['event', 'wifi', 'note', 'next-all']);
});

test('readTvParams: slides sets the order, ignores unknown names and empty host slides, keeps the event', () => {
  assert.deepEqual(readTvParams('slides=next-group,welcome,bogus,wifi,event&welcome=Hi').order, ['next-group', 'welcome', 'event']);
  assert.deepEqual(readTvParams('slides=next-all,next-all').order, ['event', 'next-all']);
  assert.deepEqual(readTvParams('slides=WELCOME&welcome=Hi').order, ['event', 'welcome']);
});

test('readTvParams: agenda splits on | or new lines, at most 8 items', () => {
  assert.deepEqual(readTvParams('agenda=Pizza|Talks%0ANetworking||').text.agenda, ['Pizza', 'Talks', 'Networking']);
  assert.equal(readTvParams(`agenda=${Array(12).fill('a').join('|')}`).text.agenda.length, 8);
});

test('readTvParams: host text comes from the fragment, falling back to the query for older links', () => {
  const { order, text } = readTvParams('slides=event,welcome,wifi', 'welcome=From%20the%20hash&wifi=Guest');
  assert.deepEqual(order, ['event', 'welcome', 'wifi']);
  assert.equal(text.welcome, 'From the hash');
  assert.equal(readTvParams('welcome=Old&wifi=Q', 'welcome=New').text.welcome, 'New');
  assert.equal(readTvParams('welcome=Old&wifi=Q', 'welcome=New').text.wifi, 'Q');
  // slides and group are only read from the query
  assert.deepEqual(readTvParams('', 'slides=next-group').order, ['event', 'next-all']);
});

test('tvUrl puts the host text after #, and it reads back the same', () => {
  const url = tvUrl('https://dsmtechevents.com', { event: 'cijug-1', order: ['event', 'wifi', 'next-all'], fields: { wifi: 'Guest Net', wifipass: 'a&b=c', welcome: '' }, group: 'cijug', plain: true });
  assert.equal(url, 'https://dsmtechevents.com/tv/?event=cijug-1&slides=event,wifi,next-all&group=cijug&fx=off#wifi=Guest%20Net&wifipass=a%26b%3Dc');
  const u = new URL(url);
  const back = readTvParams(u.searchParams, u.hash.slice(1));
  assert.deepEqual(back.order, ['event', 'wifi', 'next-all']);
  assert.equal(back.text.wifipass, 'a&b=c');
  assert.equal(tvUrl('https://dsmtechevents.com', { event: 'cijug-1', order: ['event'] }), 'https://dsmtechevents.com/tv/?event=cijug-1&slides=event');
});

test('wifiCode escapes the special characters', () => {
  assert.equal(wifiCode('My;Net', 'p:w"d'), 'WIFI:T:WPA;S:My\\;Net;P:p\\:w\\"d;;');
  assert.equal(wifiCode('Open'), 'WIFI:T:nopass;S:Open;;');
});

test('liveLabel counts down, then says Happening now, then nothing', () => {
  const e = { start: '2026-10-14T22:30:00.000Z', end: '2026-10-15T00:30:00.000Z' }; // Wed 5:30p–7:30p
  assert.equal(liveLabel(e, Date.parse('2026-10-13T15:00:00Z')), 'Tomorrow at 5:30p');
  assert.equal(liveLabel(e, Date.parse('2026-10-14T14:00:00Z')), 'Tonight at 5:30p');
  assert.equal(liveLabel(e, Date.parse('2026-10-14T22:05:00Z')), 'Starts in 25 min');
  assert.equal(liveLabel(e, Date.parse('2026-10-14T23:00:00Z')), 'Happening now');
  assert.equal(liveLabel(e, Date.parse('2026-10-15T00:30:00Z')), '');
  assert.equal(liveLabel(e, Date.parse('2026-10-10T15:00:00Z')), 'Wed Oct 14 at 5:30p');
});

test('lineup reads bold "time · title — speaker" lines', () => {
  const text = 'Doors open at 6 PM.\n\n**7:00 PM · Everything is a Date** — Craig Leabhart\nTips.\n\n**7:25 PM · DIY Flipper Zero** — Jacob Schubert\nA flipper.';
  assert.deepEqual(lineup(text), [
    { time: '7p', title: 'Everything is a Date', speaker: 'Craig Leabhart' },
    { time: '7:25p', title: 'DIY Flipper Zero', speaker: 'Jacob Schubert' },
  ]);
  assert.deepEqual(lineup('Talk schedule pending.'), []);
  assert.deepEqual(lineup(undefined), []);
});
