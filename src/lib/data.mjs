// Build-time loader: merges the cached events (refreshed four times a day) with hand-added events.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { meetupSlug, meetupUrl, meetupPhoto } from './meetup.mjs';
import { dayKey, lastDay, weekday, fmt } from './format.mjs';
import { localToUtc } from './time.mjs';

// The site rebuilds at least once a day (refresh.yml), so a page can be up to
// a day old. Pages print what they'll need when events ending this soon end.
const CATCH_UP = 2 * 86_400_000;

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
  const archive = readArchive(dataDir);
  const archived = {};
  for (const r of archive) if (!(archived[r.group] >= r.start)) archived[r.group] = r.start;
  for (const g of groups) {
    summarize(g, upcoming, past, now);
    markQuiet(g, archived[g.id], now);
  }

  const fetched = groups.map((g) => g.fetchedAt).filter(Boolean).sort();
  return {
    // Quiet groups are hidden everywhere but /status/; they come back on their own.
    groups: groups.filter((g) => !g.quiet),
    allGroups: groups,
    byId, events, upcoming, past, archive,
    // For Recent events on the home page, which adds each one once it's over.
    endingSoon: upcoming.filter((e) => Date.parse(e.end) <= now + CATCH_UP),
    updatedAt: fetched.at(-1) ?? new Date(now).toISOString(),
    ...readStatus(dataDir, groups),
  };
}

// Every archived event record. The archive (data/archive/) has every ended
// event since the site launched; the cache only keeps 90 days.
function readArchive(dataDir) {
  const dir = path.join(dataDir, 'archive');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

const YEAR = 365 * 86_400_000;

// A group is quiet when nothing is coming up and it hasn't met in a year
// (or we know of no meeting at all). It's returning when its next event is
// its first in over a year: "Back!" shows on that event and the group's card
// until the event ends, when lastMet catches up with it.
function markQuiet(g, archived, now) {
  // lastMet comes from the Meetup events page, which reaches back past our own
  // records; the cache's recent past events and the archive cover the rest.
  g.lastMet = [g.lastMet, archived, g.lastEvent?.start].filter(Boolean).sort().at(-1) ?? null;
  g.quiet = !g.nextEvent && !(g.lastMet && now - Date.parse(g.lastMet) < YEAR);
  g.returning = !!(g.nextEvent && g.lastMet && Date.parse(g.nextEvent.start) - Date.parse(g.lastMet) > YEAR);
  if (g.returning) g.nextEvent.back = [...(g.nextEvent.back ?? []), g.id];
}

// Source health from data/cache/status.json, which the refresh writes: each
// group that failed on the latest run, how, and since which day. No file means
// no refresh has checked yet, so health is unknown rather than "fine".
// built-on.txt is the Des Moines date of the latest refresh.
function readStatus(dataDir, groups) {
  const read = (f) => { try { return fs.readFileSync(path.join(dataDir, 'cache', f), 'utf8'); } catch { return null; } };
  const status = read('status.json');
  const problems = status ? JSON.parse(status) : null;
  for (const g of groups) g.health = problems ? (problems[g.id] ?? { kind: 'ok' }) : null;
  return { checkedOn: read('built-on.txt')?.trim() || null };
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
    lastMet: cache.lastMet ?? null,
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
    const key = seriesKey(e);
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

const seriesKey = (e) => `${e.groupIds.join('+')}|${e.title.trim().toLowerCase()}`;
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// What the Groups page needs: next and last event, how many are coming up,
// and which name and logo to show.
function summarize(g, upcoming, past, now) {
  const mine = upcoming.filter((e) => e.groupIds.includes(g.id));
  g.nextEvent = mine[0] ?? null;
  // Matches the filter chip: a repeating series counts once, like its row.
  g.upcomingCount = mine.filter((e) => !e.repeat).length;
  g.lastEvent = past.find((e) => e.groupIds.includes(g.id)) ?? null;
  // The Groups and Status pages print the group as it reads now, then as it
  // will once each event ending in the next two days is over. `attrs` go on
  // each state's elements: src/scripts/catch-up.js shows a state from its
  // data-after until its data-end, so "Next: today" goes when today's ends.
  g.states = [];
  for (let i = 0, last = g.lastEvent, after; ; i++) {
    const next = mine[i] ?? null;
    const end = next && Date.parse(next.end) <= now + CATCH_UP ? next.end : undefined;
    g.states.push({ next, last, count: new Set(mine.slice(i).map(seriesKey)).size, attrs: { 'data-after': after, 'data-end': end, hidden: !!after } });
    if (!end) break;
    [last, after] = [next, end];
  }
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
