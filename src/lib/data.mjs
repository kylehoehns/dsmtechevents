// Build-time loader: merges the cached events (refreshed four times a day) with hand-added events.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { meetupSlug, meetupUrl, meetupPhoto } from './meetup.mjs';
import { dayKey, lastDay, weekday, fmt } from './format.mjs';
import { localToUtc } from './time.mjs';

// Tests pass their own data folder and clock. The browser tests build the
// whole site from a fixture folder by setting DSM_DATA_DIR (see
// playwright.config.mjs); unset, it's the real data/.
export function loadData({ dataDir = path.resolve(process.env.DSM_DATA_DIR || 'data'), now = Date.now() } = {}) {
  const readYaml = (f) => YAML.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')) ?? [];
  const groups = readYaml('groups.yaml').map((g) => readGroup(g, dataDir));
  const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
  const manual = readYaml('events.yaml').map(manualEvent);

  const events = mergeJoint([...groups.flatMap((g) => g._events), ...manual])
    .map(tidy)
    .sort((a, b) => a.start.localeCompare(b.start));
  // "Upcoming" is as of the build. The browser re-checks, since the page can be up to a day old.
  const upcoming = events.filter((e) => Date.parse(e.end) >= now);
  const past = events.filter((e) => Date.parse(e.end) < now).reverse();

  for (const e of events) describe(e, byId);
  foldSeries(upcoming);
  for (const g of groups) summarize(g, upcoming, past);

  const fetched = groups.map((g) => g.fetchedAt).filter(Boolean).sort();
  return { groups, byId, events, upcoming, past, updatedAt: fetched.at(-1) ?? new Date(now).toISOString() };
}

// A group from groups.yaml plus what the refresh cached for it.
function readGroup(g, dataDir) {
  const cacheFile = path.join(dataDir, 'cache', `${g.id}.json`);
  const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : { events: [] };
  const slug = meetupSlug(g.meetup);
  return {
    ...g,
    meetupUrl: slug ? meetupUrl(slug) : null,
    logo: g.logo ?? cache.logo ?? null,
    fetchedAt: cache.fetchedAt ?? null,
    members: cache.members ?? null,
    pastCount: cache.pastCount ?? null,
    _events: cache.events.map((e) => ({ ...e, groupIds: [g.id], source: 'feed' })),
  };
}

// A hand-added event from events.yaml, in the cache's shape.
function manualEvent(e) {
  if ('featured' in e) throw new Error(`events.yaml: "${e.title}" uses featured:, which is now headliner:`);
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
    tags: e.tags,
    groupIds: e.hosts ?? [],
    headliner: !!e.headliner,
    source: 'manual',
  };
}

// Joint meetups show up on several groups' feeds. Merge ones that share a
// start time and title, and list every host.
function mergeJoint(all) {
  const merged = new Map();
  for (const e of all) {
    const key = `${e.start}|${e.title.toLowerCase().replace(/\W+/g, '')}`;
    const existing = merged.get(key);
    if (existing) existing.groupIds = [...new Set([...existing.groupIds, ...e.groupIds])];
    else merged.set(key, { ...e });
  }
  // Co-hosts sometimes title the same night differently ("Joint night - JVM vs.
  // CLR" vs "JVM vs CLR, with CIJUG"). Fold those too: same start, same place,
  // no host in common, and titles that are mostly the same words.
  const list = [...merged.values()];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const [a, b] = [list[i], list[j]];
      if (!a || !b || !sameNight(a, b)) continue;
      a.groupIds = [...new Set([...a.groupIds, ...b.groupIds])];
      list[j] = null;
    }
  }
  return [...new Map(list.filter(Boolean).map((e) => [e.id, e])).values()];
}

function tidy(e) {
  return {
    ...e,
    multiDay: e.multiDay ?? dayKey(e.start) !== lastDay(e.start, e.end),
    tags: e.tags ?? [],
    fullAddress: e.address ?? null, // the short one is for people, this one is for search engines
    address: shortAddress(e.address),
  };
}

// Only show a photo when it says something: Meetup often fills an event's
// photo with the group's logo, which would repeat the group's name.
const photoId = (url) => /_(\d+)\.\w+$/.exec(url ?? '')?.[1] ?? url;

