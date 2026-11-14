import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planOnboarding, QUESTION } from '../scripts/discord-onboarding.mjs';

const group = (short, n) => ({ short, name: `${short} group`, role: `role-${n}`, category: `cat-${n}` });
const want = (groups, defaults = ['c1', 'c2', 'c3']) => ({ default_channel_ids: defaults, groups });
const option = (g, id) => ({ id, title: g.short, description: g.name, channel_ids: [g.category], role_ids: [g.role], emoji: null });
const live = (options, defaults = ['c3', 'c1', 'c2']) => ({
  enabled: true, mode: 0, default_channel_ids: defaults,
  prompts: [{ id: 'q1', type: 0, title: QUESTION, single_select: false, required: false, in_onboarding: true, options }],
});

const cijug = group('CIJUG', 1);
const pyowa = group('Pyowa', 2);
const aws = group('AWS', 3);
const devops = group('DevOpsDSM', 4);

test('answers are listed A to Z, and each keeps the ID it already had, found by its role', () => {
  const body = planOnboarding(live([option(cijug, 'o1'), option(pyowa, 'o2'), option(aws, 'o3')]), want([cijug, pyowa, aws]));
  assert.deepEqual(body.prompts[0].options.map((o) => [o.title, o.id]), [['AWS', 'o3'], ['CIJUG', 'o1'], ['Pyowa', 'o2']]);
  assert.equal(body.prompts[0].id, 'q1', 'the question keeps its ID too');
});

test('a group added mid-alphabet gets a new answer, and no one else\'s answer changes ID', () => {
  const current = live([option(aws, 'o3'), option(cijug, 'o1'), option(pyowa, 'o2')]);
  const body = planOnboarding(current, want([cijug, pyowa, aws, devops]));
  assert.deepEqual(body.prompts[0].options.map((o) => [o.title, o.id ?? 'new']), [['AWS', 'o3'], ['CIJUG', 'o1'], ['DevOpsDSM', 'new'], ['Pyowa', 'o2']]);
  assert.deepEqual(body.prompts[0].options[2], { title: 'DevOpsDSM', description: 'DevOpsDSM group', channel_ids: ['cat-4'], role_ids: ['role-4'] });
});

test('nothing is sent when Discord already matches, whatever order it returns the default channels in', () => {
  assert.equal(planOnboarding(live([option(aws, 'o3'), option(cijug, 'o1'), option(pyowa, 'o2')]), want([cijug, pyowa, aws])), null);
});

test('a removed group\'s answer goes; a changed default channel or a renamed group is sent', () => {
  const current = live([option(aws, 'o3'), option(cijug, 'o1'), option(pyowa, 'o2')]);
  assert.deepEqual(planOnboarding(current, want([cijug, aws])).prompts[0].options.map((o) => o.title), ['AWS', 'CIJUG']);
  assert.deepEqual(planOnboarding(current, want([cijug, pyowa, aws], ['c1', 'c2', 'c9'])).default_channel_ids, ['c1', 'c2', 'c9']);
  assert.notEqual(planOnboarding(current, want([{ ...cijug, name: 'Java folks' }, pyowa, aws])), null);
});

test('a server with no question yet gets one; with no groups there\'s no question; onboarding is always on', () => {
  const fresh = { enabled: false, mode: 0, default_channel_ids: [], prompts: [] };
  const body = planOnboarding(fresh, want([cijug]));
  assert.deepEqual([body.enabled, body.mode, body.prompts[0].id, body.prompts[0].title], [true, 0, '0', QUESTION]);
  assert.deepEqual(planOnboarding(fresh, want([])).prompts, []);
  assert.equal(planOnboarding({ ...fresh, enabled: true, default_channel_ids: ['c1', 'c2', 'c3'] }, want([])), null);
});
