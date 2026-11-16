import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMING_UP, discordApi, planComingUp, planPosts, refOf, render, renderComingUp, shape, slim, syncEvents } from '../scripts/discord-events.mjs';

const now = Date.parse('2026-11-14T18:00:00Z');
const ev = (over = {}) => ({
  id: 'pyowa-1', title: 'Python Night', start: '2026-11-20T00:00:00.000Z', end: '2026-11-20T02:00:00.000Z',
  allDay: false, multiDay: false, url: 'https://www.meetup.com/pyowa/events/1/', venue: 'Lean Techniques',
  groupIds: ['pyowa'], hostsLabel: 'Pyowa', ...over,
});
const V2 = 32768;
const postFor = (e, over = {}) => ({ id: `t-${e.id}`, flags: V2, ...render(e), archived: false, ...over });
// The pieces of a rendered post: the card's parts, its picture, its lines with
// a button beside them, and every bit of text in it.
const card = (r) => r.components[0].components;
const picture = (r) => card(r).find((c) => c.type === 12)?.items[0];
const rows = (r) => card(r).filter((c) => c.type === 9 || c.type === 10).map((c) => (c.type === 9 ? [c.components[0].content, c.accessory.label, c.accessory.url] : [c.content]));
const refLine = (r) => r.components.at(-1).content;
const about = (r) => card(r).filter((c) => c.type === 10).map((c) => c.content)[0];

test('a post: day, hours and group in the title; one pink card with the picture, the place and Directions, the write-up, and when it starts beside the event\'s page', () => {
  const e = ev({ address: '1 Main St', fullAddress: '1 Main St, Des Moines, IA', description: 'Learn how Python packaging works.\n\nPizza at 6.', photo: { large: 'https://img/p.jpg' } });
  const r = render(e);
  assert.equal(r.name, 'Thu Nov 19 · 6p–8p · Pyowa · Python Night');
  const map = 'https://www.google.com/maps/search/?api=1&query=Lean%20Techniques%2C%201%20Main%20St%2C%20Des%20Moines%2C%20IA';
  const t = Date.parse('2026-11-20T00:00:00Z') / 1000;
  assert.deepEqual(r.components, [
    { type: 17, accent_color: 0xff4fa3, components: [
      { type: 12, items: [{ media: { url: 'https://img/p.jpg' }, description: 'Event photo' }] },
      { type: 9, components: [{ type: 10, content: '### 📍 Lean Techniques\n1 Main St' }], accessory: { type: 2, style: 5, label: 'Directions', url: map } },
      { type: 14, divider: true, spacing: 1 },
      { type: 10, content: 'Learn how Python packaging works.\n\nPizza at 6.' },
      { type: 14, divider: true, spacing: 1 },
      { type: 9, components: [{ type: 10, content: `**Starts <t:${t}:R>**` }], accessory: { type: 2, style: 5, label: 'Details on meetup.com', url: 'https://www.meetup.com/pyowa/events/1/' } },
    ] },
    { type: 10, content: '-# ref pyowa-1 2026-11-19 pyowa' },
  ]);
  assert.deepEqual(refOf(refLine(r)), { id: 'pyowa-1', day: '2026-11-19', host: 'pyowa' });
  assert.doesNotMatch(JSON.stringify(r), /Des Moines time|RSVP/);
});

