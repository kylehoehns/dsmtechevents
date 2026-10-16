// Joint meetups and who hosts an event. One night run by two groups shows up
// on both groups' feeds, and the archive keeps one record per host. Everything
// that lists or counts events folds those copies into one with foldJoint, and
// names the hosts with hostsLabel, so the cache, the archive and the TV count
// agree on what one event is.

// Where an event is, for spotting the same night listed twice: the street
// number and name ("801 Grand"), else the venue name, or "online".
export const placeKey = (e) => (e.online ? 'online' : (/^\s*(\d+\s+\S+(?:\s+\S+)?)/.exec(e.address ?? '')?.[1] ?? e.venue ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
const STOP = new Set(['the', 'and', 'with', 'for', 'night', 'meetup', 'joint', 'des', 'moines']);
const titleWords = (t) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)));
const jointKey = (e) => `${e.start}|${e.title.toLowerCase().replace(/\W+/g, '')}`;

// Two listings of one joint meetup? Exported for tests.
export function sameNight(a, b) {
  if (a.start !== b.start || a.groupIds.some((g) => b.groupIds.includes(g))) return false;
  const place = placeKey(a);
  if (!place || place !== placeKey(b)) return false;
  const [x, y] = [titleWords(a.title), titleWords(b.title)];
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared > 0 && shared / Math.min(x.size, y.size) >= 0.6;
}

// Fold the copies of each joint meetup into the first one, listing every host.
// Copies share a start time and title, or are the same night titled
// differently ("Joint night - JVM vs. CLR" vs "JVM vs CLR, with CIJUG"). Each
// result's `ids` lists every copy's id, so a later list can tell it already
// has an event that another host's record also describes.
export function foldJoint(events) {
  const merged = new Map();
  for (const e of events) {
    const existing = merged.get(jointKey(e));
    if (existing) fold(existing, e);
    else merged.set(jointKey(e), { ...e, ids: [e.id] });
  }
  const list = [...merged.values()];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const [a, b] = [list[i], list[j]];
      if (!a || !b || !sameNight(a, b)) continue;
      fold(a, b);
      list[j] = null;
    }
  }
  return [...new Map(list.filter(Boolean).map((e) => [e.id, e])).values()];
}

// One co-host's copy of a joint event into another's. It's new when the
// first co-host posted it.
function fold(into, e) {
  into.groupIds = [...new Set([...into.groupIds, ...e.groupIds])];
  into.ids = [...new Set([...into.ids, ...(e.ids ?? [e.id])])];
  if (e.added && !(into.added <= e.added)) into.added = e.added;
}

// Who's putting it on, as plain text: "CIJUG + Pyowa", or for an event with
// no group, "Conference" / "Community event". Every list uses this.
export function hostsLabel(e, byId) {
  return e.groupIds.map((id) => byId[id]?.short).filter(Boolean).join(' + ')
    || (e.headliner || e.tags?.includes('conference') ? 'Conference' : 'Community event');
}

// Archive records (data/archive/) name one host as `group`; as events, with
// their joint copies folded.
export const archivedEvents = (archive) => foldJoint(archive.map(({ group, ...r }) => ({ ...r, groupIds: group ? [group] : [] })));
