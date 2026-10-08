import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, weekday, shortTime, shortRange, dateRange, dayRange, formatDescription, todayWord, whenLabel, countdown, monthName, dayName, plural, addDays, daysBetween, liveLabel, startsIn, lineup, recentSummary } from '../src/lib/format.mjs';
import { localToUtc } from '../src/lib/time.mjs';
import { lastDay, isDayKey } from '../src/lib/format.mjs';

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
    'through Fri Oct 16 · 8a–5p',
  );
  // Where the start date isn't printed beside it: the whole range.
  assert.equal(
    shortRange({ multiDay: true, start: '2026-10-15T13:00:00.000Z', end: '2026-10-16T22:00:00.000Z' }, { full: true }),
    'Thu–Fri Oct 15–16 · 8a–5p',
  );
  // An all-day run ending at midnight ends the day before.
  const allDays = { multiDay: true, allDay: true, start: '2026-10-30T05:00:00.000Z', end: '2026-11-02T05:00:00.000Z' };
  assert.equal(shortRange(allDays), 'through Sun Nov 1 · All day');
  assert.equal(shortRange(allDays, { full: true }), 'Oct 30–Nov 1 · All day');
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
  const [start, end] = ['2026-10-15T13:00:00.000Z', '2026-10-15T22:00:00.000Z'];
  assert.equal(countdown(start, end, Date.parse('2026-10-07T15:00:00Z')), '8 days out');
  assert.equal(countdown(start, end, Date.parse('2026-10-14T15:00:00Z')), 'Tomorrow');
  assert.equal(countdown(start, end, Date.parse('2026-10-15T05:30:00Z')), 'Today', 'just after midnight');
  assert.equal(countdown(start, end, Date.parse('2026-10-15T15:00:00Z')), 'Happening now');
});

test('the poster stamp agrees with the row for a multi-day conference', () => {
  // Tech Fuse: Oct 15–16, 8a–5p.
  const [start, end] = ['2026-10-15T13:00:00.000Z', '2026-10-16T22:00:00.000Z'];
  const stamp = (iso, opts = { multiDay: true }) => countdown(start, end, Date.parse(iso), opts);
  assert.equal(stamp('2026-10-07T15:00:00Z'), '8 days out');
  assert.equal(stamp('2026-10-15T05:30:00Z'), 'Today', 'day one, just after midnight');
  assert.equal(stamp('2026-10-15T15:00:00Z'), 'Happening now', 'day one, 10am');
  assert.equal(stamp('2026-10-16T02:00:00Z'), 'Tomorrow', 'day one, 9pm');
  assert.equal(stamp('2026-10-16T11:00:00Z'), 'Today', 'day two, 6am');
  assert.equal(stamp('2026-10-16T12:00:00Z'), 'In 60 min', 'day two, 7am: the hour before the doors');
  assert.equal(stamp('2026-10-16T17:00:00Z'), 'Happening now', 'day two, noon');
  assert.equal(stamp('2026-10-16T02:00:00Z', {}), 'Happening now', 'without the flag it runs straight through');
});

test('a multi-day conference keeps its local hours across daylight saving', () => {
  // Sat Oct 31 – Mon Nov 2, 8a–5p. Clocks fall back early on Sun Nov 1.
  const fall = [localToUtc('2026-10-31', '08:00'), localToUtc('2026-11-02', '17:00')];
  const atFall = (iso) => whenLabel(...fall, Date.parse(iso), { multiDay: true });
  assert.equal(atFall('2026-11-01T13:30:00Z'), 'In 30 min', 'Sun 7:30am CST, before the doors');
  assert.equal(atFall('2026-11-01T12:30:00Z'), 'Today', 'Sun 6:30am CST');
  assert.equal(atFall('2026-11-01T14:30:00Z'), 'Happening now', 'Sun 8:30am CST');
  assert.equal(atFall('2026-11-01T22:30:00Z'), 'Happening now', 'Sun 4:30pm CST');
  assert.equal(atFall('2026-11-01T23:30:00Z'), 'Tomorrow', 'Sun 5:30pm CST');
  assert.equal(atFall('2026-11-02T13:30:00Z'), 'In 30 min', 'Mon 7:30am CST');
  assert.equal(atFall('2026-11-02T14:30:00Z'), 'Happening now', 'Mon 8:30am CST');
  // Sat Mar 13 – Mon Mar 15 2027, 8a–5p. Clocks spring forward early on Sun Mar 14.
  const spring = [localToUtc('2027-03-13', '08:00'), localToUtc('2027-03-15', '17:00')];
  const atSpring = (iso) => whenLabel(...spring, Date.parse(iso), { multiDay: true });
  assert.equal(atSpring('2027-03-13T22:30:00Z'), 'Happening now', 'Sat 4:30pm CST');
  assert.equal(atSpring('2027-03-14T12:30:00Z'), 'In 30 min', 'Sun 7:30am CDT');
  assert.equal(atSpring('2027-03-14T13:30:00Z'), 'Happening now', 'Sun 8:30am CDT');
  assert.equal(atSpring('2027-03-15T13:30:00Z'), 'Happening now', 'Mon 8:30am CDT');
  assert.equal(atSpring('2027-03-15T21:30:00Z'), 'Happening now', 'Mon 4:30pm CDT');
  assert.equal(atSpring('2027-03-15T22:30:00Z'), '', 'Mon 5:30pm CDT: over');
});