test('the card carries the whole write-up, formatted the way the site formats it', () => {
  const of = (description) => about(render(ev({ description })));
  assert.equal(of('## Agenda\n\n**6:00** Pizza \\| drinks at *Lean Techniques*\nSee [the slides](https://x.com/a_b) or https://y.com/c_d.\n\n---\n\n![🍕](https://e/x.png) Doors open at 6.'),
    '**Agenda**\n\n**6:00** Pizza \\| drinks at *Lean Techniques*\nSee [the slides](https://x.com/a_b) or https://y.com/c_d.\n\n🍕 Doors open at 6.');
  // Meetup's escaped star is only a star; other marks show as typed.
  assert.equal(of('2 \\* 3 is _six_ ~~maybe~~\n- one'), '2 \\* 3 is \\_six\\_ \\~\\~maybe\\~\\~\n\\- one');
  // A link's label is escaped, so it can't open a second link.
  assert.equal(of('[a](https://x.com/) [b]](https://y.com/)'), '[a](https://x.com/) \\[b\\]\\](https://y.com/)');
  // Longer than a V2 message holds (4,000 across all its text): whole paragraphs, then "…".
  const long = render(ev({ description: Array.from({ length: 30 }, () => 'x'.repeat(200)).join('\n\n') }));
  const all = JSON.stringify(long.components).match(/"content":"(?:[^"\\]|\\.)*"/g).map((c) => JSON.parse(`{${c}}`).content).join('');
  assert.ok(all.length <= 4000 && about(long).endsWith('\n\n…'));
  // No write-up: no write-up and no second divider.
  assert.deepEqual(card(render(ev({ description: '' }))).map((c) => c.type), [9, 14, 9]);
});

test('online, hybrid, no venue yet, all day, several days and a series each read right', () => {
  const online = render(ev({ venue: 'Online', online: true }));
  assert.deepEqual(rows(online)[0], ['### 💻 Online'], 'no Directions for an online event');
  assert.deepEqual(rows(render(ev({ venue: '', online: false })))[0], ['### 📍 Place to be announced']);
  assert.equal(rows(render(ev({ hybrid: true, address: '1 Main St' })))[0][0], '### 📍 Lean Techniques · also online\n1 Main St');
  assert.equal(rows(render(ev()))[0][2], 'https://www.google.com/maps/search/?api=1&query=Lean%20Techniques%2C%20Des%20Moines%2C%20IA');
  const conf = render(ev({ id: 'manual-devcon', multiDay: true, allDay: true, start: '2026-12-03T06:00:00Z', end: '2026-12-05T06:00:00Z', groupIds: [], hostsLabel: 'Iowa Tech Week', venue: '' }));
  assert.equal(conf.name, 'Thu–Fri Dec 3–4 · All day · Iowa Tech Week · Python Night');
  assert.equal(refOf(refLine(conf)).host, 'iowa-tech-week');
  assert.match(rows(render(ev({ series: { rule: 'Every 2nd Monday', until: 'Dec 2027' } })))[1][0], /:R>\*\* · every 2nd Monday through Dec 2027$/);
  assert.equal(render(ev({ hostsLabel: '' })).name, 'Thu Nov 19 · 6p–8p · Python Night', 'no empty slot when there are no hosts');
});

test('the group\'s text is escaped, so it shows as typed and can\'t ping anyone', () => {
  const r = render(ev({ venue: '**Big** <@everyone> Hall', address: '@here St', description: '# Tonight: a hands-on night of _fun_ with @everyone, and all are welcome to come.' }));
  assert.equal(rows(r)[0][0], '### 📍 \\*\\*Big\\*\\* \\<\\@everyone\\> Hall\n\\@here St');
  // A leading "#" heading becomes a bold line; its text is still escaped.
  assert.match(about(r), /^\*\*Tonight: a hands-on night of \\_fun\\_ with \\@everyone/);
});

test('long titles are cut to Discord\'s 100 characters, losing only the event\'s own name', () => {
  const { name } = render(ev({ title: 'x'.repeat(200) }));
  assert.equal(name.length, 100);
  assert.match(name, /^Thu Nov 19 · 6p–8p · Pyowa · x+…$/);
});

test('refOf ignores messages that are not event posts', () => {
  assert.equal(refOf('hello'), null);
  assert.equal(refOf(), null);
});

test('a new event gets a post; posts are created soonest last, so it lists first', () => {
  const later = ev({ id: 'aws-2', start: '2026-11-25T00:00:00.000Z', end: '2026-11-25T02:00:00.000Z', groupIds: ['aws'], hostsLabel: 'AWS' });
  const actions = planPosts({ upcoming: [ev(), later], past: [], posts: [], now });
  assert.deepEqual(actions.map((a) => [a.type, a.event]), [['create', 'aws-2'], ['create', 'pyowa-1']]);
});

