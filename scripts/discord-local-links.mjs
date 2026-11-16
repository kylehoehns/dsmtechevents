// Keeps the community Discord's #local-links message: one Components V2 card
// listing where else local tech people talk, built from
// infra/discord/local-links.yaml (through the `local_links` OpenTofu output,
// which fills in channel mentions). The provider can only post plain
// messages, so this posts the card the first time and edits it in place when
// the YAML changes. Nothing is sent when nothing changed.
//
// Run by the discord workflow after each apply, with DISCORD_TOKEN set:
//   tofu output -json local_links > local-links.json
//   node scripts/discord-local-links.mjs --from local-links.json [--dry-run]
import fs from 'node:fs';
import { ACCENT, V2, discordApi, divider, linkButton, shape, text, withButton } from './discord-events.mjs';

// The card, in the same pink as the #events posts: title and intro, then
// each section with a button beside every link, then the footer.
export function render({ title, intro, sections = [], footer }) {
  const card = [
    text(`## ${title}\n${intro}`),
    ...sections.flatMap((s) => [
      divider,
      text(`### ${s.heading}`),
      ...s.links.map((l) => withButton(`**${l.name}**\n${l.about}`, linkButton(s.button, l.url))),
    ]),
    ...(footer ? [divider, text(footer)] : []),
  ];
  return [{ type: 17, accent_color: ACCENT, components: card }];
}

// What to do, given the bot's existing message in the channel (or none):
// null when it already matches, else { method, path, body }.
export function planMessage(channelId, existing, components) {
  if (existing && JSON.stringify(shape(existing.components)) === JSON.stringify(shape(components))) return null;
  const body = { flags: V2, components, allowed_mentions: { parse: [] } };
  return existing
    ? { method: 'PATCH', path: `/channels/${channelId}/messages/${existing.id}`, body: { components, allowed_mentions: body.allowed_mentions } }
    : { method: 'POST', path: `/channels/${channelId}/messages`, body };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes('--dry-run');
  const { DISCORD_TOKEN: token } = process.env;
  const from = process.argv[process.argv.indexOf('--from') + 1];
  if (!token || !process.argv.includes('--from')) throw new Error('Usage: --from <tofu output -json local_links> with DISCORD_TOKEN set.');
  const api = discordApi(token);
  const want = JSON.parse(fs.readFileSync(from, 'utf8'));
  const me = await api('GET', '/users/@me');
  const existing = (await api('GET', `/channels/${want.channel_id}/messages?limit=50`)).find((m) => m.author?.id === me.id);
  const plan = planMessage(want.channel_id, existing, render(want));
  if (!plan) {
    console.log('#local-links is up to date.');
  } else {
    console.log(`${dryRun ? '[dry run] ' : ''}${existing ? 'edit' : 'post'} the #local-links message`);
    if (!dryRun) await api(plan.method, plan.path, plan.body);
  }
}
