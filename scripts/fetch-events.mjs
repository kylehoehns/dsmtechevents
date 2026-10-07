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
// night never empties the calendar.

import fs from 'node:fs/promises';
import path from 'node:path';
import ical from 'node-ical';
import YAML from 'yaml';
import { meetupSlug } from '../src/lib/meetup.mjs';
import secdsm from './sources/secdsm.mjs';
import pmiChapter from './sources/pmi-chapter.mjs';

const SOURCES = { secdsm, 'pmi-chapter': pmiChapter };

const root = path.resolve(import.meta.dirname, '..');
const cacheDir = path.join(root, 'data/cache');
const UA = 'techdsm/1.0 (+https://techdsm.com; community event calendar, fetched nightly)';
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

  const previous = await readCache(group.id);
  const carried = previous.events.filter((e) => Date.parse(e.end) < now && Date.parse(e.end) >= cutoff);

  // Freshest copy wins over last night's cache.
  const byId = new Map();
  for (const e of [...carried, ...fresh.events]) byId.set(e.id, { ...byId.get(e.id), ...e });
  const events = [...byId.values()].map(({ status, ...e }) => e).sort((a, b) => a.start.localeCompare(b.start));

  return { fetchedAt: new Date().toISOString(), logo: fresh.logo ?? previous.logo ?? null, enriched: fresh.enriched, events };
}

// Meetup groups and plain iCal feeds.
async function fetchFeed(group, now, cutoff) {
  const slug = meetupSlug(group.meetup);
  const feedUrl = group.ical ?? (slug && `https://www.meetup.com/${slug}/events/ical/`);
  if (!feedUrl) throw new Error('needs a meetup, ical or source entry');

  const ics = await get(feedUrl);
  if (!ics.includes('BEGIN:VCALENDAR')) throw new Error('feed did not return a calendar');

  const upcoming = Object.values(ical.sync.parseICS(ics))
    .filter((e) => e.type === 'VEVENT' && e.status !== 'CANCELLED')
    .filter((e) => (e.end ?? e.start).getTime() >= now)
    .map((e) => {
      const id = /^event_([^@]+)@/.exec(e.uid)?.[1] ?? e.uid;
      return {
        id: `${group.id}-${id}`,
        sourceId: id,
        title: e.summary?.trim(),
        start: e.start.toISOString(),
        end: (e.end ?? e.start).toISOString(),
        allDay: e.datetype === 'date',
        url: slug ? `https://www.meetup.com/${slug}/events/${id}/` : (e.url?.val ?? e.url ?? group.website),
        description: cleanDescription(e.description, group.name),
        venue: e.location || null,
      };
    });

  const recent = [];
  let logo = null;
  let enriched = false;
  if (slug) {
    try {
      const extra = await meetupDetails(slug);
      logo = extra.logo;
      for (const ev of upcoming) Object.assign(ev, extra.events.get(ev.sourceId) ?? {});
      for (const [id, ev] of extra.events) {
        const end = Date.parse(ev.end);
        if (end < now && end >= cutoff && ev.status !== 'CANCELLED') {
          recent.push({ id: `${group.id}-${id}`, sourceId: id, allDay: false, ...ev });
        }
      }
      enriched = true;
    } catch (err) {
      console.warn(`  ${group.id}: enrichment skipped (${err.message})`);
    }
  }

  // The feed's copy of an upcoming event wins over the page's.
  return { events: [...recent, ...upcoming], logo, enriched };
}

async function readCache(id) {
  try {
    return JSON.parse(await fs.readFile(path.join(cacheDir, `${id}.json`), 'utf8'));
  } catch {
    return { events: [] };
  }
}

async function meetupDetails(slug) {
  const html = await get(`https://www.meetup.com/${slug}/events/`);
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('no __NEXT_DATA__ on page');
  const state = JSON.parse(m[1]).props?.pageProps?.__APOLLO_STATE__;
  if (!state) throw new Error('no Apollo state on page');

  const deref = (ref) => (ref?.__ref ? state[ref.__ref] : ref);
  const photo = (ref) => deref(ref)?.highResUrl?.replace('/highres_', '/600_') ?? null;

  const events = new Map();
  for (const [key, e] of Object.entries(state)) {
    if (!key.startsWith('Event:')) continue;
    const venue = deref(e.venue);
    const online = e.isOnline || e.eventType === 'ONLINE' || venue?.name === 'Online event';
    events.set(e.id, {
      title: e.title?.trim(),
      start: new Date(e.dateTime).toISOString(),
      end: new Date(e.endTime ?? e.dateTime).toISOString(),
      description: (e.description ?? '').trim().slice(0, 2000),
      status: e.status,
      url: e.eventUrl,
      venue: online ? 'Online' : venue?.name || null,
      address: online ? null : formatAddress(venue),
      online,
      hybrid: e.eventType === 'HYBRID',
      image: photo(e.displayPhoto ?? e.featuredEventPhoto),
      going: e.going?.totalCount ?? null,
    });
  }
  const group = Object.entries(state).find(([k, v]) => k.startsWith('Group:') && v.urlname === slug)?.[1];
  return { logo: photo(group?.keyGroupPhoto), events };
}

function formatAddress(venue) {
  if (!venue?.address) return venue?.city || null;
  const address = venue.address.replace(/, USA$/, '');
  return address.includes(venue.city) ? address : `${address}, ${venue.city}`;
}

// The feed prefixes every description with the group's name on its own line.
function cleanDescription(text = '', groupName) {
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines[0]?.trim() === groupName) lines.shift();
  return lines.join('\n').trim().slice(0, 2000);
}

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.text();
}