// The photo, host label and venue every card needs.
function describe(e, byId) {
  const logos = e.groupIds.map((id) => photoId(byId[id]?.logo)).filter(Boolean);
  // { small, large } or null. Meetup photos get their small webp copies; any
  // other image is used as-is for both.
  const url = e.image && !logos.includes(photoId(e.image)) ? e.image : null;
  e.photo = url && (meetupPhoto(url) ?? { small: url, large: url });
  // Who's putting it on, as plain text: "CIJUG + Pyowa", or for an event
  // with no group, "Conference" / "Community event". Every list uses this.
  e.hostsLabel = e.groupIds.map((id) => byId[id]?.short).filter(Boolean).join(' + ')
    || (e.headliner || e.tags.includes('conference') ? 'Conference' : 'Community event');
  // Same street address = same venue, even when it's spelled two ways
  // ("Community Choice Convention Center" vs "...Credit Union Convention Center").
  e.venueKey = placeKey(e) || null;
}

// Repeating placeholders (same hosts + same title, e.g. a monthly meeting
// posted a year ahead) collapse into their next date plus a series summary.
function foldSeries(upcoming) {
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
    list[0].series = {
      count: list.length,
      rule: same ? `Every ${ord} ${longWeekday(list[0].start)}` : 'Repeats',
      until: fmt({ month: 'short', year: 'numeric' }).format(new Date(list.at(-1).start)),
    };
    for (const x of list.slice(1)) x.repeat = true;
  }
}

const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// What the Groups page needs: next and last event, how many are coming up,
// and which name and logo to show.
function summarize(g, upcoming, past) {
  g.nextEvent = upcoming.find((e) => e.groupIds.includes(g.id)) ?? null;
  // Matches the filter chip: a repeating series counts once, like its row.
  g.upcomingCount = upcoming.filter((e) => !e.repeat && e.groupIds.includes(g.id)).length;
  g.lastEvent = past.find((e) => e.groupIds.includes(g.id)) ?? null;
  // Show the full name only when it adds something. "Web Geeks" / "DSM Web
  // Geeks" and "Data & Analytics" / "Des Moines Data & Analytics" say the
  // same thing twice; "IADNUG" / "Iowa .NET User Group" doesn't.
  const [short, full] = [squash(g.short), squash(g.name)];
  g.showFullName = !(full.includes(short) && short.length >= full.length * 0.55);
  // The groups page shows logos at 60px; the 180px webp is plenty.
  g.logoThumb = meetupPhoto(g.logo)?.small ?? g.logo;
  delete g._events;
}

function longWeekday(iso) {
  return fmt({ weekday: 'long' }).format(new Date(iso));
}

// Every event is around Des Moines, so ", Des Moines, IA 50309" says nothing
// and makes the row wrap. Keep suburbs ("West Des Moines", "Johnston").
export function shortAddress(a) {
  if (!a) return a ?? null;
  return a
    .replace(/,+/g, ',')
    .replace(/(?:,|\s)\s*(IA|Iowa)(\s*\d{5}(-\d{4})?)?\s*$/i, '') // the ZIP is optional (TAI omits it)
    .replace(/,\s*Des Moines\s*$/i, '')
    .trim();
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Where an event is, for spotting the same night listed twice: the street
// number and name ("801 Grand"), else the venue name, or "online".
const placeKey = (e) => (e.online ? 'online' : (/^\s*(\d+\s+\S+(?:\s+\S+)?)/.exec(e.address ?? '')?.[1] ?? e.venue ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
const STOP = new Set(['the', 'and', 'with', 'for', 'night', 'meetup', 'joint', 'des', 'moines']);
const titleWords = (t) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)));

// Two listings of one joint meetup? Exported for tests.
export function sameNight(a, b) {
  if (a.start !== b.start || a.groupIds.some((g) => b.groupIds.includes(g))) return false;
  const place = placeKey(a);
  if (!place || place !== placeKey(b)) return false;
  const [x, y] = [titleWords(a.title), titleWords(b.title)];
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared > 0 && shared / Math.min(x.size, y.size) >= 0.6;
}
