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
import { meetupSlug } from '../src/lib/meetup.mjs';
import { usualNight } from '../src/lib/pattern.mjs';
import secdsm from './sources/secdsm.mjs';
import pmiChapter from './sources/pmi-chapter.mjs';
import { parseFeed, parseEventsPage, enrich, mergeCache, typicalGoing } from './sources/meetup.mjs';

const SOURCES = { secdsm, 'pmi-chapter': pmiChapter };

const root = path.resolve(import.meta.dirname, '..');
const cacheDir = path.join(root, 'data/cache');
const UA = 'dsmtechevents/1.0 (+https://dsmtechevents.com; community event calendar, fetched four times a day)';
const BACKFILL_DAYS = 90;

const groups = YAML.parse(await fs.readFile(path.join(root, 'data/groups.yaml'), 'utf8'));
await fs.mkdir(cacheDir, { recursive: true });

let failures = 0;
for (const group of groups) {
  try {
    const result = await fetchGroup(group);
    await fs.writeFile(path.join(cacheDir, `${group.id}.json`), JSON.stringify(result, null, 2) + '\n');
    const past = result.events.filter((e) => Date.parse(e.end) < Date.now()).length;
    console.log(`✓ ${group.id}: ${result.events.length - past} upcoming, ${past} past${result.enriched ? '' : ' (no enrichment)'}`);
  } catch (err) {
    failures++;
    console.warn(`✗ ${group.id}: ${err.message} — keeping previous cache`);
  }
  await new Promise((r) => setTimeout(r, 500)); // be polite to Meetup
}
if (failures === groups.length) {
  console.error('Every feed failed. Building from cache only.');
}

async function fetchGroup(group) {
  const now = Date.now();
  const cutoff = now - BACKFILL_DAYS * 86_400_000;

  let fresh;
  if (group.source) {
    const read = SOURCES[group.source];
    if (!read) throw new Error(`unknown source "${group.source}"`);
    const events = (await read(group, { get })).filter((e) => Date.parse(e.end) >= cutoff);
    fresh = { events, logo: group.logo ?? null, enriched: true };
  } else {
    fresh = await fetchFeed(group, now, cutoff);
  }

  return mergeCache(await readCache(group.id), fresh, { now, cutoff });
}

// Meetup groups and plain iCal feeds.
async function fetchFeed(group, now, cutoff) {
  const slug = meetupSlug(group.meetup);
  const feedUrl = group.ical ?? (slug && `https://www.meetup.com/${slug}/events/ical/`);
  if (!feedUrl) throw new Error('needs a meetup, ical or source entry');

  const upcoming = parseFeed(await get(feedUrl), group, { slug, now });

  let recent = [];
  let logo = null;
  let typical = null;
  let facts = {};
  let enriched = false;
  if (slug) {
    try {
      const details = parseEventsPage(await get(`https://www.meetup.com/${slug}/events/`), slug);
      logo = details.logo;
      recent = enrich(upcoming, details, group, { now, cutoff });
      typical = typicalGoing(details, now);
      // The page lists ~10 past events plus upcoming ones: enough history to
      // see a group's usual night.
      const starts = [...details.events.values()].filter((e) => e.status !== 'CANCELLED').map((e) => e.start);
      facts = { members: details.members, pastCount: details.pastCount, usual: usualNight(starts) };
      enriched = true;
    } catch (err) {
      console.warn(`  ${group.id}: enrichment skipped (${err.message})`);
    }
  }

  // The feed's copy of an upcoming event wins over the page's.
  return { events: [...recent, ...upcoming], logo, typical, ...facts, enriched };
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
