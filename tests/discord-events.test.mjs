import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discordApi, planPosts, refOf, render, slim, syncEvents } from '../scripts/discord-events.mjs';

const now = Date.parse('2026-11-14T18:00:00Z');
const ev = (over = {}) => ({
  id: 'pyowa-1', title: 'Python Night', start: '2026-11-20T00:00:00.000Z', end: '2026-11-20T02:00:00.000Z',
  allDay: false, multiDay: false, url: 'https://www.meetup.com/pyowa/events/1/', venue: 'Lean Techniques',
  groupIds: ['pyowa'], hostsLabel: 'Pyowa', ...over,
});
const postFor = (e, over = {}) => ({ id: `t-${e.id}`, ...render(e), archived: false, ...over });

test('a post: the day in the title; the hours, group and place in the message; the card has the hook; buttons open the page and directions', () => {
  const e = ev({ address: '1 Main St, Des Moines, IA', description: 'Learn how Python packaging works and why it keeps changing.\n\nPizza at 6.', photo: { large: 'https://img/p.jpg' } });
  const { name, content, embeds, components } = render(e);
  assert.equal(name, 'Thu Nov 19 · Python Night');
  const map = 'https://www.google.com/maps/search/?api=1&query=Lean%20Techniques%2C%201%20Main%20St%2C%20Des%20Moines%2C%20IA';
  // The forum's list shows the message as plain text, so it holds no links.
  assert.equal(content, `## 6p–8p\n-# <t:${Date.parse('2026-11-20T00:00:00Z') / 1000}:R> · **Pyowa** · 📍 Lean Techniques`);
  assert.doesNotMatch(content, /\]\(|https?:/);
  assert.deepEqual(refOf(embeds[0].footer.text), { id: 'pyowa-1', day: '2026-11-19', host: 'pyowa' });
  assert.deepEqual(embeds, [{
    color: 0xff4fa3,
    description: 'Learn how Python packaging works and why it keeps changing.',
    image: { url: 'https://img/p.jpg' },
    footer: { text: 'ref pyowa-1 2026-11-19 pyowa' },
  }]);
  assert.deepEqual(components, [{ type: 1, components: [
    { type: 2, style: 5, label: 'Details on meetup.com', url: 'https://www.meetup.com/pyowa/events/1/' },
    { type: 2, style: 5, label: 'Directions', url: map },
  ] }]);
  assert.doesNotMatch(content + JSON.stringify(embeds), /Des Moines time|RSVP on|\]\(/);
});

test('the hook skips a title repeat, short logistics and a pointer to another link, and drops a "from <group>" sign-off', () => {
  const hookOf = (description, over = {}) => render(ev({ description, ...over })).embeds[0].description;
  assert.equal(hookOf('Python Night\n\nDoors open at 6 PM.\n\nCheck out https://pyowa.org for details on this.\n\nA hands-on night of packaging tips for every level of Python user.'),
    'A hands-on night of packaging tips for every level of Python user.');
  assert.equal(hookOf('An evening of talks and community, from Pyowa.'), 'An evening of talks and community.');
  const long = `${'This sentence is about forty characters. '.repeat(6)}And then it keeps on going without a break for a while longer.`;
  assert.equal(hookOf(long), 'This sentence is about forty characters. '.repeat(6).trim());
  assert.ok(hookOf(long).length <= 300 && hookOf(long).endsWith('.'));
  assert.ok(hookOf('word '.repeat(100)).endsWith('…'));
  assert.equal(render(ev({ description: '' })).embeds[0].description, undefined, 'no hook, no description');
});

