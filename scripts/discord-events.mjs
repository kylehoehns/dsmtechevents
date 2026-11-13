// Keeps the community Discord's #events forum in step with the site
// (docs/decisions/0007-discord-event-posts.md): one post per upcoming event,
// where people say they're going and talk about it.
//   - a new event gets a post
//   - a post whose event changed (title, time, place, link) is edited
//   - a placeholder replaced by the real event (same hosts, same day, new id)
//     keeps its post, edited to the real event
//   - a post whose event is over is closed (archived and locked) 3 days later
//   - a post whose upcoming event disappeared is marked cancelled and closed
// Each post ends with a small "ref" line naming its event, so the posts are
// their own record: nothing else is stored. Only the bot's own posts are read.
// Two steps, so the Discord token never shares a machine with npm packages
// (see .github/workflows/refresh.yml):
//   node scripts/discord-events.mjs --write events.json
//     in the refresh job: the site's events, reduced to what a post needs
//   node scripts/discord-events.mjs --from events.json [--dry-run]
//     in a job of its own, with DISCORD_TOKEN and DISCORD_SERVER_ID set and
//     nothing installed: syncs the forum (or, dry run, prints the plan)
import fs from 'node:fs';
import { DAY, dayKey, dayRange, day, hours, month, weekday } from '../src/lib/format.mjs';

const CLOSE_AFTER = 3 * DAY;
const CANCELLED = 'Cancelled · ';
const NAME_MAX = 100; // Discord's limit for a post title

const hostKey = (e) => (e.groupIds.length ? e.groupIds.join('+') : (e.hostsLabel ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-')) || 'none';

// The post for one event: its title and its first message.
export function render(e) {
  const date = `${month(e.start)} ${day(e.start)}`;
  const name = `${date} · ${e.title}`;
  const when = e.multiDay ? `${dayRange(e.start, e.end)} · ${hours(e)}` : `${weekday(e.start)} ${date} · ${hours(e)}`;
  const content = [
    ...(e.hostsLabel ? [`**${e.hostsLabel}**`] : []),
    `${when} (<t:${Math.floor(Date.parse(e.start) / 1000)}:R>)`,
    ...(e.venue ? [`📍 ${e.venue}`] : []),
    `RSVP on the group's page: ${e.url}`,
    `-# ref ${e.id} ${dayKey(e.start)} ${hostKey(e)}`,
  ].join('\n');
  return { name: name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1)}…` : name, content };
}

// The ref line of a post's first message: { id, day, host }, or null if the
// post isn't one of these.
export function refOf(content = '') {
  const m = content.match(/^-# ref (\S+) (\d{4}-\d{2}-\d{2}) (\S+)$/m);
  return m ? { id: m[1], day: m[2], host: m[3] } : null;
}

// Decide what to do. `upcoming` and `past` are the site's events (upcoming
// already without a series' repeats); `posts` are the forum's open posts by
// the bot, locked ones left out: [{ id, name, content, archived }]. Pure, so
// it can be tested.
export function planPosts({ upcoming, past, posts, now = Date.now() }) {
  const actions = [];
  const byRef = new Map();
  for (const p of posts) {
    const ref = refOf(p.content);
    if (ref && !byRef.has(ref.id)) byRef.set(ref.id, { ...p, ref });
  }
  const used = new Set();
  const pastById = new Map(past.map((e) => [e.id, e]));
  const upcomingIds = new Set(upcoming.map((e) => e.id));

  // A post whose event is gone but which shares hosts and day with a new
  // event: a placeholder that became the real thing.
  const orphans = [...byRef.values()].filter((p) => !upcomingIds.has(p.ref.id) && !pastById.has(p.ref.id) && !p.name.startsWith(CANCELLED));

  // Soonest last: the forum lists the newest post first.
  for (const e of [...upcoming].sort((a, b) => b.start.localeCompare(a.start))) {
    const want = render(e);
    let post = byRef.get(e.id);
    if (!post) {
      post = orphans.find((p) => !used.has(p.id) && p.ref.day === dayKey(e.start) && p.ref.host === hostKey(e));
    }
    if (!post) { actions.push({ type: 'create', event: e.id, ...want }); continue; }
    used.add(post.id);
    if (post.name !== want.name || post.content !== want.content || post.archived) {
      actions.push({ type: 'edit', post: post.id, event: e.id, ...want });
    }
  }

  for (const p of byRef.values()) {
    if (used.has(p.id) || upcomingIds.has(p.ref.id)) continue;
    const ended = pastById.get(p.ref.id);
    if (ended) {
      if (now - Date.parse(ended.end) >= CLOSE_AFTER) actions.push({ type: 'close', post: p.id, event: p.ref.id });
    } else if (!p.name.startsWith(CANCELLED)) {
      const name = `${CANCELLED}${p.name}`;
      actions.push({
        type: 'cancel', post: p.id, event: p.ref.id,
        name: name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1)}…` : name,
        content: `**No longer listed.** This event was cancelled or taken down. Check the group's page for what's on instead.\n\n${p.content}`,
      });
    }
  }
  return actions;
}