test('a post that matches its event is left alone', () => {
  assert.deepEqual(planPosts({ upcoming: [ev()], past: [], posts: [postFor(ev())], now }), []);
});

test('a post whose event changed is edited, and one Discord archived for quiet is reopened', () => {
  const moved = ev({ venue: 'We Write Code' });
  const [a] = planPosts({ upcoming: [moved], past: [], posts: [postFor(ev())], now });
  assert.deepEqual([a.type, a.post], ['edit', 't-pyowa-1']);
  assert.match(rows(a)[0][0], /We Write Code/);
  assert.deepEqual(planPosts({ upcoming: [ev()], past: [], posts: [postFor(ev(), { archived: true })], now }).map((x) => x.type), ['edit']);
});

test('a placeholder replaced by the real event (same hosts, same day, new id) keeps its post', () => {
  const placeholder = ev({ id: 'manual-pyowa-2026-11-19', title: 'Pyowa monthly meeting' });
  const real = ev({ id: 'pyowa-999', title: 'Testing with pytest' });
  const actions = planPosts({ upcoming: [real], past: [], posts: [postFor(placeholder)], now });
  assert.deepEqual(actions.map((a) => [a.type, a.post, a.event]), [['edit', 't-manual-pyowa-2026-11-19', 'pyowa-999']]);
  assert.match(refLine(actions[0]), /^-# ref pyowa-999 /);
});

test('a post is closed 3 days after its event ends, not before', () => {
  const done = ev({ start: '2026-11-10T00:00:00.000Z', end: '2026-11-10T02:00:00.000Z' });
  const posts = [postFor(done)];
  assert.deepEqual(planPosts({ upcoming: [], past: [done], posts, now: Date.parse('2026-11-12T00:00:00Z') }), []);
  assert.deepEqual(planPosts({ upcoming: [], past: [done], posts, now }).map((a) => a.type), ['close']);
});

test('a post whose upcoming event disappeared is marked cancelled once: a notice on top, the card grey and without its picture', () => {
  const gone = ev({ id: 'pyowa-gone', photo: { large: 'https://img/p.jpg' } });
  const [a] = planPosts({ upcoming: [], past: [], posts: [postFor(gone)], now });
  assert.equal(a.type, 'cancel');
  assert.equal(a.name, 'Cancelled · Thu Nov 19 · 6p–8p · Pyowa · Python Night');
  assert.match(a.components[0].content, /^\*\*No longer listed\.\*\*/);
  assert.equal(a.components[1].accent_color, 0x80848e);
  assert.ok(!a.components[1].components.some((c) => c.type === 12));
  assert.equal(refOf(a.components.at(-1).content).id, 'pyowa-gone');
  assert.deepEqual(planPosts({ upcoming: [], past: [], posts: [{ ...postFor(gone), name: a.name, components: a.components }], now }), []);
  // A post from before V2 is cancelled the old way, in its text.
  const [old] = planPosts({ upcoming: [], past: [], posts: [{ id: 'o', name: 'Thu Nov 19 · Python Night', content: 'x\n-# ref pyowa-gone 2026-11-19 pyowa', archived: false }], now });
  assert.match(old.content, /^\*\*No longer listed\.\*\*/);
});

test('posts without a ref, and a second post for the same event, are ignored', () => {
  const posts = [{ id: 'chat', name: 'hi', content: 'hello', archived: false }, postFor(ev()), postFor(ev(), { id: 'dupe' })];
  assert.deepEqual(planPosts({ upcoming: [ev()], past: [], posts, now }), []);
});

// A fake Discord: the guild's channels, the forum's threads and their first
// messages, recording every write.
function fakeDiscord({ threads = [], firsts = {}, archived = [], forum = true } = {}) {
  const writes = [];
  const routes = {
    'GET /users/@me': { id: 'bot' },
    'GET /guilds/g/channels': forum ? [{ id: 'f', type: 15, name: 'events' }, { id: 'x', type: 0, name: 'events' }] : [],
    'GET /guilds/g/threads/active': { threads },
    'GET /channels/f/threads/archived/public?limit=100': { threads: archived, has_more: false },
  };
  const api = async (method, path, body) => {
    if (method !== 'GET') { writes.push([method, path, body]); return method === 'POST' ? { id: `new${writes.length}` } : {}; }
    const m = path.match(/^\/channels\/(\w+)\/messages\/\1$/);
    if (m) return firsts[m[1]];
    if (!(`${method} ${path}` in routes)) throw new Error(`unexpected ${method} ${path}`);
    return routes[`${method} ${path}`];
  };
  return { api, writes };
}
const data = (upcoming, past = []) => ({ upcoming, past });

test('a sync reads the bot\'s open posts, skips others and locked ones, and applies the plan', async () => {
  const changed = ev({ id: 'aws-3', groupIds: ['aws'], hostsLabel: 'AWS', title: 'Old title' });
  const { api, writes } = fakeDiscord({
    threads: [
      { id: 'a', parent_id: 'f', owner_id: 'bot', name: render(changed).name, thread_metadata: {} },
      { id: 'b', parent_id: 'f', owner_id: 'someone', name: 'not ours', thread_metadata: {} },
      { id: 'c', parent_id: 'other', owner_id: 'bot', name: 'elsewhere', thread_metadata: {} },
    ],
    archived: [{ id: 'd', parent_id: 'f', owner_id: 'bot', name: 'closed', thread_metadata: { archived: true, locked: true } }],
    firsts: { a: { flags: V2, ...render(changed) } },
  });
  const actions = await syncEvents({ api, guildId: 'g', data: data([ev(), { ...changed, title: 'New title' }, ev({ id: 'rep', repeat: true })]), now });
  assert.deepEqual(actions.map((a) => [a.type, a.event]), [['create', 'pyowa-1'], ['edit', 'aws-3'], ['coming-up', undefined]]);
  assert.deepEqual(writes.map(([m, p]) => `${m} ${p}`), [
    'POST /channels/f/threads', 'PATCH /channels/a', 'PATCH /channels/a/messages/a',
    'POST /channels/f/threads', 'PATCH /channels/new4',
  ]);
  assert.equal(writes[0][2].auto_archive_duration, 10080);
  assert.equal(writes[0][2].message.flags, V2);
  assert.deepEqual(writes[0][2].message.allowed_mentions, { parse: [] });
  // The "Coming up" post links both events' posts, the new one included, and is pinned and locked.
  assert.match(JSON.stringify(writes[3][2].message.components), /channels\/g\/new1\)/);
  assert.match(JSON.stringify(writes[3][2].message.components), /channels\/g\/a\)/);
  assert.deepEqual(writes[4][2], { name: COMING_UP, flags: 2, locked: true });
});

