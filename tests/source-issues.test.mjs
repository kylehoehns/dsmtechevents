import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planIssues } from '../scripts/source-issues.mjs';

const broken = { id: 'techbrew', name: 'TAI TechBrew', kind: 'fetch', message: '404 from https://www.technologyiowa.org/...' };

test('a newly broken source opens one issue', () => {
  const actions = planIssues({ ok: ['pyowa'], problems: [broken] }, []);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'open');
  assert.equal(actions[0].title, 'Source broken: TAI TechBrew (techbrew)');
  assert.match(actions[0].body, /404 from/);
  assert.match(actions[0].body, /showing what it had from the last good run/);
});

test('a source that is still broken updates its issue instead of opening another', () => {
  const open = [{ number: 41, title: 'Source broken: TAI TechBrew (techbrew)' }];
  assert.deepEqual(planIssues({ ok: [], problems: [broken] }, open).map((a) => [a.type, a.number]), [['update', 41]]);
});

test('a source that works again closes its issue', () => {
  const open = [{ number: 41, title: 'Source broken: TAI TechBrew (techbrew)' }];
  assert.deepEqual(planIssues({ ok: ['techbrew', 'pyowa'], problems: [] }, open).map((a) => [a.type, a.number]), [['close', 41]]);
});

test('ids are matched exactly, not as prefixes', () => {
  const open = [{ number: 7, title: 'Source broken: Data (dsmdata)' }];
  assert.deepEqual(planIssues({ ok: ['data'], problems: [] }, open), []);
});

test('a Meetup details failure says the events still came in', () => {
  const [a] = planIssues({ ok: [], problems: [{ ...broken, id: 'pyowa', name: 'Pyowa', kind: 'details' }] }, []);
  assert.match(a.body, /events still came in/);
});
