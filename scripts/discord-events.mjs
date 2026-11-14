// Keeps the community Discord's #events forum in step with the site
// (docs/decisions/0007-discord-event-posts.md): one post per upcoming event,
// where people say they're going and talk about it.
//   - a new event gets a post
//   - a post whose event changed (title, time, place, link) is edited
//   - a placeholder replaced by the real event (same hosts, same day, new id)
//     keeps its post, edited to the real event
//   - a post whose event is over is closed (archived and locked) 3 days later
//   - a post whose upcoming event disappeared is marked cancelled and closed
// Each post's card ends with a small "ref" line naming its event, so the posts
// are their own record: nothing else is stored. Only the bot's own posts are
// read.
// Two steps, so the Discord token never shares a machine with npm packages
// (see .github/workflows/refresh.yml):
//   node scripts/discord-events.mjs --write events.json
//     in the refresh job: the site's events, reduced to what a post needs
//   node scripts/discord-events.mjs --from events.json [--dry-run]
//     in a job of its own, with DISCORD_TOKEN and DISCORD_SERVER_ID set and
//     nothing installed: syncs the forum (or, dry run, prints the plan)
import fs from 'node:fs';
import { DAY, dayKey, dayRange, day, hours, month, plainText, weekday } from '../src/lib/format.mjs';

const CLOSE_AFTER = 3 * DAY;
const CANCELLED = 'Cancelled · ';
const NAME_MAX = 100; // Discord's limit for a post title

