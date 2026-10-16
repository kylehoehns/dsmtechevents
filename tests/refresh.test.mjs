import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { refresh } from '../scripts/refresh.mjs';

const fixture = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const now = Date.parse('2026-10-07T17:00:00Z');
const quiet = { log() {}, warn() {}, error() {} };
const PAGES = {
  'https://www.meetup.com/iadnug/events/ical/': () => fixture('meetup-feed.ics'),
  'https://www.meetup.com/iadnug/events/': () => fixture('meetup-events-page.html'),
  'https://api.lu.ma/url?url=04xz1l03': () => fixture('luma-event.json'),
};

// A data folder with one Meetup group and one Luma event, and a `get` that
// serves the saved pages and records what was asked for.
function setup({ groups = [{ id: 'iadnug', name: 'Iowa .NET User Group', short: 'IADNUG', meetup: 'https://www.meetup.com/iadnug/' }], pages = PAGES } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-'));
  fs.mkdirSync(path.join(root, 'data'));
  fs.writeFileSync(path.join(root, 'data/groups.yaml'), JSON.stringify(groups));
  fs.writeFileSync(path.join(root, 'data/events.yaml'), JSON.stringify([{ luma: 'https://luma.com/04xz1l03' }]));
  const asked = [];
  const get = async (url) => {
    asked.push(url);
    if (!pages[url]) throw new Error(`404 from ${url}`);
    return pages[url]();
  };
  const run = (opts = {}) => refresh({ root, get, now, pause: 0, log: quiet, ...opts });
  const read = (f) => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
  return { root, run, read, asked };
}

// Every file under data/, with when it was last written.
const snapshot = (root) => Object.fromEntries(fs.readdirSync(path.join(root, 'data'), { recursive: true })
  .map((f) => path.join(root, 'data', f)).filter((f) => fs.statSync(f).isFile())
  .map((f) => [path.relative(root, f), fs.statSync(f).mtimeMs]));

test('a run writes each group\'s cache, Luma\'s and the status, and a second run with nothing new writes nothing', async () => {
  const { root, run, read } = setup();
  const report = await run();
  assert.deepEqual(report, { ok: ['iadnug', 'luma-04xz1l03'], problems: [] });
  assert.equal(read('cache/iadnug.json').events.find((e) => e.id === 'iadnug-300000001').title, '.NET@Noon - Build a Voice Agent');
  assert.ok(read('cache/luma.json')['04xz1l03']);
  assert.deepEqual(read('cache/status.json'), {});

  const before = snapshot(root);
  await new Promise((r) => setTimeout(r, 20));
  await run({ now: now + 3_600_000 });
  assert.deepEqual(snapshot(root), before);
});

test('when the Meetup events page fails, the last run\'s venue and photo stay and the problem is a details one', async () => {
  const pages = { ...PAGES };
  const { run, read } = setup({ pages });
  await run();
  const before = read('cache/iadnug.json').events.find((e) => e.id === 'iadnug-300000001');
  assert.ok(before.venue && before.image);

  delete pages['https://www.meetup.com/iadnug/events/'];
  const report = await run();
  assert.deepEqual(report.problems.map((p) => [p.id, p.kind]), [['iadnug', 'details']]);
  const after = read('cache/iadnug.json').events.find((e) => e.id === 'iadnug-300000001');
  assert.deepEqual([after.venue, after.image], [before.venue, before.image]);
});

test('a group whose source can\'t be read keeps its previous cache file, and the others carry on', async () => {
  const { root, run, read } = setup({ groups: [
    { id: 'gone', name: 'Gone', short: 'Gone', source: 'no-such-reader' },
    { id: 'iadnug', name: 'Iowa .NET User Group', short: 'IADNUG', meetup: 'https://www.meetup.com/iadnug/' },
  ] });
  fs.mkdirSync(path.join(root, 'data/cache'));
  fs.writeFileSync(path.join(root, 'data/cache/gone.json'), '{"events":[],"kept":true}\n');
  const report = await run();
  assert.deepEqual(report.problems.map((p) => [p.id, p.kind, p.message]), [['gone', 'fetch', 'unknown source "no-such-reader"']]);
  assert.equal(read('cache/gone.json').kept, true);
  assert.ok(read('cache/iadnug.json').events.length);
  assert.deepEqual(Object.keys(read('cache/status.json')), ['gone']);
});

test('a Luma event that is over is not read again', async () => {
  const { run, asked } = setup();
  await run();
  asked.length = 0;
  await run({ now: Date.parse('2026-10-21T00:00:00Z') });
  assert.ok(!asked.some((u) => u.includes('lu.ma')), asked.join('\n'));
});

test('only: one listing is fetched, nothing else is written, and other Luma events stay', async () => {
  const { root, run, read, asked } = setup();
  fs.mkdirSync(path.join(root, 'data/cache'));
  fs.writeFileSync(path.join(root, 'data/cache/luma.json'), '{"other": {"title": "Kept"}}\n');
  const report = await run({ only: 'luma-04xz1l03' });
  assert.deepEqual(report, { ok: ['luma-04xz1l03'], problems: [] });
  assert.ok(asked.every((u) => u.includes('lu.ma')));
  assert.deepEqual(Object.keys(read('cache/luma.json')).sort(), ['04xz1l03', 'other']);
  assert.ok(!fs.existsSync(path.join(root, 'fetch-report.json')));
  assert.ok(!fs.existsSync(path.join(root, 'data/cache/status.json')));
  await assert.rejects(run({ only: 'nope' }), /no such group/);
});
