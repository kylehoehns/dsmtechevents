// The refresh: fetch every group in data/groups.yaml and every `luma:` event
// in data/events.yaml, and write data/cache/, data/archive/ and
// fetch-report.json. scripts/fetch-events.mjs runs it from the command line
// and scripts/add-listing.mjs runs it for one new listing. Everything that
// reaches the network goes through `get`, so tests pass saved pages instead.
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
// run never empties the calendar. Every file is written only when its
// contents change, so an unchanged run leaves git with nothing to commit.
//
// `only: <id>` fetches one group (or `luma-<slug>` event) and nothing else:
// no status, archive or fetch report.

import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { meetupSlug, meetupUrl } from '../src/lib/meetup.mjs';
import secdsm from './sources/secdsm.mjs';
import pmiChapter from './sources/pmi-chapter.mjs';
import taiTechbrew from './sources/tai-techbrew.mjs';
import iowansOfThings from './sources/iowans-of-things.mjs';
import iibaChapter from './sources/iiba-chapter.mjs';
import issaChapter from './sources/issa-chapter.mjs';
import eventbrite from './sources/eventbrite.mjs';
import readLuma from './sources/luma.mjs';
import { parseFeed, parseEventsPage, enrich, cancelledIds, checkEmptyFeed, FROM_PAGE } from './sources/meetup.mjs';
import { updateArchive } from './archive.mjs';
import { manualEvent, readLumaCache, lumaSlug } from '../src/lib/data.mjs';
import { safeLinks, checkTimes } from './sources/html.mjs';
import { sourceStatus } from './source-status.mjs';

const SOURCES = { secdsm, 'pmi-chapter': pmiChapter, 'tai-techbrew': taiTechbrew, 'iowans-of-things': iowansOfThings, 'iiba-chapter': iibaChapter, 'issa-chapter': issaChapter, eventbrite };

// Every script that visits other sites sends this, so they see one polite visitor.
export const UA = 'dsmtechevents/1.0 (+https://dsmtechevents.com; community event calendar, fetched four times a day)';
const BACKFILL_DAYS = 90;

export async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.text();
}

// One run. Returns the report: { ok: [ids], problems: [{ id, name, kind, message }] }.
// `pause` is the wait between groups, to be polite to Meetup.
export async function refresh({ root, only = null, get: fetchText = get, now = Date.now(), pause = 500, log = console }) {
  const dataDir = path.join(root, 'data');
  const cacheDir = path.join(dataDir, 'cache');
  const groups = YAML.parse(await fs.readFile(path.join(dataDir, 'groups.yaml'), 'utf8'))
    .filter((g) => !only || g.id === only);
  const eventsYaml = YAML.parse(await fs.readFile(path.join(dataDir, 'events.yaml'), 'utf8')) ?? [];
  const lumaEntries = eventsYaml.filter((e) => e.luma && (!only || `luma-${lumaSlug(e.luma)}` === only));
  if (only && !groups.length && !lumaEntries.length) throw new Error(`--only ${only}: no such group or luma: event`);
  await fs.mkdir(cacheDir, { recursive: true });
  // A missing or unreadable cache file starts the group over.
  const readCache = (id) => readJson(path.join(cacheDir, `${id}.json`)).catch(() => ({ events: [] }));

  // What went wrong this run, for scripts/source-issues.mjs to turn into GitHub
  // issues. One group failing never stops the others: its last cache stays.
  const report = { ok: [], problems: [] };
  let failures = 0;
  for (const [i, group] of groups.entries()) {
    if (i) await new Promise((r) => setTimeout(r, pause));
    try {
      const { enrichError, ...result } = await refreshGroup(group, await readCache(group.id), { get: fetchText, now });
      await writeIfChanged(path.join(cacheDir, `${group.id}.json`), JSON.stringify(result, null, 2) + '\n');
      if (enrichError) log.warn(`  ${group.id}: enrichment skipped (${enrichError})`);
      const past = result.events.filter((e) => Date.parse(e.end) < now).length;
      log.log(`✓ ${group.id}: ${result.events.length - past} upcoming, ${past} past${enrichError ? ' (no enrichment)' : ''}`);
      if (enrichError) report.problems.push({ id: group.id, name: group.name, kind: 'details', message: enrichError });
      else report.ok.push(group.id);
    } catch (err) {
      failures++;
      log.warn(`✗ ${group.id}: ${err.message} — keeping previous cache`);
      report.problems.push({ id: group.id, name: group.name, kind: 'fetch', message: err.message });
    }
  }

  const lumaFile = path.join(cacheDir, 'luma.json');
  const lumaBefore = await readJson(lumaFile, {});
  const luma = await refreshLuma(lumaEntries, lumaBefore, { get: fetchText, now, log });
  report.ok.push(...luma.ok);
  report.problems.push(...luma.problems);
  // With `only`, every other entry stays as it was.
  const lumaNext = only ? { ...lumaBefore, ...luma.next } : luma.next;
  if (Object.keys(lumaBefore).length || lumaEntries.length) await writeIfChanged(lumaFile, JSON.stringify(lumaNext, null, 2) + '\n');
  if (only) return report;

  await fs.writeFile(path.join(root, 'fetch-report.json'), JSON.stringify(report, null, 2) + '\n');
  // The same facts, committed for the /status/ page (see source-status.mjs).
  const statusFile = path.join(cacheDir, 'status.json');
  await writeIfChanged(statusFile, JSON.stringify(sourceStatus(await readJson(statusFile, {}), report, now), null, 2) + '\n');

  // Every ended event also goes into data/archive/<year>.json, which keeps them
  // after they age out of the cache's 90 days.
  const archiveDir = path.join(dataDir, 'archive');
  await fs.mkdir(archiveDir, { recursive: true });
  const archive = {};
  for (const f of await fs.readdir(archiveDir)) {
    if (f.endsWith('.json')) archive[f.slice(0, -5)] = await readJson(path.join(archiveDir, f), []);
  }
  const caches = Object.fromEntries(await Promise.all(groups.map(async (g) => [g.id, await readCache(g.id)])));
  // Hand-added events (conferences) are archived too once they end.
  const lumaCache = readLumaCache(dataDir);
  const manual = eventsYaml.map((e) => manualEvent(e, lumaCache)).filter(Boolean);
  for (const [year, list] of Object.entries(updateArchive(archive, caches, now, manual))) {
    await writeIfChanged(path.join(archiveDir, `${year}.json`), JSON.stringify(list, null, 1) + '\n');
    log.log(`archive ${year}: ${list.length} events`);
  }
  if (failures === groups.length) {
    log.error('Every feed failed. Building from cache only.');
  }
  return report;
}