test('a multi-day event closing at midnight runs to the end of its last day', () => {
  // Oct 15–16, 6p–12a.
  const [start, end] = [localToUtc('2026-10-15', '18:00'), localToUtc('2026-10-17', '00:00')];
  const at = (iso) => whenLabel(start, end, Date.parse(iso), { multiDay: true });
  assert.equal(at('2026-10-16T12:00:00Z'), 'Tonight', 'day two, 7am');
  assert.equal(at('2026-10-17T04:00:00Z'), 'Happening now', 'day two, 11pm');
});

test('dayRange names the days a multi-day event spans', () => {
  assert.equal(dayRange('2026-10-15T13:00:00.000Z', '2026-10-16T22:00:00.000Z'), 'Thu–Fri Oct 15–16');
});

test('month and day names, and plurals', () => {
  assert.equal(monthName('2026-12'), 'December');
  assert.equal(monthName('2027-01-15', true), 'January 2027');
  assert.equal(dayName('2026-10-22'), 'Thursday, October 22');
  assert.equal(plural(1, 'event'), '1 event');
  assert.equal(plural(3, 'event'), '3 events');
  assert.equal(recentSummary(12, 411), 'The last three months. 12 events, 411 people went.');
  assert.equal(recentSummary(1, 1), 'The last three months. 1 event, 1 person went.');
  assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(daysBetween('2026-10-31', '2026-11-02'), 2);
});

test('localToUtc gets early-morning times right on DST switch days', () => {
  assert.equal(localToUtc('2026-11-01', '03:00'), '2026-11-01T09:00:00.000Z', '3am CST, after fall-back');
  assert.equal(localToUtc('2026-11-01', '05:30'), '2026-11-01T11:30:00.000Z');
  assert.equal(localToUtc('2027-03-14', '04:00'), '2027-03-14T09:00:00.000Z', '4am CDT, after spring-forward');
});

test('an event ending at midnight is a one-day event', () => {
  assert.equal(lastDay('2026-10-23T02:00:00.000Z', '2026-10-23T05:00:00.000Z'), '2026-10-22', '9p–12a CDT');
  assert.equal(lastDay('2026-10-15T13:00:00.000Z', '2026-10-16T22:00:00.000Z'), '2026-10-16');
});

test('isDayKey accepts only real dates', () => {
  assert.equal(isDayKey('2026-10-22'), true);
  assert.equal(isDayKey('2026-13-45'), false);
  assert.equal(isDayKey('2026-02-30'), false);
  assert.equal(isDayKey('yesterday'), false);
  assert.equal(isDayKey(null), false);
});

test('dateRange spans months and ends on the last real day', () => {
  assert.equal(dateRange('2026-10-15T13:00:00.000Z', '2026-10-16T22:00:00.000Z'), 'Oct 15–16');
  assert.equal(dateRange('2026-10-30T13:00:00.000Z', '2026-11-02T22:00:00.000Z'), 'Oct 30–Nov 2');
  // Ends at midnight Des Moines time (05:00Z): the last day is the 16th, not the 17th.
  assert.equal(dateRange('2026-10-15T13:00:00.000Z', '2026-10-17T05:00:00.000Z'), 'Oct 15–16');
});

