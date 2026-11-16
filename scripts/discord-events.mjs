// Keeps the community Discord's #events forum in step with the site
// (docs/decisions/0007-discord-event-posts.md): one post per upcoming event,
// where people say they're going and talk about it.
//   - a new event gets a post
//   - a post whose event changed (title, time, place, link) is edited
//   - a placeholder replaced by the real event (same hosts, same day, new id)
//     keeps its post, edited to the real event
//   - a post whose event is over is closed (archived and locked) 3 days later
//   - a post whose upcoming event disappeared is marked cancelled and closed
//   - one pinned, locked post, "Coming up", lists the next two weeks soonest
//     first, each linking to its post: Discord can't sort a forum by event
//     date, so this is the list in date order
// Each post ends with a small "ref" line naming its event, so the posts are
// their own record: nothing else is stored. Only the bot's own posts are
// read.
// Two steps, so the Discord token never shares a machine with npm packages
// (see .github/workflows/refresh.yml):
//   node scripts/discord-events.mjs --write events.json
//     in the refresh job: the site's events, reduced to what a post needs
//   node scripts/discord-events.mjs --from events.json [--dry-run]
//     in a job of its own, with DISCORD_TOKEN and DISCORD_SERVER_ID set and
//     nothing installed: syncs the forum (or, dry run, prints the plan);
//     DISCORD_FORUM names another forum to try a change on first
import fs from 'node:fs';
import { DAY, dayKey, dayRange, day, ESCAPE, hours, ITALIC, month, weekday } from '../src/lib/format.mjs';

const CLOSE_AFTER = 3 * DAY;
const CANCELLED = 'Cancelled · ';
const NAME_MAX = 100; // Discord's limit for a post title