test('online, hybrid, no venue yet, all day, several days and a series each read right', () => {
  const online = render(ev({ venue: 'Online', online: true }));
  assert.match(online.content, /:R> · \*\*Pyowa\*\* · 💻 Online$/);
  assert.deepEqual(online.components[0].components.map((b) => b.label), ['Details on meetup.com'], 'no Directions for an online event');
  assert.match(render(ev({ venue: '', online: false })).content, /📍 Place to be announced$/);
  assert.match(render(ev({ hybrid: true })).content, /📍 Lean Techniques · also online$/);
  assert.equal(render(ev()).components[0].components[1].url, 'https://www.google.com/maps/search/?api=1&query=Lean%20Techniques%2C%20Des%20Moines%2C%20IA');
  const conf = render(ev({ id: 'manual-devcon', multiDay: true, allDay: true, start: '2026-12-03T06:00:00Z', end: '2026-12-05T06:00:00Z', groupIds: [], hostsLabel: 'Iowa Tech Week', venue: '' }));
  assert.equal(conf.name, 'Thu–Fri Dec 3–4 · Python Night');
  assert.match(conf.content, /^## All day\n/);
  assert.equal(refOf(conf.embeds[0].footer.text).host, 'iowa-tech-week');
  assert.match(render(ev({ series: { rule: 'Every 2nd Monday', until: 'Dec 2027' } })).content, /:R> · every 2nd Monday through Dec 2027 · \*\*Pyowa\*\* · 📍/);
  assert.doesNotMatch(render(ev({ hostsLabel: '' })).content, /\*\*/, 'no empty bold when there are no hosts');
});

test('the group\'s text is escaped, so it shows as typed and can\'t ping anyone', () => {
  const { content, embeds } = render(ev({ venue: '**Big** <@everyone> Hall', description: '# Tonight: a hands-on night of _fun_ with @everyone, and all are welcome to come.' }));
  assert.match(content, /📍 \\\*\\\*Big\\\*\\\* \\<\\@everyone\\> Hall$/);
  // The site's plainText() already drops a leading "#" heading; a hyphen inside a word is left alone.
  assert.match(embeds[0].description, /^Tonight: a hands-on night of \\_fun\\_ with \\@everyone/);
});

test('long titles are cut to Discord\'s 100 characters', () => {
  const { name } = render(ev({ title: 'x'.repeat(200) }));
  assert.equal(name.length, 100);
  assert.ok(name.endsWith('…'));
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
  assert.match(a.content, /We Write Code/);
  assert.deepEqual(planPosts({ upcoming: [ev()], past: [], posts: [postFor(ev(), { archived: true })], now }).map((x) => x.type), ['edit']);
});

test('a placeholder replaced by the real event (same hosts, same day, new id) keeps its post', () => {
  const placeholder = ev({ id: 'manual-pyowa-2026-11-19', title: 'Pyowa monthly meeting' });
  const real = ev({ id: 'pyowa-999', title: 'Testing with pytest' });
  const actions = planPosts({ upcoming: [real], past: [], posts: [postFor(placeholder)], now });
  assert.deepEqual(actions.map((a) => [a.type, a.post, a.event]), [['edit', 't-manual-pyowa-2026-11-19', 'pyowa-999']]);
  assert.match(actions[0].embeds[0].footer.text, /^ref pyowa-999 /);
});

test('a post is closed 3 days after its event ends, not before', () => {
  const done = ev({ start: '2026-11-10T00:00:00.000Z', end: '2026-11-10T02:00:00.000Z' });
  const posts = [postFor(done)];
  assert.deepEqual(planPosts({ upcoming: [], past: [done], posts, now: Date.parse('2026-11-12T00:00:00Z') }), []);
  assert.deepEqual(planPosts({ upcoming: [], past: [done], posts, now }).map((a) => a.type), ['close']);
});

test('a post whose upcoming event disappeared is marked cancelled once', () => {
  const gone = ev({ id: 'pyowa-gone' });
  const [a] = planPosts({ upcoming: [], past: [], posts: [postFor(gone)], now });
  assert.equal(a.type, 'cancel');
  assert.equal(a.name, 'Cancelled · Thu Nov 19 · Python Night');
  assert.match(a.content, /^\*\*No longer listed\.\*\*/);
  assert.deepEqual(planPosts({ upcoming: [], past: [], posts: [{ ...postFor(gone), name: a.name, content: a.content }], now }), []);
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
    if (method !== 'GET') { writes.push([method, path, body]); return {}; }
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
    firsts: { a: render(changed) },
  });
  const actions = await syncEvents({ api, guildId: 'g', data: data([ev(), { ...changed, title: 'New title' }, ev({ id: 'rep', repeat: true })]), now });
  assert.deepEqual(actions.map((a) => [a.type, a.event]), [['create', 'pyowa-1'], ['edit', 'aws-3']]);
  assert.deepEqual(writes.map(([m, p]) => `${m} ${p}`), ['POST /channels/f/threads', 'PATCH /channels/a', 'PATCH /channels/a/messages/a']);
  assert.equal(writes[0][2].auto_archive_duration, 10080);
});

