// Build-time loader: merges the nightly Meetup cache with hand-added events.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { meetupSlug } from './meetup.mjs';
import { dayKey, weekday } from './format.mjs';
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

  // Only show a photo when it says something: Meetup often fills an event's
  // photo with the group's logo, which would repeat the group's name.
  const photoId = (url) => /_(\d+)\.\w+$/.exec(url ?? '')?.[1] ?? url;
  for (const e of events) {
    const logos = e.groupIds.map((id) => photoId(byId[id]?.logo)).filter(Boolean);
    e.photo = e.image && !logos.includes(photoId(e.image)) ? e.image : null;
    e.venueKey = e.online ? 'online' : (e.venue ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() || null;
  }

  // Repeating placeholders (same hosts + same title, e.g. a monthly meeting
  // posted a year ahead) collapse into their next date plus a series summary.
  const series = new Map();
  for (const e of upcoming) {
    const key = `${e.groupIds.join('+')}|${e.title.trim().toLowerCase()}`;
    if (!series.has(key)) series.set(key, []);
    series.get(key).push(e);
  }
  for (const list of series.values()) {
    if (list.length < 2) continue;
    const nth = (x) => Math.ceil(Number(dayKey(x.start).slice(8)) / 7);
    const same = list.every((x) => nth(x) === nth(list[0]) && weekday(x.start) === weekday(list[0].start));
    const ord = ['', '1st', '2nd', '3rd', '4th', '5th'][nth(list[0])];
    const last = list.at(-1);
    list[0].series = {
      count: list.length,
      rule: same ? `Every ${ord} ${longWeekday(list[0].start)}` : 'Repeats',
      until: new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', year: 'numeric' }).format(new Date(last.start)),
    };
    for (const x of list.slice(1)) x.repeat = true;
  }

  const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const g of groups) {
    g.nextEvent = upcoming.find((e) => e.groupIds.includes(g.id)) ?? null;
    g.upcomingCount = upcoming.filter((e) => e.groupIds.includes(g.id)).length;
    g.lastEvent = past.find((e) => e.groupIds.includes(g.id)) ?? null;
    // Show the full name only when it adds something. "Web Geeks" / "DSM Web
    // Geeks" says the same thing twice; "Data" / "Des Moines Data & Analytics"
    // and "IADNUG" / "Iowa .NET User Group" don't.
    const [short, full] = [squash(g.short), squash(g.name)];
    g.showFullName = !(full.includes(short) && short.length >= full.length * 0.6);
    delete g._events;
  }

  const fetched = groups.map((g) => g.fetchedAt).filter(Boolean).sort();
  return { groups, byId, events, upcoming, past, updatedAt: fetched.at(-1) ?? new Date().toISOString() };
}


function longWeekday(iso) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long' }).format(new Date(iso));
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
