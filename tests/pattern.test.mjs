import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usualNight } from '../src/lib/pattern.mjs';
import { localToUtc } from '../src/lib/time.mjs';

const at = (dates, time = '17:30') => dates.map((d) => localToUtc(d, time));

test('a steady nth-weekday group gets "4th Tue · 5:30p"', () => {
  // Pyowa-style: 4th Tuesdays.
  assert.equal(usualNight(at(['2026-07-28', '2026-08-25', '2026-09-22', '2026-10-27'])), '4th Tue · 5:30p');
});

test('same weekday but different weeks falls back to "Tuesdays"', () => {
  assert.equal(usualNight(at(['2026-07-07', '2026-08-18', '2026-09-22', '2026-10-27'])), 'Tuesdays · 5:30p');
});

test('mixed times leave the time off', () => {
  const starts = [...at(['2026-07-28'], '17:30'), ...at(['2026-08-25'], '18:00'), ...at(['2026-09-22'], '12:00'), ...at(['2026-10-27'], '16:00')];
  assert.equal(usualNight(starts), '4th Tue');
});

test('no pattern, or too few dates, gives null', () => {
  assert.equal(usualNight(at(['2026-07-06', '2026-08-13', '2026-09-23', '2026-10-30'])), null);
  assert.equal(usualNight(at(['2026-08-25', '2026-09-22', '2026-10-27'])), null);
});