test('closing and cancelling write the right changes; a dry run writes nothing', async () => {
  const done = ev({ id: 'done', start: '2026-11-01T00:00:00.000Z', end: '2026-11-01T02:00:00.000Z' });
  const gone = ev({ id: 'gone' });
  const setup = () => fakeDiscord({
    threads: [{ id: 'p', parent_id: 'f', owner_id: 'bot', name: render(done).name, thread_metadata: {} }],
    archived: [{ id: 'q', parent_id: 'f', owner_id: 'bot', name: render(gone).name, thread_metadata: { archived: true } }],
    firsts: { p: render(done), q: render(gone) },
  });
  const dry = setup();
  assert.deepEqual((await syncEvents({ api: dry.api, guildId: 'g', data: data([], [done]), now, dryRun: true })).map((a) => a.type), ['close', 'cancel']);
  assert.deepEqual(dry.writes, []);
  const real = setup();
  await syncEvents({ api: real.api, guildId: 'g', data: data([], [done]), now });
  assert.deepEqual(real.writes.map(([m, p, b]) => [m, p, b.locked ?? null]), [
    ['PATCH', '/channels/p', true],
    ['PATCH', '/channels/q', null], ['PATCH', '/channels/q/messages/q', null], ['PATCH', '/channels/q', true],
  ]);
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

test('a post from the old format (no card, Discord\'s own link preview) is edited; Discord\'s extra card fields don\'t count as a change', () => {
  const want = render(ev());
  const oldStyle = { id: 't', name: want.name, content: `${want.content}\n\n-# ref pyowa-1 2026-11-19 pyowa`, embeds: [{ type: 'link', url: 'https://www.meetup.com/pyowa/events/1/' }], archived: false };
  assert.deepEqual(planPosts({ upcoming: [ev()], past: [], posts: [oldStyle], now }).map((a) => a.type), ['edit']);
  const withPhoto = render(ev({ photo: { large: 'x' } }));
  const asStored = { id: 't', name: withPhoto.name, content: withPhoto.content, embeds: [{ ...withPhoto.embeds[0], type: 'rich', image: { url: 'x', proxy_url: 'p', width: 1, height: 1 } }],
    components: withPhoto.components.map((r) => ({ ...r, id: 1, components: r.components.map((b, i) => ({ ...b, id: i + 2 })) })), archived: false };
  assert.deepEqual(planPosts({ upcoming: [ev({ photo: { large: 'x' } })], past: [], posts: [asStored], now }), []);
});

test('a post from before the card, with its ref as the message\'s last line, is recognized and moved to the new format', () => {
  const want = render(ev());
  const legacy = { id: 'old', name: 'Nov 19 · Python Night', content: '**Pyowa**\nThu Nov 19 · 6p–8p\n-# ref pyowa-1 2026-11-19 pyowa', embeds: [], archived: false };
  const actions = planPosts({ upcoming: [ev()], past: [], posts: [legacy], now });
  assert.deepEqual(actions.map((a) => [a.type, a.post]), [['edit', 'old']]);
  assert.equal(actions[0].embeds[0].footer.text, 'ref pyowa-1 2026-11-19 pyowa');
  assert.doesNotMatch(want.content, /ref /);
});

test('a scraped URL only ever becomes a button\'s link, an event without a link gets no Details button, and an id with spaces still round-trips', () => {
  const sneaky = 'https://their.site/x)[meetup.com/rsvp](https://evil.example/login';
  const { embeds, components } = render(ev({ url: sneaky, description: '' }));
  assert.deepEqual(components[0].components[0], { type: 2, style: 5, label: 'Details on their.site', url: sneaky });
  assert.equal(embeds[0].description, undefined);
  const noLink = render(ev({ url: undefined }));
  assert.deepEqual(noLink.components[0].components.map((b) => b.label), ['Directions']);
  assert.deepEqual(render(ev({ url: undefined, venue: 'Online', online: true })).components, [], 'no link and online: no buttons at all');
  const odd = render(ev({ id: 'ical-abc 123@cal' }));
  assert.equal(refOf(odd.embeds[0].footer.text).id, 'ical-abc_123@cal');
});

test('an event whose id has spaces matches its own post instead of making a new one', () => {
  const odd = ev({ id: 'ical-abc 123@cal' });
  assert.deepEqual(planPosts({ upcoming: [odd], past: [], posts: [postFor(odd)], now }), []);
});

test('a Meetup photo is sent as .jpeg, so Discord doesn\'t label it GIF; other photos are sent as they are', () => {
  assert.equal(render(ev({ photo: { large: 'https://secure.meetupstatic.com/photos/event/b/f/600_1.webp' } })).embeds[0].image.url, 'https://secure.meetupstatic.com/photos/event/b/f/600_1.jpeg');
  assert.equal(render(ev({ photo: { large: 'https://images.lumacdn.com/x.webp' } })).embeds[0].image.url, 'https://images.lumacdn.com/x.webp');
});

test('a post from before the buttons (links in the card) is edited to add them', () => {
  const want = render(ev());
  const before = { id: 'p', name: want.name, content: want.content, embeds: want.embeds, components: [], archived: false };
  assert.deepEqual(planPosts({ upcoming: [ev()], past: [], posts: [before], now }).map((a) => [a.type, a.components.length]), [['edit', 1]]);
});