test('closing and cancelling write the right changes; a dry run writes nothing', async () => {
  const done = ev({ id: 'done', start: '2026-11-01T00:00:00.000Z', end: '2026-11-01T02:00:00.000Z' });
  const gone = ev({ id: 'gone' });
  const setup = () => fakeDiscord({
    threads: [{ id: 'p', parent_id: 'f', owner_id: 'bot', name: render(done).name, thread_metadata: {} }],
    archived: [{ id: 'q', parent_id: 'f', owner_id: 'bot', name: render(gone).name, thread_metadata: { archived: true } }],
    firsts: { p: { flags: V2, ...render(done) }, q: { flags: V2, ...render(gone) } },
  });
  const dry = setup();
  assert.deepEqual((await syncEvents({ api: dry.api, guildId: 'g', data: data([], [done]), now, dryRun: true })).map((a) => a.type), ['close', 'cancel', 'coming-up']);
  assert.deepEqual(dry.writes, []);
  const real = setup();
  await syncEvents({ api: real.api, guildId: 'g', data: data([], [done]), now });
  assert.deepEqual(real.writes.map(([m, p, b]) => [m, p, b.locked ?? null]), [
    ['PATCH', '/channels/p', true],
    ['PATCH', '/channels/q', null], ['PATCH', '/channels/q/messages/q', null], ['PATCH', '/channels/q', true],
    ['POST', '/channels/f/threads', null], ['PATCH', '/channels/new5', true],
  ]);
  assert.ok(real.writes[2][2].components && !('content' in real.writes[2][2]), 'a V2 post is cancelled through its components');
});

