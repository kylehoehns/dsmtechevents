import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectLinks, planIssue } from '../scripts/check-links.mjs';

const ok = { url: 'https://www.meetup.com/pyowa/', where: 'groups.yaml: pyowa meetup', ok: true, detail: '200' };
const bad = { url: 'https://gone.example/', where: 'groups.yaml: x website', ok: false, detail: '404 from GET' };
const issue = { number: 7, title: 'Broken links on the site' };

test('collects meetup, website, logo and event links once each, skipping blanks', () => {
  const links = collectLinks(
    [
      { id: 'a', meetup: 'https://www.meetup.com/a/', website: 'https://a.example/' },
      { id: 'b', source: 'b', website: 'https://a.example/', logo: 'https://b.example/logo.png' },
      { id: 'c', meetup: 'https://www.meetup.com/c/' },
    ],
    [{ title: 'Conf', url: 'https://conf.example/' }, { title: 'No link' }],
  );
  assert.deepEqual(links.map((l) => l.url), ['https://www.meetup.com/a/', 'https://a.example/', 'https://b.example/logo.png', 'https://www.meetup.com/c/', 'https://conf.example/']);
  assert.equal(links[1].where, 'groups.yaml: a website');
  assert.equal(links[2].where, 'groups.yaml: b logo');
  assert.equal(links[4].where, 'events.yaml: Conf');
});

test('all links fine and no issue open: nothing to do', () => {
  assert.deepEqual(planIssue([ok], []), { type: 'none' });
});

test('a broken link opens one issue that lists it', () => {
  const a = planIssue([ok, bad], []);
  assert.equal(a.type, 'open');
  assert.match(a.body, /gone\.example.*404 from GET/);
  assert.doesNotMatch(a.body, /meetup\.com\/pyowa/);
});

test('still broken: updates the open issue instead of opening another', () => {
  const a = planIssue([bad], [issue], 'https://run');
  assert.equal(a.type, 'update');
  assert.equal(a.number, 7);
  assert.match(a.body, /Last run: https:\/\/run/);
});

test('all links fine again: closes the open issue', () => {
  const a = planIssue([ok], [issue]);
  assert.equal(a.type, 'close');
  assert.equal(a.number, 7);
});

test('ignores other issues that happen to carry the label', () => {
  assert.equal(planIssue([bad], [{ number: 3, title: 'Something else' }]).type, 'open');
});
