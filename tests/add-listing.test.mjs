import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tame, classify, alreadyListed, checkLumaEvent, checkMeetupGroup, defaultShort, uniqueId, insertGroup, appendEvent, pullRequest, issueAnswers, LeaveIt } from '../scripts/add-listing.mjs';

test('only exact Luma event and Meetup group links are automatic', () => {
  assert.deepEqual(classify('https://luma.com/04xz1l03'), { kind: 'luma', slug: '04xz1l03' });
  assert.deepEqual(classify(' https://lu.ma/04xz1l03/ '), { kind: 'luma', slug: '04xz1l03' });
  assert.deepEqual(classify('https://www.meetup.com/pyowa-iowa-python-user-group/'), { kind: 'meetup', slug: 'pyowa-iowa-python-user-group' });
  assert.deepEqual(classify('https://www.meetup.com/iadnug/events/312345678/?utm=x'), { kind: 'meetup', slug: 'iadnug' }, 'an event link means its group');
  for (const link of ['https://example.com/', 'https://luma.com/dev-days/events', 'https://www.meetup.com/find/', 'http://luma.com/04xz1l03', '`rm -rf /`', '', undefined]) {
    assert.throws(() => classify(link), LeaveIt, String(link));
  }
});

test('a link already in the data is caught, whatever its case', () => {
  const groups = [{ id: 'pyowa', name: 'Iowa Python User Group', meetup: 'https://www.meetup.com/pyowa-iowa-python-user-group/' }];
  const events = [{ luma: 'https://luma.com/04xz1l03', title: 'GitHub Dev Days' }, { title: 'Code Camp', url: 'https://lu.ma/abc123' }];
  assert.equal(alreadyListed({ kind: 'meetup', slug: 'Pyowa-Iowa-Python-User-Group' }, groups, events), 'Iowa Python User Group');
  assert.equal(alreadyListed({ kind: 'luma', slug: '04xz1l03' }, groups, events), 'GitHub Dev Days');
  assert.equal(alreadyListed({ kind: 'luma', slug: 'abc123' }, groups, events), 'Code Camp', 'a hand-written entry linking to it counts');
  assert.equal(alreadyListed({ kind: 'luma', slug: 'zzz999' }, groups, events), null);
});

test('a Luma event must be upcoming and in Iowa; online ones get a note', () => {
  const now = Date.parse('2026-10-12T12:00:00Z');
  const e = { title: 'Dev Days', start: '2026-10-20T20:00:00.000Z', end: '2026-10-20T22:00:00.000Z', address: '9131 Northpark Dr, Johnston, IA 50131' };
  assert.deepEqual(checkLumaEvent(e, now), []);
  assert.deepEqual(checkLumaEvent({ ...e, address: 'Des Moines, IA' }, now), [], 'address for guests only');
  assert.throws(() => checkLumaEvent({ ...e, end: '2026-10-01T00:00:00Z' }, now), /already over/);
  assert.throws(() => checkLumaEvent({ ...e, address: 'Prinzenstraße 34, 10969 Berlin, Germany' }, now), /isn't in Iowa/);
  assert.match(checkLumaEvent({ ...e, address: undefined, online: true }, now)[0], /online/);
});

test('a Meetup group must be public and in Iowa', () => {
  const g = { name: 'Iowa Python User Group', city: 'Des Moines', state: 'IA', isPrivate: false };
  assert.deepEqual(checkMeetupGroup(g, 'pyowa'), []);
  assert.throws(() => checkMeetupGroup({ ...g, isPrivate: true }, 'pyowa'), /private/);
  assert.throws(() => checkMeetupGroup({ ...g, city: 'Omaha', state: 'NE' }, 'pyowa'), /Omaha, NE/);
  assert.throws(() => checkMeetupGroup({ ...g, name: null }, 'pyowa'), /name/);
});

test('the pill name drops the place and "User Group", and ids never collide', () => {
  assert.equal(defaultShort('Iowa Python User Group'), 'Python');
  assert.equal(defaultShort('Des Moines Mobile Developers'), 'Mobile Developers');
  assert.equal(defaultShort('Central Iowa Java Users Group'), 'Java');
  assert.equal(defaultShort('SecDSM'), 'SecDSM');
  assert.equal(uniqueId('Data & Analytics', []), 'data-analytics');
  assert.equal(uniqueId('AWS', [{ id: 'aws' }, { id: 'aws-2' }]), 'aws-3');
});

test('a new group goes after the last Meetup group, keeping the comments', () => {
  const text = '# header\n#   id: ...\n\n- id: a\n  meetup: https://www.meetup.com/a/\n\n- id: b\n  meetup: https://www.meetup.com/b/\n\n- id: c\n  source: c\n';
  assert.equal(insertGroup(text, '- id: new\n  meetup: https://www.meetup.com/new/\n'),
    '# header\n#   id: ...\n\n- id: a\n  meetup: https://www.meetup.com/a/\n\n- id: b\n  meetup: https://www.meetup.com/b/\n\n- id: new\n  meetup: https://www.meetup.com/new/\n\n- id: c\n  source: c\n');
  assert.equal(appendEvent('# events\n\n- title: X\n', '- luma: https://luma.com/abc\n'), '# events\n\n- title: X\n\n- luma: https://luma.com/abc\n');
});

test('the PR closes its issue and lists what to check', () => {
  const pr = pullRequest({ title: 'Dev Days', entry: '- luma: https://luma.com/abc\n', facts: ['When: Tue'], warnings: ['It is online.'], preview: 'https://p.test/', id: 'luma-abc', issue: '12' });
  assert.equal(pr.title, 'Add Dev Days');
  assert.match(pr.body, /^## Summary\n/);
  assert.match(pr.body, /\*\*Check before merging:\*\*\n\n- It is online\./);
  assert.match(pr.body, /Preview: https:\/\/p\.test\//);
  assert.match(pr.body, /Closes #12$/);
  assert.doesNotMatch(pullRequest({ title: 'X', entry: '', facts: [], warnings: [], preview: '', id: 'x' }).body, /Check before|Closes/);
});

test("a page's words can't mention anyone, close an issue or break the formatting", () => {
  assert.equal(tame('Hi @kylehoehns, Fixes #3 `x`\nnext'), 'Hi @\u200bkylehoehns, Fixes #\u200b3  x next');
  const pr = pullRequest({ title: 'Fixes #3', entry: '- name: "@team"\n', facts: ['Where: Room #2'], warnings: [], preview: '', id: 'x', issue: '12' });
  assert.equal(pr.title, 'Add Fixes #\u200b3');
  assert.doesNotMatch(pr.body, /#3|@team|#2/);
  assert.match(pr.body, /Closes #12$/);
});

test("an issue form's answers are read by heading, and a blank one is empty", () => {
  const body = '### Link\n\nhttps://luma.com/04xz1l03\n\n### Short name\n\n_No response_\n\n### Does it fit?\n\n- [X] Public\n- [X] Tech';
  assert.deepEqual(issueAnswers(body), { Link: 'https://luma.com/04xz1l03', 'Short name': '', 'Does it fit?': '- [X] Public\n- [X] Tech' });
  assert.deepEqual(issueAnswers('### Link\r\n\r\nhttps://lu.ma/x\r\n'), { Link: 'https://lu.ma/x' });
  assert.deepEqual(issueAnswers(undefined), {});
});