// Discord's API, with a retry for rate limits and Discord's own hiccups (5xx).
export function discordApi(token, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
  return async function api(method, path, body) {
    for (let attempt = 1; ; attempt++) {
      const res = await fetchImpl(`https://discord.com/api/v10${path}`, {
        method,
        headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (https://dsmtechevents.com, 1)' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 429 || (res.status >= 500 && attempt < 4)) {
        const wait = res.status === 429 ? Number((await res.json()).retry_after ?? 1) * 1000 : attempt * 2000;
        await sleep(wait + 250);
        continue;
      }
      if (!res.ok) throw new Error(`Discord ${method} ${path}: ${res.status} ${await res.text()}`);
      return res.status === 204 ? null : res.json();
    }
  };
}

// The forum's existing posts by the bot, open and archived.
async function readPosts(api, guildId, forumId) {
  const me = await api('GET', '/users/@me');
  const threads = (await api('GET', `/guilds/${guildId}/threads/active`)).threads.filter((t) => t.parent_id === forumId);
  for (let before = '', page = 0; page < 10; page++) {
    const r = await api('GET', `/channels/${forumId}/threads/archived/public?limit=100${before && `&before=${encodeURIComponent(before)}`}`);
    threads.push(...r.threads);
    if (!r.has_more || !r.threads.length) break;
    before = r.threads.at(-1).thread_metadata.archive_timestamp;
  }
  const posts = [];
  for (const t of threads) {
    // Locked posts are finished (closed or cancelled), and the site forgets
    // events after 90 days, so reading them would only cost requests and
    // mistake an aged-out event for a cancelled one.
    if (t.owner_id !== me.id || t.thread_metadata?.locked) continue;
    // A forum post's first message has the post's own id.
    const first = await api('GET', `/channels/${t.id}/messages/${t.id}`);
    posts.push({ id: t.id, name: t.name, content: first.content, archived: !!t.thread_metadata?.archived });
  }
  return posts;
}

// Carry out the plan.
async function apply(api, forumId, actions) {
  for (const a of actions) {
    if (a.type === 'create') {
      await api('POST', `/channels/${forumId}/threads`, { name: a.name, auto_archive_duration: 10080, message: { content: a.content } });
    } else if (a.type === 'edit') {
      // Unarchive first: an archived post can't be edited.
      await api('PATCH', `/channels/${a.post}`, { name: a.name, archived: false });
      await api('PATCH', `/channels/${a.post}/messages/${a.post}`, { content: a.content });
    } else if (a.type === 'close') {
      await api('PATCH', `/channels/${a.post}`, { archived: true, locked: true });
    } else if (a.type === 'cancel') {
      await api('PATCH', `/channels/${a.post}`, { archived: false });
      await api('PATCH', `/channels/${a.post}/messages/${a.post}`, { content: a.content });
      await api('PATCH', `/channels/${a.post}`, { name: a.name, archived: true, locked: true });
    }
  }
}

// One run: read the forum, plan against the site's events, and apply unless
// it's a dry run. Returns the plan.
export async function syncEvents({ api, guildId, data, now = Date.now(), dryRun = false }) {
  const forum = (await api('GET', `/guilds/${guildId}/channels`)).find((c) => c.type === 15 && c.name === 'events');
  if (!forum) throw new Error('No #events forum channel in the server (infra/discord creates it).');
  const posts = await readPosts(api, guildId, forum.id);
  const actions = planPosts({ upcoming: data.upcoming.filter((e) => !e.repeat), past: data.past, posts, now });
  if (!dryRun) await apply(api, forum.id, actions);
  return actions;
}

// The fields render() and planPosts() read, and nothing else.
const FIELDS = ['id', 'title', 'start', 'end', 'allDay', 'multiDay', 'url', 'venue', 'groupIds', 'hostsLabel', 'repeat'];
export const slim = (data) => {
  const pick = (e) => Object.fromEntries(FIELDS.filter((k) => e[k] !== undefined).map((k) => [k, e[k]]));
  return { upcoming: data.upcoming.map(pick), past: data.past.map(pick) };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
  if (process.argv.includes('--write')) {
    // Imported here, not at the top: it needs npm's yaml, which the sync step doesn't install.
    const { loadData } = await import('../src/lib/data.mjs');
    fs.writeFileSync(arg('--write'), JSON.stringify(slim(loadData())));
    process.exit(0);
  }
  const dryRun = process.argv.includes('--dry-run');
  const { DISCORD_TOKEN: token, DISCORD_SERVER_ID: guildId } = process.env;
  if (!token || !guildId || !process.argv.includes('--from')) throw new Error('Usage: --write <file>, or --from <file> with DISCORD_TOKEN and DISCORD_SERVER_ID set.');
  const data = JSON.parse(fs.readFileSync(arg('--from'), 'utf8'));
  const actions = await syncEvents({ api: discordApi(token), guildId, data, dryRun });
  if (!actions.length) console.log('#events is up to date.');
  for (const a of actions) console.log(`${dryRun ? '[dry run] ' : ''}${a.type} ${a.event}${a.name ? `: ${a.name}` : ''}`);
}