test('a two-day conference is only "Happening now" during its hours', () => {
  // Oct 15–16, 8a–5p Des Moines time.
  const [start, end] = ['2026-10-15T13:00:00.000Z', '2026-10-16T22:00:00.000Z'];
  const at = (iso) => whenLabel(start, end, Date.parse(iso), { multiDay: true });
  assert.equal(at('2026-10-15T15:00:00Z'), 'Happening now', 'day one, 10am');
  assert.equal(at('2026-10-16T02:00:00Z'), 'Tomorrow', 'day one, 9pm: back tomorrow');
  assert.equal(at('2026-10-16T12:00:00Z'), 'In 60 min', 'day two, 7am');
  assert.equal(at('2026-10-16T11:30:00Z'), 'Today', 'day two, 6:30am');
  assert.equal(at('2026-10-16T17:00:00Z'), 'Happening now', 'day two, noon');
  assert.equal(whenLabel(start, end, Date.parse('2026-10-16T02:00:00Z')), 'Happening now', 'without the flag it runs straight through, as before');
});

test('the hour before an event, the row and the poster count the minutes', () => {
  const [start, end] = ['2026-10-22T22:30:00.000Z', '2026-10-23T00:00:00.000Z']; // CIJUG, Thu 5:30p–7p
  const at = (iso) => whenLabel(start, end, Date.parse(iso));
  assert.equal(at('2026-10-22T21:29:00Z'), 'Tonight', '4:29p, just over an hour out');
  assert.equal(at('2026-10-22T21:30:00Z'), 'In 60 min', '4:30p');
  assert.equal(at('2026-10-22T22:05:00Z'), 'In 25 min', '5:05p');
  assert.equal(at('2026-10-22T22:29:30Z'), 'In 1 min', 'seconds before: rounds up, never "In 0 min"');
  assert.equal(at('2026-10-22T22:30:00Z'), 'Happening now');
  assert.equal(startsIn(start, Date.parse('2026-10-22T21:00:00Z')), '');
  // Tech Fuse's poster, day one: "Today" until the hour before the doors.
  assert.equal(countdown('2026-10-15T13:00:00.000Z', '2026-10-16T22:00:00.000Z', Date.parse('2026-10-15T11:30:00Z')), 'Today');
  assert.equal(countdown('2026-10-15T13:00:00.000Z', '2026-10-16T22:00:00.000Z', Date.parse('2026-10-15T12:15:00Z')), 'In 45 min');
});

test('liveLabel (the event-mode TV stamp) counts down, then says Happening now, then nothing', () => {
  const e = { start: '2026-10-22T22:30:00.000Z', end: '2026-10-23T00:00:00.000Z' }; // CIJUG, Thu 5:30p–7p
  assert.equal(liveLabel(e, Date.parse('2026-10-21T15:00:00Z')), 'Tomorrow at 5:30p');
  assert.equal(liveLabel(e, Date.parse('2026-10-22T14:00:00Z')), 'Tonight at 5:30p');
  assert.equal(liveLabel(e, Date.parse('2026-10-22T22:05:00Z')), 'Starts in 25 min');
  assert.equal(liveLabel(e, Date.parse('2026-10-22T23:00:00Z')), 'Happening now');
  assert.equal(liveLabel(e, Date.parse('2026-10-23T00:00:00Z')), '');
  assert.equal(liveLabel(e, Date.parse('2026-10-18T15:00:00Z')), '', 'days out: the big date already says when');
});

test('lineup reads bold "time · title — speaker" lines', () => {
  const text = 'Doors open at 5 PM.\n\n**5:45 PM · Records on the JVM** — Sam Lee\nA tour.\n\n**6:30 PM · Virtual threads** — Ana Ruiz\nMore.';
  assert.deepEqual(lineup(text), [
    { time: '5:45p', title: 'Records on the JVM', speaker: 'Sam Lee' },
    { time: '6:30p', title: 'Virtual threads', speaker: 'Ana Ruiz' },
  ]);
  assert.deepEqual(lineup('Talk schedule pending.'), []);
  assert.deepEqual(lineup(undefined), []);
});

test('formatDescription drops *** / --- / ___ rule lines instead of printing them', () => {
  assert.equal(formatDescription('One\n***\nTwo\n\n- - -\n\nThree\n___'), '<p>One</p><p>Two</p><p>Three</p>');
  assert.equal(formatDescription('**Agenda**\n- Pizza'), '<p><strong>Agenda</strong><br>- Pizza</p>', 'a list dash is not a rule');
});