// One group's new cache file from its previous one. Throws when the group's
// source can't be read, so the caller keeps the previous file.
async function refreshGroup(group, previous, { get, now }) {
  const cutoff = now - BACKFILL_DAYS * 86_400_000;
  let fresh;
  if (group.source) {
    const read = SOURCES[group.source];
    if (!read) throw new Error(`unknown source "${group.source}"`);
    const events = (await read(group, { get, now, since: cutoff })).filter((e) => Date.parse(e.end) >= cutoff);
    fresh = { events, logo: group.logo ?? null };
  } else {
    const hadUpcoming = previous.events.filter((e) => Date.parse(e.end) >= now).length;
    fresh = await readFeed(group, { get, now, cutoff, hadUpcoming });
  }

  fresh.events = safeLinks(checkTimes(fresh.events), group);
  return { ...mergeCache(previous, fresh, { now, cutoff }), enrichError: fresh.enrichError };
}

// Meetup groups and plain iCal feeds.
async function readFeed(group, { get, now, cutoff, hadUpcoming }) {
  const slug = meetupSlug(group.meetup);
  const feedUrl = group.ical ?? (slug && meetupUrl(slug, 'events/ical/'));
  if (!feedUrl) throw new Error('needs a meetup, ical or source entry');

  const upcoming = parseFeed(await get(feedUrl), group, { slug, now });

  let recent = [];
  let logo = null;
  let facts = {};
  let enrichError = null;
  let details = null;
  let cancelled = [];
  if (slug) {
    try {
      // Meetup's CDN keeps copies of this page for hours, while the feed is
      // current, so a new photo or venue would lag the new title. A query
      // string it hasn't seen makes it fetch a fresh one.
      details = parseEventsPage(await get(meetupUrl(slug, `events/?_=${now}`)), slug);
      logo = details.logo;
      recent = enrich(upcoming, details, group, { now, cutoff });
      cancelled = cancelledIds(details, group);
      facts = { members: details.members, pastCount: details.pastCount, lastMet: details.lastMet };
    } catch (err) {
      enrichError = `Meetup events page: ${err.message}`;
    }
    checkEmptyFeed(upcoming, details, { now, hadUpcoming });
  }

  // The feed's copy of an upcoming event wins over the page's. If the page
  // failed, mergeCache keeps the page details from the previous run.
  return { events: [...recent, ...upcoming], cancelled, logo, ...facts, keep: enrichError ? FROM_PAGE : undefined, enrichError };
}

