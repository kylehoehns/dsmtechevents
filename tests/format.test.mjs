import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, weekday, shortTime, shortRange, formatDescription, todayWord, whenLabel, countdown, monthName, dayName, plural, addDays, daysBetween } from '../src/lib/format.mjs';
import { localToUtc } from '../src/lib/time.mjs';

test('dates are Des Moines dates, not UTC dates', () => {
  // 6:30pm Monday in Des Moines is already Tuesday in UTC.
  assert.equal(dayKey('2026-11-10T00:30:00.000Z'), '2026-11-09');
  assert.equal(weekday('2026-11-10T00:30:00.000Z'), 'Mon');
});

test('localToUtc follows daylight saving time', () => {
  assert.equal(localToUtc('2026-10-15', '08:00'), '2026-10-15T13:00:00.000Z'); // CDT, UTC-5
  assert.equal(localToUtc('2026-12-03', '18:00'), '2026-12-04T00:00:00.000Z'); // CST, UTC-6
  assert.equal(localToUtc('2026-11-01', '08:00'), '2026-11-01T14:00:00.000Z'); // the morning DST ends
  assert.equal(localToUtc('2027-03-14', '08:00'), '2027-03-14T13:00:00.000Z'); // the morning DST starts
  assert.equal(localToUtc('2026-11-07'), '2026-11-07T06:00:00.000Z'); // midnight default, CST
});

test('shortTime prints flyer-style times', () => {
  assert.equal(shortTime('2026-10-12T23:30:00.000Z'), '6:30p');
  assert.equal(shortTime('2026-10-08T17:00:00.000Z'), '12p');
  assert.equal(shortTime('2026-10-15T13:00:00.000Z'), '8a');
});

test('shortRange covers single, all-day and multi-day events', () => {
  assert.equal(shortRange({ start: '2026-10-12T23:30:00.000Z', end: '2026-10-13T01:00:00.000Z' }), '6:30p–8p');
  assert.equal(shortRange({ allDay: true, start: '2026-11-07T05:00:00.000Z', end: '2026-11-08T04:59:00.000Z' }), 'All day');
  assert.equal(
    shortRange({ multiDay: true, start: '2026-10-15T13:00:00.000Z', end: '2026-10-16T22:00:00.000Z' }),
    'Thu–Fri Oct 15–16 · 8a–5p',
  );
});

test('formatDescription escapes HTML from Meetup descriptions', () => {
  const html = formatDescription('<script>alert(1)</script> & "quotes"');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp; &quot;quotes&quot;'));
});

test('formatDescription only links http(s) URLs', () => {
  assert.equal(
    formatDescription('[slides](https://example.com/s) and **bold**'),
    '<p><a href="https://example.com/s" rel="noopener" target="_blank">slides<span class="sr-only"> (opens in new tab)</span></a> and <strong>bold</strong></p>',
  );
  assert.ok(!formatDescription('[x](javascript:alert(1))').includes('<a'));
  assert.ok(formatDescription('See https://example.com.').includes('<a href="https://example.com" '));
});

test('formatDescription turns blank lines into paragraphs and ## into headings', () => {
  assert.equal(formatDescription('One\ntwo\n\n## Agenda\nTalks'), '<p>One<br>two</p><h4>Agenda</h4><p>Talks</p>');
});

test('todayWord says Tonight only for events starting at 4pm or later', () => {
  assert.equal(todayWord('2026-10-08T17:00:00.000Z'), 'Today'); // noon
  assert.equal(todayWord('2026-10-22T22:30:00.000Z'), 'Tonight'); // 5:30pm
  assert.equal(todayWord('2026-10-22T21:00:00.000Z'), 'Tonight'); // 4pm
});

test('whenLabel: one rule for the build, the browser and the TV page', () => {
  const at = (iso) => Date.parse(iso);
  const noon = { start: '2026-10-08T17:00:00.000Z', end: '2026-10-08T18:00:00.000Z' }; // Thu 12p–1p
  assert.equal(whenLabel(noon.start, noon.end, at('2026-10-07T23:00:00Z')), 'Tomorrow', 'Wed 6pm');
  assert.equal(whenLabel(noon.start, noon.end, at('2026-10-08T14:00:00Z')), 'Today', 'Thu 9am, a noon talk');
  assert.equal(whenLabel(noon.start, noon.end, at('2026-10-08T17:30:00Z')), 'Happening now');
  const evening = { start: '2026-10-22T22:30:00.000Z', end: '2026-10-23T00:00:00.000Z' };
  assert.equal(whenLabel(evening.start, evening.end, at('2026-10-22T15:00:00Z')), 'Tonight');
  const conf = { start: '2026-10-15T13:00:00.000Z', end: '2026-10-16T22:00:00.000Z' }; // Thu–Fri
  assert.equal(whenLabel(conf.start, conf.end, at('2026-10-16T14:00:00Z')), 'Happening now', 'day two of a conference');
  assert.equal(whenLabel(conf.start, conf.end, at('2026-10-12T14:00:00Z')), '');
  // Sat Oct 31 → Sun Nov 1 is the night clocks fall back; 'tomorrow' is still one calendar day.
  const sunday = { start: '2026-11-01T15:00:00.000Z', end: '2026-11-01T16:00:00.000Z' };
  assert.equal(whenLabel(sunday.start, sunday.end, at('2026-11-01T04:30:00Z')), 'Tomorrow', 'Sat 11:30pm CDT');
});

test('countdown on headliner posters', () => {
  const start = '2026-10-15T13:00:00.000Z';
  assert.equal(countdown(start, Date.parse('2026-10-07T15:00:00Z')), '8 days out');
  assert.equal(countdown(start, Date.parse('2026-10-14T15:00:00Z')), 'Tomorrow');
  assert.equal(countdown(start, Date.parse('2026-10-15T05:30:00Z')), 'Today', 'just after midnight');
  assert.equal(countdown(start, Date.parse('2026-10-15T15:00:00Z')), 'Happening now');
});

test('month and day names, and plurals', () => {
  assert.equal(monthName('2026-12'), 'December');
  assert.equal(monthName('2027-01-15', true), 'January 2027');
  assert.equal(dayName('2026-10-22'), 'Thursday, October 22');
  assert.equal(plural(1, 'event'), '1 event');
  assert.equal(plural(3, 'event'), '3 events');
  assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(daysBetween('2026-10-31', '2026-11-02'), 2);
});