// An event's id as its ref line carries it: no whitespace, or refOf()
// couldn't read it back and the post would be made again on every refresh.
const refId = (e) => e.id.replace(/\s+/g, '_');
const hostKey = (e) => (e.groupIds.length ? e.groupIds.join('+') : (e.hostsLabel ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-')) || 'none';

export const ACCENT = 0xff4fa3; // the site's pink: one strip for every group
const GREY = 0x80848e; // a cancelled post's strip
export const V2 = 1 << 15; // IS_COMPONENTS_V2: the message is laid out by components

const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
// Group text shown as Discord markdown: escape the marks so it shows as typed
// and can't make bold, a spoiler, a link or a mention. A heading, list or
// quote mark only counts at the start of a line, so only there.
const md = (s) => s.replace(/[\\*_~`|[\]<>@]/g, '\\$&').replace(/^([#>-])/gm, '\\$1');

// The group's whole write-up as Discord markdown, read the way the site's
// formatDescription() reads it (src/lib/format.mjs): paragraphs, line
// breaks, **bold**, *italics*, [links](url), bare URLs, ![images](url) as
// their alt text, "## headings" (bold lines, under the post's own headings) and
// rule lines dropped. Everything else is escaped by md(), so it shows as
// typed. The marks it keeps stand in as private-use characters while md() runs.
const BOLD = '\uE001';
const ITAL = '\uE002';
const STAR = '\uE003'; // Meetup's escaped \*: a star that is only a star
const LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(^|[\s(])(https?:\/\/[^\s<)]+?)(?=[.,;:!?]*(?:[\s<)]|$))/g;
// A V2 message holds 4,000 characters across all its text; the rest of the
// post (place, start, ref) takes about 200.
const CARD_MAX = 3700;
export function discordMarkdown(text = '') {
  const paras = String(text)
    .replace(ESCAPE, (_, c) => (c === '*' ? STAR : c))
    .replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, '')
    .split(/\n{2,}/)
    .map((para) => {
      const links = [];
      const stash = (s) => `\uE000${links.push(s) - 1}\uE000`;
      const marked = para.trim()
        .replace(/!\[([^\]]*)\]\([^)\s]*\)/g, '$1')
        .replace(LINK, (_, label, url, before, bare) => (url ? stash(`[${md(label)}](${url})`) : `${before}${stash(bare)}`))
        .replace(/\*\*([^*]+)\*\*/g, `${BOLD}$1${BOLD}`)
        .replace(ITALIC, `$1${ITAL}$2${ITAL}`)
        .replace(/^#{1,6}\s+(.*)/, `${BOLD}$1${BOLD}`);
      return md(marked)
        .replaceAll(BOLD, '**').replaceAll(ITAL, '*').replaceAll(STAR, '\\*')
        .replace(/\uE000(\d+)\uE000/g, (_, i) => links[i]);
    })
    .filter(Boolean);
  // Whole paragraphs up to the limit, so a cut can't leave a mark unclosed.
  let out = '';
  for (const p of paras) {
    const next = out ? `${out}\n\n${p}` : p;
    if (next.length > CARD_MAX - 2) return out ? `${out}\n\n…` : cut(p, CARD_MAX);
    out = next;
  }
  return out;
}

// The place: a few plain words for the post, and a map search for its
// Directions button (the site's own query: venue plus address).
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

export const text = (content) => ({ type: 10, content });
export const divider = { type: 14, divider: true, spacing: 1 };
export const linkButton = (label, url) => ({ type: 2, style: 5, label, url }); // style 5: a link button
// A line with a button beside it; just the line when there's no button.
export const withButton = (content, button) => (button ? { type: 9, components: [text(content)], accessory: button } : text(content));

// The post for one event: its title and one Components V2 message.
// A V2 post shows no text in the forum's list, only its title and its first
// image, so the title carries the facts, soonest-needed first, and only the
// event's own name is ever cut: "Tue Nov 17 · 5:30p–7:30p · DSM AI · The…".
// The message is one pink card: one picture (the event's photo, else the
// group's logo; never both, since the list shows the first and the gallery
// view shows every one), the place with Directions beside it, the group's
// write-up, and when it starts with the event's page beside that (where
// people RSVP). The ref line sits under the card.
export function render(e) {
  const date = e.multiDay ? dayRange(e.start, e.end) : `${weekday(e.start)} ${month(e.start)} ${day(e.start)}`;
  const facts = [date, hours(e), ...(e.hostsLabel ? [e.hostsLabel] : [])].join(' · ');
  const rel = `<t:${Math.floor(Date.parse(e.start) / 1000)}:R>`;
  const repeats = e.series?.rule ? `${e.series.rule.replace(/^./, (c) => c.toLowerCase())}${e.series.until ? ` through ${e.series.until}` : ''}` : '';
  const { place, map } = where(e);
  const address = map && e.address ? `\n${md(e.address)}` : '';
  const site = URL.canParse(e.url ?? '') ? new URL(e.url).hostname.replace(/^www\./, '') : '';
  const about = discordMarkdown(e.description);
  const picture = e.photo?.large ? { url: forDiscord(e.photo.large), alt: 'Event photo' } : e.logo ? { url: forDiscord(e.logo), alt: `${e.hostsLabel ?? 'Group'} logo` } : null;

  const card = [
    ...(picture ? [{ type: 12, items: [{ media: { url: picture.url }, description: picture.alt }] }] : []),
    withButton(`### ${place}${address}`, map && linkButton('Directions', map)),
    divider,
    ...(about ? [text(about), divider] : []),
    withButton(`**Starts ${rel}**${repeats ? ` · ${repeats}` : ''}`, site && linkButton(`Details on ${site}`, e.url)),
  ];
  return {
    name: cut(`${facts} · ${e.title}`, NAME_MAX),
    components: [
      { type: 17, accent_color: ACCENT, components: card },
      text(`-# ref ${refId(e)} ${dayKey(e.start)} ${hostKey(e)}`),
    ],
  };
}

// A ref line, "ref <id> <day> <host>": { id, day, host }, or null.
export function refOf(text = '') {
  const m = text.match(/^(?:-# )?ref (\S+) (\d{4}-\d{2}-\d{2}) (\S+)$/m);
  return m ? { id: m[1], day: m[2], host: m[3] } : null;
}
// The components as we send them. Discord's copy adds ids, image sizes and
// proxy URLs, so only the fields render() sets are kept for comparing.
const SENT = ['type', 'accent_color', 'content', 'style', 'label', 'url', 'divider', 'spacing'];
export function shape(list = []) {
  return list.map((c) => ({
    ...Object.fromEntries(SENT.filter((k) => c[k] !== undefined && c[k] !== null).map((k) => [k, c[k]])),
    ...(c.items ? { items: c.items.map((i) => ({ media: { url: i.media?.url }, ...(i.description ? { description: i.description } : {}) })) } : {}),
    ...(c.components ? { components: shape(c.components) } : {}),
    ...(c.accessory ? { accessory: shape([c.accessory])[0] } : {}),
  }));
}
const texts = (list = []) => list.flatMap((c) => [c.content ?? '', ...texts(c.components), ...texts(c.accessory ? [c.accessory] : [])]);
// A post's ref: a line of its V2 message, or, from before V2, its card's
// footer or the last line of its message.
const refOfPost = (p) => texts(p.components).map((t) => refOf(t)).find(Boolean)
  ?? refOf(p.embeds?.find((c) => c.footer?.text)?.footer.text) ?? refOf(p.content);
const isV2 = (p) => ((p.flags ?? 0) & V2) === V2;

// A cancelled post: a notice on top, the card grey and without its picture,
// so the forum's list shows the post without one.
function cancelled(components) {
  const notice = text("**No longer listed.** This event was cancelled or taken down. Check the group's page for what's on instead.");
  return [notice, ...shape(components).map((c) => (c.type === 17 ? { ...c, accent_color: GREY, components: c.components.filter((x) => x.type !== 12) } : c))];
}

// Decide what to do. `upcoming` and `past` are the site's events (upcoming
// already without a series' repeats); `posts` are the forum's open posts by
// the bot, locked ones left out: [{ id, name, flags, content, embeds,
// components, archived }].
// Pure, so it can be tested.
// `matched`, if given, is filled with each upcoming event's post: ref id → post id.
export function planPosts({ upcoming, past, posts, now = Date.now(), matched = new Map() }) {
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
    matched.set(refId(e), post.id);
    // A post from before V2 can't be turned into one, so it's made again.
    if (!isV2(post)) actions.push({ type: 'replace', post: post.id, event: e.id, ...want });
    else if (post.name !== want.name || JSON.stringify(shape(post.components)) !== JSON.stringify(want.components) || post.archived) {
      actions.push({ type: 'edit', post: post.id, event: e.id, ...want });
    }
  }

  for (const p of byRef.values()) {
    if (used.has(p.id) || upcomingIds.has(p.ref.id)) continue;
    const ended = pastById.get(p.ref.id);
    if (ended) {
      if (now - Date.parse(ended.end) >= CLOSE_AFTER) actions.push({ type: 'close', post: p.id, event: p.ref.id });
    } else if (!p.name.startsWith(CANCELLED)) {
      const name = cut(`${CANCELLED}${p.name}`, NAME_MAX);
      actions.push(isV2(p)
        ? { type: 'cancel', post: p.id, event: p.ref.id, name, components: cancelled(p.components) }
        : { type: 'cancel', post: p.id, event: p.ref.id, name, content: `**No longer listed.** This event was cancelled or taken down. Check the group's page for what's on instead.\n\n${p.content}` });
    }
  }
  return actions;
}

// The pinned "Coming up" post: the next two weeks in date order, since the
// forum itself can only sort by newest post or latest reply. Each line links
// to the event's post, whose title already says the day, the hours and who.
// Found again by its name, or by being the bot's pinned post.
export const COMING_UP = 'Coming up';
const SOON = 14 * DAY;
const PINNED = 2; // a forum post's "pinned" flag
const MESSAGE_MAX = 2000;

export function renderComingUp({ upcoming, postIds = new Map(), now = Date.now() }) {
  const soon = upcoming
    .filter((e) => Date.parse(e.end ?? e.start) > now && Date.parse(e.start) - now < SOON)
    .sort((a, b) => a.start.localeCompare(b.start));
  const line = (e) => {
    const id = postIds.get(refId(e));
    return id ? `<#${id}>` : `**${md(render(e).name)}**`;
  };
  const head = '-# The next two weeks, soonest first. Tap one to open its post. Kept up to date automatically.';
  if (!soon.length) return `${head}\n\nNothing in the next two weeks. Events further out have their own posts below.`;
  // Discord's message limit: drop lines from the end, saying how many.
  const lines = soon.map(line);
  const text = (n) => [head, '', ...lines.slice(0, n), ...(n < lines.length ? [`-# …and ${lines.length - n} more below.`] : [])].join('\n');
  let shown = lines.length;
  while (text(shown).length > MESSAGE_MAX) shown--;
  return text(shown);
}

// What the "Coming up" post needs: made, or brought back to `content`,
// reopened, pinned and locked. Null when it already is.
export function planComingUp(post, content) {
  if (!post) return { type: 'coming-up', post: null, name: COMING_UP, content };
  const pinned = (post.flags & PINNED) === PINNED;
  if (post.content === content && !post.archived && post.locked && pinned && post.name === COMING_UP) return null;
  return { type: 'coming-up', post: post.id, name: COMING_UP, content };
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
  let comingUp = null;
  for (const t of threads) {
    if (t.owner_id === me.id && !comingUp && (t.name === COMING_UP || (t.flags & PINNED) === PINNED)) {
      const first = await api('GET', `/channels/${t.id}/messages/${t.id}`);
      comingUp = { id: t.id, name: t.name, flags: t.flags ?? 0, content: first.content, archived: !!t.thread_metadata?.archived, locked: !!t.thread_metadata?.locked };
      continue;
    }
    // Locked posts are finished (closed or cancelled), and the site forgets
    // events after 90 days, so reading them would only cost requests and
    // mistake an aged-out event for a cancelled one.
    if (t.owner_id !== me.id || t.thread_metadata?.locked) continue;
    // A forum post's first message has the post's own id.
    const first = await api('GET', `/channels/${t.id}/messages/${t.id}`);
    posts.push({ id: t.id, name: t.name, flags: first.flags ?? 0, content: first.content, embeds: first.embeds, components: first.components, archived: !!t.thread_metadata?.archived });
  }
  return { posts, comingUp };
}

// Carry out the plan. Mentions are never parsed: the text is the groups'.
const message = (a) => ({ flags: V2, components: a.components, allowed_mentions: { parse: [] } });
// Returns the new posts: ref id → post id.
async function apply(api, forumId, actions) {
  const created = new Map();
  for (const a of actions) {
    if (a.type === 'create' || a.type === 'replace') {
      const post = await api('POST', `/channels/${forumId}/threads`, { name: a.name, auto_archive_duration: 10080, message: message(a) });
      if (post?.id) created.set(refId({ id: a.event }), post.id);
      // The old post goes only once its replacement exists.
      if (a.type === 'replace') await api('DELETE', `/channels/${a.post}`);
    } else if (a.type === 'edit') {
      // Unarchive first: an archived post can't be edited.
      await api('PATCH', `/channels/${a.post}`, { name: a.name, archived: false });
      await api('PATCH', `/channels/${a.post}/messages/${a.post}`, message(a));
    } else if (a.type === 'close') {
      await api('PATCH', `/channels/${a.post}`, { archived: true, locked: true });
    } else if (a.type === 'cancel') {
      await api('PATCH', `/channels/${a.post}`, { archived: false });
      const body = a.components ? { components: a.components } : { content: a.content };
      await api('PATCH', `/channels/${a.post}/messages/${a.post}`, { ...body, allowed_mentions: { parse: [] } });
      await api('PATCH', `/channels/${a.post}`, { name: a.name, archived: true, locked: true });
    }
  }
  return created;
}

async function applyComingUp(api, forumId, a) {
  const body = { content: a.content, allowed_mentions: { parse: [] } };
  let id = a.post;
  if (!id) {
    id = (await api('POST', `/channels/${forumId}/threads`, { name: a.name, auto_archive_duration: 10080, message: body })).id;
  } else {
    await api('PATCH', `/channels/${id}`, { archived: false });
    await api('PATCH', `/channels/${id}/messages/${id}`, body);
  }
  await api('PATCH', `/channels/${id}`, { name: a.name, flags: PINNED, locked: true });
}

// One run: read the forum, plan against the site's events, and apply unless
// it's a dry run. Returns the plan.
export async function syncEvents({ api, guildId, data, now = Date.now(), dryRun = false, forumName = 'events' }) {
  const forum = (await api('GET', `/guilds/${guildId}/channels`)).find((c) => c.type === 15 && c.name === forumName);
  if (!forum) throw new Error(`No #${forumName} forum channel in the server (infra/discord creates #events).`);
  const { posts, comingUp } = await readPosts(api, guildId, forum.id);
  const upcoming = data.upcoming.filter((e) => !e.repeat);
  const matched = new Map();
  const actions = planPosts({ upcoming, past: data.past, posts, now, matched });
  if (!dryRun) for (const [ref, id] of await apply(api, forum.id, actions)) matched.set(ref, id);
  // After the posts, so a new event's line can link to its new post.
  const pin = planComingUp(comingUp, renderComingUp({ upcoming, postIds: matched, now }));
  if (pin) {
    actions.push(pin);
    if (!dryRun) await applyComingUp(api, forum.id, pin);
  }
  return actions;
}

// The fields render() and planPosts() read, and nothing else.
const FIELDS = ['id', 'title', 'start', 'end', 'allDay', 'multiDay', 'url', 'description', 'venue', 'address', 'fullAddress', 'online', 'hybrid', 'photo', 'logo', 'series', 'groupIds', 'hostsLabel', 'repeat'];
export const slim = (data) => {
  const keep = (k, v) => (k === 'photo' ? { large: v.large } : v);
  // The hosting group's logo, from groups.yaml or what the refresh read.
  const withLogo = (e) => ({ ...e, logo: e.groupIds.map((id) => data.byId?.[id]?.logo).find(Boolean) });
  const pick = (e) => Object.fromEntries(FIELDS.filter((k) => e[k] !== undefined && e[k] !== null).map((k) => [k, keep(k, e[k])]));
  return { upcoming: data.upcoming.map((e) => pick(withLogo(e))), past: data.past.map(pick) };
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
  const actions = await syncEvents({ api: discordApi(token), guildId, data, dryRun, forumName: process.env.DISCORD_FORUM || 'events' });
  if (!actions.length) console.log('#events is up to date.');
  for (const a of actions) {
    console.log(`${dryRun ? '[dry run] ' : ''}${a.type}${a.event ? ` ${a.event}` : ''}${a.name ? `: ${a.name}` : ''}`);
    if (dryRun && a.type === 'coming-up') console.log(a.content.replace(/^/gm, '    '));
  }
}
