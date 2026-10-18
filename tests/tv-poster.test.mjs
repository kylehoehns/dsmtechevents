import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanLabel } from '../src/lib/tv-poster.mjs';

test("a poster's code says RSVP for a Meetup event until it starts, details otherwise", () => {
  const meetup = 'https://www.meetup.com/cijug/events/1/';
  assert.equal(scanLabel(meetup), 'Scan to RSVP');
  assert.equal(scanLabel(meetup, true), 'Scan for details', 'nothing left to RSVP to once it is on');
  assert.equal(scanLabel('https://www.iowacodecamp.com/'), 'Scan for details');
  assert.equal(scanLabel(undefined), 'Scan for details');
});