// Each `luma:` event's details, by slug. Like a group, one that fails keeps
// what it had and gets a source-broken issue. An event that's over is not
// read again: nothing about it can change, and Luma may take the page down.
async function refreshLuma(entries, previous, { get, now, log = console }) {
  const next = {};
  const ok = [];
  const problems = [];
  for (const e of entries) {
    const slug = lumaSlug(e.luma);
    const id = `luma-${slug}`;
    const had = previous[slug];
    if (had && Date.parse(had.end) < now) {
      next[slug] = had;
      continue;
    }
    try {
      [next[slug]] = safeLinks(checkTimes([await readLuma(e.luma, { get })]), {});
      log.log(`✓ ${id}: ${next[slug].title}`);
      ok.push(id);
    } catch (err) {
      if (had) next[slug] = had;
      log.warn(`✗ ${id}: ${err.message}${had ? ' — keeping previous details' : ''}`);
      problems.push({ id, name: e.title ?? had?.title ?? e.luma, kind: 'fetch', message: err.message });
    }
  }
  return { next, ok, problems };
}

// Merge a fresh fetch into the previous cache file: past events from the cache
// are kept for the backfill window, the fresh copy of an event wins, and
// `fetchedAt` only moves when something actually changed (so an unchanged
// run leaves the file alone and the refresh workflow has nothing to commit).
// `fresh.keep`: fields a reader couldn't get this run (the Meetup events page
// failed, so the feed-only copies lack what the page adds); they come from
// the previous copy of the same event instead of vanishing until the next run.
// `fresh.cancelled`: ids the page says are cancelled, never carried forward.
export function mergeCache(previous, fresh, { now, cutoff, fetchedAt = new Date(now).toISOString() }) {
  const cancelled = new Set(fresh.cancelled);
  const carried = previous.events.filter((e) => Date.parse(e.end) < now && Date.parse(e.end) >= cutoff && !cancelled.has(e.id));
  const before = new Map(previous.events.map((e) => [e.id, e]));
  const freshEvents = fresh.keep
    ? fresh.events.map((e) => ({ ...e, ...pick(before.get(e.id), fresh.keep) }))
    : fresh.events;
  const byId = new Map();
  for (const e of [...carried, ...freshEvents]) byId.set(e.id, { ...byId.get(e.id), ...e });
  const { fetchedAt: lastFetched, enriched, ...previousResult } = previous;
  // `added`: when an upcoming event first showed up, for its "New" tag
  // (isNew in format.mjs). Set once and then kept, so files stay the same
  // run to run. An event this run is the first to see is new as of now; we
  // go by when we saw it rather than the feed's created time, since an
  // event drafted weeks ago and announced today is news today. An event we
  // have no record of appearing (a group's first fetch, or a cache from
  // before this was kept) takes the feed's created time, or goes without:
  // better no tag than a new group's whole calendar tagged New.
  const events = [...byId.values()].map(({ status, created, ...e }) => {
    const appeared = lastFetched && !before.has(e.id) && Date.parse(e.end) >= now;
    const added = before.get(e.id)?.added ?? (appeared ? fetchedAt : created);
    return added ? { ...e, added } : e;
  }).sort((a, b) => a.start.localeCompare(b.start));

  // Group facts from Meetup: kept from the last run if this one missed them,
  // and left out when unknown so files without them don't change.
  const facts = {};
  for (const k of ['members', 'pastCount', 'lastMet']) {
    const v = fresh[k] ?? previous[k];
    if (v != null) facts[k] = v;
  }
  const result = { logo: fresh.logo ?? previous.logo ?? null, ...facts, events };
  // `enriched` was written by older versions; ignoring it (above) means
  // dropping it rewrites each file once without moving fetchedAt.
  const unchanged = lastFetched && JSON.stringify(previousResult) === JSON.stringify(result);
  return { fetchedAt: unchanged ? lastFetched : fetchedAt, ...result };
}

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));

// `fallback` when the file doesn't exist yet. A file that's there but won't
// parse throws, rather than being written over.
async function readJson(file, fallback) {
  const text = await fs.readFile(file, 'utf8').catch((err) => {
    if (err.code === 'ENOENT' && fallback !== undefined) return null;
    throw err;
  });
  return text === null ? fallback : JSON.parse(text);
}

async function writeIfChanged(file, text) {
  if (await fs.readFile(file, 'utf8').catch(() => null) !== text) await fs.writeFile(file, text);
}
