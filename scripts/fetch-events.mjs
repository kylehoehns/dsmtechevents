// Pulls events for every group in data/groups.yaml and writes one JSON file
// per group to data/cache/. The site build reads only the cache.
//
// Source of truth for upcoming events is each group's public iCal feed. For
// Meetup groups we also read the JSON embedded in the group's events page to
// pick up venue, photo and RSVP count, which the feed leaves out, and the
// group's recent past events, which the feed doesn't include at all. That page
// is not a public API and may change, so failures there are logged and ignored.
//
// Groups that aren't on Meetup and have no feed can name a reader in
// scripts/sources/ with `source:` in groups.yaml (e.g. `source: secdsm`).
//
// Past events from the previous cache are carried forward for BACKFILL_DAYS,
// so history keeps building even if Meetup stops showing an event.
// If a group's feed fails, its previous cache file is left alone, so one bad
// run never empties the calendar.

import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { meetupSlug, meetupUrl } from '../src/lib/meetup.mjs';
import secdsm from './sources/secdsm.mjs';
import pmiChapter from './sources/pmi-chapter.mjs';
import taiTechbrew from './sources/tai-techbrew.mjs';
import iowansOfThings from './sources/iowans-of-things.mjs';
import { parseFeed, parseEventsPage, enrich, mergeCache, checkEmptyFeed } from './sources/meetup.mjs';
import { updateArchive } from './archive.mjs';
import { manualEvent } from '../src/lib/data.mjs';
import { safeLinks } from './sources/html.mjs';
import { sourceStatus } from './source-status.mjs';

const SOURCES = { secdsm, 'pmi-chapter': pmiChapter, 'tai-techbrew': taiTechbrew, 'iowans-of-things': iowansOfThings };

const root = path.resolve(import.meta.dirname, '..');
const cacheDir = path.join(root, 'data/cache');
const UA = 'dsmtechevents/1.0 (+https://dsmtechevents.com; community event calendar, fetched four times a day)';
const BACKFILL_DAYS = 90;

const groups = YAML.parse(await fs.readFile(path.join(root, 'data/groups.yaml'), 'utf8'));
await fs.mkdir(cacheDir, { recursive: true });

// What went wrong this run, for scripts/source-issues.mjs to turn into GitHub
// issues. One group failing never stops the others: its last cache stays.
const report = { ok: [], problems: [] };
let failures = 0;
for (const group of groups) {
  try {
    const { enrichError, ...result } = await fetchGroup(group);
    await fs.writeFile(path.join(cacheDir, `${group.id}.json`), JSON.stringify(result, null, 2) + '\n');
    const past = result.events.filter((e) => Date.parse(e.end) < Date.now()).length;
    console.log(`✓ ${group.id}: ${result.events.length - past} upcoming, ${past} past${enrichError ? ' (no enrichment)' : ''}`);
    if (enrichError) report.problems.push({ id: group.id, name: group.name, kind: 'details', message: enrichError });
    else report.ok.push(group.id);
  } catch (err) {
    failures++;
    console.warn(`✗ ${group.id}: ${err.message} — keeping previous cache`);
    report.problems.push({ id: group.id, name: group.name, kind: 'fetch', message: err.message });
  }
  await new Promise((r) => setTimeout(r, 500)); // be polite to Meetup
}
await fs.writeFile(path.join(root, 'fetch-report.json'), JSON.stringify(report, null, 2) + '\n');

// The same facts, committed for the /status/ page (see source-status.mjs).
const statusFile = path.join(cacheDir, 'status.json');
const statusBefore = await fs.readFile(statusFile, 'utf8').catch(() => null);
const status = JSON.stringify(sourceStatus(JSON.parse(statusBefore ?? '{}'), report, Date.now()), null, 2) + '\n';
if (status !== statusBefore) await fs.writeFile(statusFile, status);

// Every ended event also goes into data/archive/<year>.json, which keeps them
// after they age out of the cache's 90 days.
const archiveDir = path.join(root, 'data/archive');
await fs.mkdir(archiveDir, { recursive: true });
const archive = {};
for (const f of await fs.readdir(archiveDir)) {
  if (f.endsWith('.json')) archive[f.slice(0, -5)] = JSON.parse(await fs.readFile(path.join(archiveDir, f), 'utf8'));
}
const caches = Object.fromEntries(await Promise.all(groups.map(async (g) => [g.id, await readCache(g.id)])));
// Hand-added events (conferences) are archived too once they end.
const manual = (YAML.parse(await fs.readFile(path.join(root, 'data/events.yaml'), 'utf8')) ?? []).map(manualEvent);
for (const [year, list] of Object.entries(updateArchive(archive, caches, Date.now(), manual))) {
  await fs.writeFile(path.join(archiveDir, `${year}.json`), JSON.stringify(list, null, 1) + '\n');
  console.log(`archive ${year}: ${list.length} events`);
}
if (failures === groups.length) {
  console.error('Every feed failed. Building from cache only.');
}

async function fetchGroup(group) {
  const now = Date.now();
  const cutoff = now - BACKFILL_DAYS * 86_400_000;

  const previous = await readCache(group.id);
  let fresh;
  if (group.source) {
    const read = SOURCES[group.source];
    if (!read) throw new Error(`unknown source "${group.source}"`);
    const events = (await read(group, { get, now, since: cutoff })).filter((e) => Date.parse(e.end) >= cutoff);
    fresh = { events, logo: group.logo ?? null };
  } else {
    const hadUpcoming = previous.events.filter((e) => Date.parse(e.end) >= now).length;
    fresh = await fetchFeed(group, now, cutoff, hadUpcoming);
  }

  fresh.events = safeLinks(fresh.events, group);
  return { ...mergeCache(previous, fresh, { now, cutoff }), enrichError: fresh.enrichError };
}

// Meetup groups and plain iCal feeds.
async function fetchFeed(group, now, cutoff, hadUpcoming) {
  const slug = meetupSlug(group.meetup);
  const feedUrl = group.ical ?? (slug && meetupUrl(slug, 'events/ical/'));
  if (!feedUrl) throw new Error('needs a meetup, ical or source entry');

  const upcoming = parseFeed(await get(feedUrl), group, { slug, now });

  let recent = [];
  let logo = null;
  let facts = {};
  let enrichError = null;
  let details = null;
  if (slug) {
    try {
      details = parseEventsPage(await get(meetupUrl(slug, 'events/')), slug);
      logo = details.logo;
      recent = enrich(upcoming, details, group, { now, cutoff });
      facts = { members: details.members, pastCount: details.pastCount, lastMet: details.lastMet };
    } catch (err) {
      console.warn(`  ${group.id}: enrichment skipped (${err.message})`);
      enrichError = `Meetup events page: ${err.message}`;
    }
    checkEmptyFeed(upcoming, details, { now, hadUpcoming });
  }

  // The feed's copy of an upcoming event wins over the page's. If the page
  // failed, mergeCache keeps the page details from the previous run.
  return { events: [...recent, ...upcoming], logo, ...facts, pageFailed: Boolean(enrichError), enrichError };
}

async function readCache(id) {
  try {
    return JSON.parse(await fs.readFile(path.join(cacheDir, `${id}.json`), 'utf8'));
  } catch {
    return { events: [] };
  }
}

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.text();
}
