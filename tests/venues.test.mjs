import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostedVenues } from '../src/lib/venues.mjs';

test('counts each meetup once per venue, most-used first', () => {
  const rows = hostedVenues([
    { venue: 'Source Allies', start: '2026-07-13T23:30:00Z', group: 'webgeeks' },
    // The same joint night, archived once per host, and again from the cache with the address.
    { venue: 'Source Allies', start: '2026-08-11T23:00:00Z', group: 'cijug' },
    { venue: 'Source Allies', start: '2026-08-11T23:00:00Z', group: 'iadnug' },
    { venue: 'Source Allies ', start: '2026-08-11T23:00:00Z', groupIds: ['cijug', 'iadnug'], address: '4501 NW Urbandale Dr, Urbandale' },
    { venue: 'We Write Code', start: '2026-09-15T23:00:00Z', group: 'dsmai' },
    { venue: 'Online', start: '2026-09-16T17:00:00Z', group: 'iadnug' },
    { venue: 'Zoom', online: true, start: '2026-09-17T17:00:00Z', group: 'iadnug' },
    { start: '2026-09-18T17:00:00Z', group: 'pyowa' },
  ]);
  assert.deepEqual(rows.map((r) => [r.name, r.count, r.groups, r.address]), [
    ['Source Allies', 2, ['webgeeks', 'cijug', 'iadnug'], '4501 NW Urbandale Dr, Urbandale'],
    ['We Write Code', 1, ['dsmai'], null],
  ]);
});

test('ties go to the venue used most recently', () => {
  const rows = hostedVenues([
    { venue: 'Big Grove Brewery', start: '2026-09-22T23:00:00Z', group: 'producttank' },
    { venue: 'Wellmark Building', start: '2026-07-28T23:00:00Z', group: 'dsmdata' },
  ]);
  assert.deepEqual(rows.map((r) => r.name), ['Big Grove Brewery', 'Wellmark Building']);
});

test('one room under slightly different names is one venue', () => {
  const rows = hostedVenues([
    { venue: 'Lean Techniques, Inc.', start: '2026-03-10T23:00:00Z', group: 'aws' },
    { venue: 'Lean Techniques', start: '2026-05-12T23:00:00Z', group: 'aws' },
  ]);
  assert.deepEqual(rows.map((r) => [r.name, r.count]), [['Lean Techniques, Inc.', 2]]);
});
