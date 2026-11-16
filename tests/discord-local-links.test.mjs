import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMessage, render } from '../scripts/discord-local-links.mjs';

const links = {
  title: 'Where else',
  intro: 'This server is the shared place.',
  sections: [{ heading: 'Discord servers', button: 'Join', links: [
    { name: 'Iowa .NET User Group', about: 'The .NET meetup.', url: 'https://discord.com/invite/abc' },
    { name: 'SecDSM', about: 'Security.', url: 'https://discord.com/invite/def' },
  ] }],
  footer: 'Say so in <#1>.',
};

test('one pink card: title and intro, a heading per section, a Join button beside each link, then the footer', () => {
  const [card] = render(links);
  assert.equal(card.type, 17);
  const parts = card.components.map((c) => c.type === 9 ? `${c.components[0].content} [${c.accessory.label}: ${c.accessory.url}]` : c.type === 14 ? '---' : c.content);
  assert.deepEqual(parts, [
    '## Where else\nThis server is the shared place.',
    '---',
    '### Discord servers',
    '**Iowa .NET User Group**\nThe .NET meetup. [Join: https://discord.com/invite/abc]',
    '**SecDSM**\nSecurity. [Join: https://discord.com/invite/def]',
    '---',
    'Say so in <#1>.',
  ]);
});

test('the first run posts a V2 message that pings no one', () => {
  const plan = planMessage('c1', undefined, render(links));
  assert.equal(plan.method, 'POST');
  assert.equal(plan.path, '/channels/c1/messages');
  assert.equal(plan.body.flags, 1 << 15);
  assert.deepEqual(plan.body.allowed_mentions, { parse: [] });
});

test('nothing is sent when the message matches, ignoring the ids Discord adds; a change edits it in place', () => {
  const live = (components) => JSON.parse(JSON.stringify(components), (_, v) => (v && typeof v === 'object' && !Array.isArray(v) && 'type' in v ? { ...v, id: 7 } : v));
  assert.equal(planMessage('c1', { id: 'm1', components: live(render(links)) }, render(links)), null);
  const changed = { ...links, intro: 'New intro.' };
  const plan = planMessage('c1', { id: 'm1', components: live(render(links)) }, render(changed));
  assert.equal(plan.method, 'PATCH');
  assert.equal(plan.path, '/channels/c1/messages/m1');
  assert.equal(plan.body.components[0].components[0].content, '## Where else\nNew intro.');
});