test('a server without the #events forum fails loudly', async () => {
  await assert.rejects(syncEvents({ api: fakeDiscord({ forum: false }).api, guildId: 'g', data: data([]), now }), /No #events forum/);
});

test('archived posts are read page by page', async () => {
  const pages = [
    { threads: [{ id: 'a1', parent_id: 'f', owner_id: 'bot', name: 'x', thread_metadata: { archived: true, archive_timestamp: '2026-11-01T00:00:00Z' } }], has_more: true },
    { threads: [], has_more: false },
  ];
  const seen = [];
  const api = async (method, path) => {
    seen.push(path);
    if (path === '/users/@me') return { id: 'bot' };
    if (path === '/guilds/g/channels') return [{ id: 'f', type: 15, name: 'events' }];
    if (path === '/guilds/g/threads/active') return { threads: [] };
    if (path.startsWith('/channels/f/threads/archived/public')) return pages.shift();
    return { content: 'not an event post' };
  };
  await syncEvents({ api, guildId: 'g', data: data([]), now });
  assert.ok(seen.includes('/channels/f/threads/archived/public?limit=100&before=2026-11-01T00%3A00%3A00Z'));
});

test('the API client sends the token, retries rate limits and Discord errors, and reports other failures', async () => {
  const replies = [
    { status: 429, json: async () => ({ retry_after: 0.01 }) },
    { status: 503 },
    { status: 200, ok: true, json: async () => ({ id: 'ok' }) },
    { status: 204, ok: true },
    { status: 404, ok: false, text: async () => 'Unknown Channel' },
  ];
  const calls = [];
  const slept = [];
  const api = discordApi('tok', async (url, opts) => { calls.push([url, opts]); return replies.shift(); }, async (ms) => { slept.push(ms); });
  assert.deepEqual(await api('POST', '/x', { a: 1 }), { id: 'ok' });
  assert.equal(calls.length, 3);
  assert.equal(calls[0][1].headers.Authorization, 'Bot tok');
  assert.equal(calls[0][1].body, '{"a":1}');
  assert.deepEqual(slept, [260, 4250]);
  assert.equal(await api('DELETE', '/y'), null);
  await assert.rejects(api('GET', '/z'), /Discord GET \/z: 404 Unknown Channel/);
});

test('the file handed to the sync step carries only what a post needs', () => {
  const full = { ...ev(), description: 'text', photo: { large: 'l.jpg', small: 's.jpg', width: 600 }, going: 12, image: 'x.jpg', venueKey: 'k', extra: undefined, address: null };
  const out = slim({ upcoming: [full], past: [ev({ id: 'old', repeat: true })] });
  assert.deepEqual(Object.keys(out.upcoming[0]).sort(), ['allDay', 'description', 'end', 'groupIds', 'hostsLabel', 'id', 'multiDay', 'photo', 'start', 'title', 'url', 'venue']);
  assert.deepEqual(out.upcoming[0].photo, { large: 'l.jpg' });
  assert.equal(out.past[0].repeat, true);
});

test('a post from before V2 is made again: the new post first, then the old one deleted', async () => {
  const before = { id: 'old', name: 'Thu Nov 19 · Python Night', content: '## 6p–8p', embeds: [{ footer: { text: 'ref pyowa-1 2026-11-19 pyowa' } }], archived: false };
  assert.deepEqual(planPosts({ upcoming: [ev()], past: [], posts: [before], now }).map((a) => [a.type, a.post, a.event]), [['replace', 'old', 'pyowa-1']]);
  // Even older: the ref as the message's last line.
  const legacy = { id: 'older', name: 'Nov 19 · Python Night', content: '**Pyowa**\n-# ref pyowa-1 2026-11-19 pyowa', embeds: [], archived: false };
  assert.deepEqual(planPosts({ upcoming: [ev()], past: [], posts: [legacy], now }).map((a) => a.type), ['replace']);
  const { api, writes } = fakeDiscord({ threads: [{ id: 'old', parent_id: 'f', owner_id: 'bot', name: before.name, thread_metadata: {} }], firsts: { old: before } });
  await syncEvents({ api, guildId: 'g', data: data([ev()]), now });
  assert.deepEqual(writes.slice(0, 2).map(([m, p]) => `${m} ${p}`), ['POST /channels/f/threads', 'DELETE /channels/old']);
  assert.match(JSON.stringify(writes[2][2].message.components), /channels\/g\/new1\)/, '"Coming up" links the new post');
});