// An event's id as its ref line carries it: no whitespace, or refOf()
// couldn't read it back and the post would be made again on every refresh.
const refId = (e) => e.id.replace(/\s+/g, '_');
const hostKey = (e) => (e.groupIds.length ? e.groupIds.join('+') : (e.hostsLabel ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-')) || 'none';

const ACCENT = 0xff4fa3; // the site's pink: one strip for every group

const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
// Group text shown as Discord markdown: escape the marks so it shows as typed
// and can't make bold, a spoiler, a link or a mention. A heading, list or
// quote mark only counts at the start of a line, so only there.
const md = (s) => s.replace(/[\\*_~`|[\]<>@]/g, '\\$&').replace(/^([#>-])/gm, '\\$1');

// The hook: the group's first real paragraph, whole if it's short, else cut
// at the last full sentence that fits (about 300 characters), else at a word.
// Skips what isn't a hook: a paragraph repeating the title, one that's mostly
// a link, and short logistics ("Doors open at 6 PM.", parking, food).
const HOOK = 300;
const LOGISTICS = /^(doors? open|parking|pizza|food|drinks|snacks|agenda|schedule|location|where|when|rsvp|note)\b/i;
function hook(e) {
  const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const paras = (e.description ?? '').split(/\n\s*\n/).map((p) => plainText(p).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const real = paras.find((p) => {
    const words = p.replace(/https?:\/\/\S+/g, '').trim();
    if (words.length < 40) return false; // too short to be a hook, or mostly a link
    if (/https?:\/\//.test(p) && p.length < 120) return false; // "Check out <link> for details"
    if (squash(p) === squash(e.title) || squash(e.title).includes(squash(p))) return false;
    return !(LOGISTICS.test(p) && p.length < 120);
  });
  if (!real) return '';
  // "…, from IA Women in Tech." loses its last words: the card is titled with the group.
  const by = e.hostsLabel && new RegExp(`,?\\s+(?:from|by|hosted by)\\s+(?:the\\s+)?${e.hostsLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[.!?]?$)`, 'i');
  const text = by ? real.replace(by, '') : real;
  if (text.length <= HOOK) return text;
  const sentences = text.slice(0, HOOK).match(/^.*[.!?](?=\s|$)/s)?.[0];
  if (sentences && sentences.length >= 80) return sentences;
  return `${text.slice(0, HOOK - 1).replace(/\s+\S*$/, '')}…`;
}

// The place: a few plain words for the message (the forum's list shows the
// message as plain text, so it can't hold a link), and a map search for the
// card's Directions link (the site's own query: venue plus address).
function where(e) {
  const venue = e.venue && e.venue !== 'Online' ? e.venue : '';
  if (!venue) return { place: e.online || e.hybrid || e.venue === 'Online' ? '💻 Online' : '📍 Place to be announced', map: null };
  const query = [venue, e.fullAddress ?? e.address ?? 'Des Moines, IA'].join(', ');
  return {
    place: `📍 ${md(venue)}${e.hybrid ? ' · also online' : ''}`,
    map: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
  };
}

// Meetup serves each photo as .jpeg as well as the .webp the site uses
// (src/lib/meetup.mjs); Discord labels a .webp "GIF" in the forum's list.
const forDiscord = (url) => url.replace(/^(https:\/\/secure\.meetupstatic\.com\/photos\/.+)\.webp$/, '$1.jpeg');

// The post for one event: its title, its first message, and one card.
// Typeset like a poster: the title says the day, the message says the hours,
// the group and the place, and the card is the group's: their words, links to
// directions and to their page (where people RSVP), and their photo. The ref line is the
// card's footer, the last thing on screen.
export function render(e) {
  const date = e.multiDay ? dayRange(e.start, e.end) : `${weekday(e.start)} ${month(e.start)} ${day(e.start)}`;
  const rel = `<t:${Math.floor(Date.parse(e.start) / 1000)}:R>`;
  const repeats = e.series?.rule ? `${e.series.rule.replace(/^./, (c) => c.toLowerCase())}${e.series.until ? ` through ${e.series.until}` : ''}` : '';
  const { place, map } = where(e);
  // Who's hosting sits with when and where, so the forum's list shows all three.
  const host = e.hostsLabel ? [`**${md(e.hostsLabel)}**`] : [];
  const content = `## ${hours(e)}\n-# ${[rel, ...(repeats ? [repeats] : []), ...host, place].join(' · ')}`;

  // The link inside <…>, so a scraped URL holding ")[" can't add a link of its
  // own. An event with no usable link gets a card without one.
  const site = URL.canParse(e.url ?? '') ? new URL(e.url).hostname.replace(/^www\./, '') : '';
  const about = hook(e);
  // No title: the group is named in the message, and "Read more" links its page.
  const card = {
    color: ACCENT,
    description: [
      ...(about ? [md(about)] : []),
      [...(map ? [`[Directions](<${map}>)`] : []), ...(site ? [`[Read more on ${site}](<${e.url}>)`] : [])].join(' · '),
    ].filter(Boolean).join('\n\n'),
    ...(e.photo?.large ? { image: { url: forDiscord(e.photo.large) } } : {}),
    footer: { text: `ref ${refId(e)} ${dayKey(e.start)} ${hostKey(e)}` },
  };
  return { name: cut(`${date} · ${e.title}`, NAME_MAX), content, embeds: [card] };
}

// A ref line, "ref <id> <day> <host>": { id, day, host }, or null.
export function refOf(text = '') {
  const m = text.match(/^(?:-# )?ref (\S+) (\d{4}-\d{2}-\d{2}) (\S+)$/m);
  return m ? { id: m[1], day: m[2], host: m[3] } : null;
}
// A post's ref: in its card's footer, or, for posts made before the card,
// the last line of its message.
const refOfPost = (p) => refOf(p.embeds?.find((c) => c.footer?.text)?.footer.text) ?? refOf(p.content);

// Whether a post's cards are the ones render() makes. Only the fields we send
// are compared: Discord adds sizes and proxy URLs, and its own link previews
// (type "link", from an older post's bare link) don't count as ours.
const cardOf = (c) => JSON.stringify([c.color ?? null, c.title ?? null, c.url ?? null, c.description ?? null, c.image?.url ?? null, c.footer?.text ?? null]);
const sameCards = (have = [], want = []) => {
  const ours = have.filter((c) => !c.type || c.type === 'rich');
  return ours.length === want.length && ours.every((c, i) => cardOf(c) === cardOf(want[i]));
};

// Decide what to do. `upcoming` and `past` are the site's events (upcoming
// already without a series' repeats); `posts` are the forum's open posts by
// the bot, locked ones left out: [{ id, name, content, embeds, archived }].
// Pure, so it can be tested.
export function planPosts({ upcoming, past, posts, now = Date.now() }) {
  const actions = [];
  const byRef = new Map();
  for (const p of posts) {
    const ref = refOfPost(p);
    if (ref && !byRef.has(ref.id)) byRef.set(ref.id, { ...p, ref });
  }
  const used = new Set();
  const pastById = new Map(past.map((e) => [refId(e), e]));
  const upcomingIds = new Set(upcoming.map(refId));

  // A post whose event is gone but which shares hosts and day with a new
  // event: a placeholder that became the real thing.
  const orphans = [...byRef.values()].filter((p) => !upcomingIds.has(p.ref.id) && !pastById.has(p.ref.id) && !p.name.startsWith(CANCELLED));

  // Soonest last: the forum lists the newest post first.
  for (const e of [...upcoming].sort((a, b) => b.start.localeCompare(a.start))) {
    const want = render(e);
    let post = byRef.get(refId(e));
    if (!post) {
      post = orphans.find((p) => !used.has(p.id) && p.ref.day === dayKey(e.start) && p.ref.host === hostKey(e));
    }
    if (!post) { actions.push({ type: 'create', event: e.id, ...want }); continue; }
    used.add(post.id);
    if (post.name !== want.name || post.content !== want.content || !sameCards(post.embeds, want.embeds) || post.archived) {
      actions.push({ type: 'edit', post: post.id, event: e.id, ...want });
    }
  }

  for (const p of byRef.values()) {
    if (used.has(p.id) || upcomingIds.has(p.ref.id)) continue;
    const ended = pastById.get(p.ref.id);
    if (ended) {
      if (now - Date.parse(ended.end) >= CLOSE_AFTER) actions.push({ type: 'close', post: p.id, event: p.ref.id });
    } else if (!p.name.startsWith(CANCELLED)) {
      actions.push({
        type: 'cancel', post: p.id, event: p.ref.id,
        name: cut(`${CANCELLED}${p.name}`, NAME_MAX),
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
    posts.push({ id: t.id, name: t.name, content: first.content, embeds: first.embeds, archived: !!t.thread_metadata?.archived });
  }
  return posts;
}

// Carry out the plan. Mentions are never parsed: the text is the groups'.
const message = (a) => ({ content: a.content, embeds: a.embeds, allowed_mentions: { parse: [] } });
async function apply(api, forumId, actions) {
  for (const a of actions) {
    if (a.type === 'create') {
      await api('POST', `/channels/${forumId}/threads`, { name: a.name, auto_archive_duration: 10080, message: message(a) });
    } else if (a.type === 'edit') {
      // Unarchive first: an archived post can't be edited.
      await api('PATCH', `/channels/${a.post}`, { name: a.name, archived: false });
      await api('PATCH', `/channels/${a.post}/messages/${a.post}`, message(a));
    } else if (a.type === 'close') {
      await api('PATCH', `/channels/${a.post}`, { archived: true, locked: true });
    } else if (a.type === 'cancel') {
      await api('PATCH', `/channels/${a.post}`, { archived: false });
      await api('PATCH', `/channels/${a.post}/messages/${a.post}`, { content: a.content, allowed_mentions: { parse: [] } });
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
const FIELDS = ['id', 'title', 'start', 'end', 'allDay', 'multiDay', 'url', 'description', 'venue', 'address', 'fullAddress', 'online', 'hybrid', 'photo', 'series', 'groupIds', 'hostsLabel', 'repeat'];
export const slim = (data) => {
  const keep = (k, v) => (k === 'photo' ? { large: v.large } : v);
  const pick = (e) => Object.fromEntries(FIELDS.filter((k) => e[k] !== undefined && e[k] !== null).map((k) => [k, keep(k, e[k])]));
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
