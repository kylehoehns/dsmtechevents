// Build-time loader: merges the nightly Meetup cache with hand-added events.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { meetupSlug } from './meetup.mjs';
import { dayKey } from './format.mjs';
import { localToUtc } from './time.mjs';

const dataDir = path.resolve('data');
const readYaml = (f) => YAML.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')) ?? [];

export function loadData() {
  const groups = readYaml('groups.yaml').map((g) => {
    const cacheFile = path.join(dataDir, 'cache', `${g.id}.json`);
    const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : { events: [] };
    const slug = meetupSlug(g.meetup);
    return {
      ...g,
      tags: g.tags ?? [],
      meetupUrl: slug ? `https://www.meetup.com/${slug}/` : null,
      logo: g.logo ?? cache.logo ?? null,
      fetchedAt: cache.fetchedAt ?? null,
      _events: cache.events.map((e) => ({ ...e, groupIds: [g.id], source: 'feed' })),
    };
  });
  const byId = Object.fromEntries(groups.map((g) => [g.id, g]));

  const manual = readYaml('events.yaml').map((e, i) => {
    const startDate = String(e.start);
    const endDate = String(e.end ?? e.start);
    const allDay = !e.time;
    return {
      id: `manual-${slugify(e.title)}-${startDate}`,
      title: e.title,
      start: localToUtc(startDate, e.time ?? '00:00'),
      end: localToUtc(endDate, e.endTime ?? (allDay ? '23:59' : e.time)),
      allDay,
      multiDay: endDate !== startDate,
      url: e.url ?? null,
      venue: e.venue ?? null,
      address: e.address ?? null,
      description: e.description ?? '',
      tags: e.tags ?? [],
      groupIds: e.hosts ?? [],
      featured: !!e.featured,
      source: 'manual',
    };
  });

  // Joint meetups show up on several groups' feeds. Merge ones that share a
  // start time and title, and list every host.
  const merged = new Map();
  for (const e of [...groups.flatMap((g) => g._events), ...manual]) {
    const key = `${e.start}|${e.title.toLowerCase().replace(/\W+/g, '')}`;
    const existing = merged.get(key);
    if (existing) existing.groupIds = [...new Set([...existing.groupIds, ...e.groupIds])];
    else merged.set(key, { ...e });
  }

  const now = Date.now();
  const events = [...merged.values()]
    .map((e) => ({
      ...e,
      multiDay: e.multiDay ?? dayKey(e.start) !== dayKey(e.end),
      tags: [...new Set([...(e.tags ?? []), ...e.groupIds.flatMap((id) => byId[id]?.tags ?? [])])],
    }))
    .sort((a, b) => a.start.localeCompare(b.start));

  // "Upcoming" is as of the build. The browser re-checks, since builds are nightly.
  const upcoming = events.filter((e) => Date.parse(e.end) >= now);
  const past = events.filter((e) => Date.parse(e.end) < now).reverse();

  for (const g of groups) {
    g.nextEvent = upcoming.find((e) => e.groupIds.includes(g.id)) ?? null;
    delete g._events;
  }

  const fetched = groups.map((g) => g.fetchedAt).filter(Boolean).sort();
  return { groups, byId, events, upcoming, past, updatedAt: fetched.at(-1) ?? new Date().toISOString() };
}


function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