test('Discord\'s copy of a post (ids, image sizes, proxy URLs) counts as unchanged', () => {
  const e = ev({ photo: { large: 'https://img/p.jpg' } });
  const addIds = (list) => list.map((c, i) => ({ ...c, id: i + 1,
    ...(c.items ? { items: c.items.map((x) => ({ ...x, spoiler: false, media: { ...x.media, proxy_url: 'p', width: 1, height: 1, content_type: 'image/jpeg' } })) } : {}),
    ...(c.components ? { components: addIds(c.components) } : {}),
    ...(c.accessory ? { accessory: { ...c.accessory, id: 99 } } : {}) }));
  const stored = { ...postFor(e), components: addIds(render(e).components) };
  assert.deepEqual(shape(stored.components), render(e).components);
  assert.deepEqual(planPosts({ upcoming: [e], past: [], posts: [stored], now }), []);
});

test('a scraped URL only ever becomes a button\'s link, an event without a link gets no Details button, and an id with spaces still round-trips', () => {
  const sneaky = 'https://their.site/x)[meetup.com/rsvp](https://evil.example/login';
  const r = render(ev({ url: sneaky, description: '' }));
  assert.deepEqual(rows(r)[1].slice(1), ['Details on their.site', sneaky]);
  assert.doesNotMatch(JSON.stringify(rows(r).map((x) => x[0])), /evil/);
  assert.equal(rows(render(ev({ url: undefined })))[1].length, 1, 'no link: the start line has no button');
  assert.equal(refOf(refLine(render(ev({ id: 'ical-abc 123@cal' })))).id, 'ical-abc_123@cal');
});

test('an event whose id has spaces matches its own post instead of making a new one', () => {
  const odd = ev({ id: 'ical-abc 123@cal' });
  assert.deepEqual(planPosts({ upcoming: [odd], past: [], posts: [postFor(odd)], now }), []);
});

test('one picture: the event\'s photo, else the group\'s logo, else none; a Meetup photo is sent as .jpeg', () => {
  const logo = 'https://secure.meetupstatic.com/photos/event/7/b/600_9.webp';
  assert.deepEqual(picture(render(ev({ logo }))), { media: { url: 'https://secure.meetupstatic.com/photos/event/7/b/600_9.jpeg' }, description: 'Pyowa logo' });
  const both = render(ev({ logo, photo: { large: 'https://images.lumacdn.com/x.webp' } }));
  assert.equal(card(both).filter((c) => c.type === 12).length, 1);
  assert.equal(picture(both).media.url, 'https://images.lumacdn.com/x.webp');
  assert.equal(picture(render(ev())), undefined, 'no photo, no logo: no picture');
  assert.ok(!JSON.stringify(both).includes('"type":11'), 'never a thumbnail beside the text');
});

test('the events file carries each event\'s group logo, so the sync step needs no group data', () => {
  const data = { upcoming: [ev({ groupIds: ['nologo', 'pyowa'] }), ev({ id: 'manual-x', groupIds: [] })], past: [], byId: { pyowa: { logo: 'l.png' }, nologo: {} } };
  const out = slim(data);
  assert.equal(out.upcoming[0].logo, 'l.png');
  assert.equal(out.upcoming[1].logo, undefined);
});

// The "Coming up" card's text blocks, dividers as ---.
const comingUpText = (components) => components[0].components.map((c) => (c.type === 14 ? '---' : c.content));

test('"Coming up" is one pink card: a heading per day, then each event with its start, who, and a link to its post', () => {
  const soon = ev({ id: 'aws-1', groupIds: ['aws'], hostsLabel: 'AWS', start: '2026-11-17T23:30:00.000Z', end: '2026-11-18T01:00:00.000Z' });
  const sameDay = ev({ id: 'aws-2', hostsLabel: 'AWS', title: 'Late [night]', start: '2026-11-18T02:00:00.000Z', end: '2026-11-18T03:00:00.000Z' });
  const far = ev({ id: 'far', start: '2026-12-10T00:00:00.000Z', end: '2026-12-10T02:00:00.000Z' });
  const ended = ev({ id: 'ended', start: '2026-11-14T15:00:00.000Z', end: '2026-11-14T16:00:00.000Z' });
  const card = renderComingUp({ upcoming: [ev(), far, sameDay, soon, ended], postIds: new Map([['pyowa-1', '111'], ['aws-1', '222']]), guildId: 'g', now });
  assert.equal(card[0].type, 17);
  assert.deepEqual(comingUpText(card).slice(1), [
    '---',
    '### Tue Nov 17\n**5:30p**  AWS · [Python Night](https://discord.com/channels/g/222)\n**8p**  AWS · Late \\[night\\]',
    '---',
    '### Thu Nov 19\n**6p**  Pyowa · [Python Night](https://discord.com/channels/g/111)',
  ]);
  assert.match(comingUpText(renderComingUp({ upcoming: [far], now })).at(-1), /Nothing in the next two weeks/);
});

test('"Coming up" stays under Discord\'s 4000 characters of text, saying how many more there are', () => {
  const many = Array.from({ length: 200 }, (_, i) => ev({ id: `e${i}`, hostsLabel: 'A rather long group name for testing' }));
  const parts = comingUpText(renderComingUp({ upcoming: many, now }));
  assert.ok(parts.join('').length <= 4000);
  assert.match(parts.at(-1), /^-# …and \d+ more below\.$/);
});

test('"Coming up" is made once, then edited only when it changed or came unpinned, unlocked or archived', () => {
  const card = renderComingUp({ upcoming: [ev()], now });
  assert.deepEqual(planComingUp(null, card), { type: 'coming-up', post: null, name: COMING_UP, components: card });
  const post = { id: 'c', name: COMING_UP, flags: 2, messageFlags: 1 << 15, components: card, archived: false, locked: true };
  assert.equal(planComingUp(post, card), null);
  for (const change of [{ components: renderComingUp({ upcoming: [], now }) }, { flags: 0 }, { locked: false }, { archived: true }, { name: 'renamed' }]) {
    assert.equal(planComingUp({ ...post, ...change }, card)?.post, 'c', JSON.stringify(change));
  }
});

test('a plain-text "Coming up" post is made again as a V2 card, and the old one deleted once the new one exists', async () => {
  const plan = planComingUp({ id: 'old', name: COMING_UP, flags: 2, messageFlags: 0, content: 'old text', archived: false, locked: true }, renderComingUp({ upcoming: [], now }));
  assert.equal(plan.post, null);
  assert.equal(plan.replaces, 'old');
  const { api, writes } = fakeDiscord({
    threads: [{ id: 'old', parent_id: 'f', owner_id: 'bot', name: COMING_UP, flags: 2, thread_metadata: { locked: true } }],
    firsts: { old: { content: 'old text' } },
  });
  await syncEvents({ api, guildId: 'g', data: data([]), now });
  const calls = writes.map(([method, path]) => `${method} ${path}`);
  assert.ok(calls.indexOf('DELETE /channels/old') > calls.findIndex((c) => c.startsWith('POST')), calls.join(', '));
});

test('a sync finds its pinned "Coming up" post, even locked, and doesn\'t treat it as an event', async () => {
  const { api, writes } = fakeDiscord({
    threads: [{ id: 'c', parent_id: 'f', owner_id: 'bot', name: COMING_UP, flags: 2, thread_metadata: { locked: true } }],
    firsts: { c: { flags: 1 << 15, components: renderComingUp({ upcoming: [], now }) } },
  });
  assert.deepEqual(await syncEvents({ api, guildId: 'g', data: data([]), now }), []);
  assert.deepEqual(writes, []);
});
