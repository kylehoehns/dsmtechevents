// Sets the community Discord's onboarding from infra/discord's `onboarding`
// output: the default channels every member gets, and one question, "Which
// user groups do you want to follow?", with an answer per group, A to Z.
//
// Each answer keeps the Discord ID it already had, found by its group's member
// role. Members' picks are saved against those IDs, so a group added
// mid-alphabet doesn't move anyone's picks onto a different group (the
// OpenTofu provider keeps IDs by position, which is why it no longer owns
// onboarding). The default channels are compared as a set: Discord hands
// them back in its own order. Nothing is sent when nothing changed.
//
// Run by the discord workflow after each apply, with DISCORD_TOKEN and
// DISCORD_SERVER_ID set:
//   tofu output -json onboarding > onboarding.json
//   node scripts/discord-onboarding.mjs --from onboarding.json [--dry-run]
import fs from 'node:fs';
import { discordApi } from './discord-events.mjs';

export const QUESTION = 'Which user groups do you want to follow?';

const sameSet = (a = [], b = []) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const optionShape = (o) => [o.title, o.description ?? '', [...(o.role_ids ?? [])].sort().join(), [...(o.channel_ids ?? [])].sort().join()];

// The onboarding to send, or null if Discord already has it. `current` is
// Discord's onboarding; `want` is the OpenTofu output. Pure, so it can be
// tested.
export function planOnboarding(current, want) {
  const prompt = current.prompts?.[0];
  const byRole = new Map((prompt?.options ?? []).flatMap((o) => (o.role_ids ?? []).map((r) => [r, o.id])));
  const options = [...want.groups]
    .sort((a, b) => a.short.localeCompare(b.short, 'en', { sensitivity: 'base' }))
    .map((g) => ({
      ...(byRole.has(g.role) ? { id: byRole.get(g.role) } : {}),
      title: g.short, description: g.name, channel_ids: [g.category], role_ids: [g.role],
    }));
  const question = options.length
    // A new question needs a placeholder ID ("0"); Discord assigns the real one.
    ? [{ id: prompt?.id ?? '0', type: 0, title: QUESTION, single_select: false, required: false, in_onboarding: true, options }]
    : [];

  const same = current.enabled === true && current.mode === 0
    && sameSet(current.default_channel_ids, want.default_channel_ids)
    && (current.prompts ?? []).length === question.length
    && (!question.length || (
      prompt.title === QUESTION && prompt.type === 0 && !prompt.single_select && !prompt.required && prompt.in_onboarding
      && JSON.stringify(prompt.options.map(optionShape)) === JSON.stringify(options.map(optionShape))
    ));
  return same ? null : { enabled: true, mode: 0, default_channel_ids: want.default_channel_ids, prompts: question };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes('--dry-run');
  const { DISCORD_TOKEN: token, DISCORD_SERVER_ID: guildId } = process.env;
  const from = process.argv[process.argv.indexOf('--from') + 1];
  if (!token || !guildId || !process.argv.includes('--from')) throw new Error('Usage: --from <tofu output -json onboarding> with DISCORD_TOKEN and DISCORD_SERVER_ID set.');
  const api = discordApi(token);
  const body = planOnboarding(await api('GET', `/guilds/${guildId}/onboarding`), JSON.parse(fs.readFileSync(from, 'utf8')));
  if (!body) {
    console.log('Onboarding is up to date.');
  } else {
    const answers = body.prompts[0]?.options.map((o) => `${o.title}${o.id ? '' : ' (new)'}`).join(', ') ?? 'none';
    console.log(`${dryRun ? '[dry run] ' : ''}set onboarding: ${body.default_channel_ids.length} default channels; answers: ${answers}`);
    if (!dryRun) await api('PUT', `/guilds/${guildId}/onboarding`, body);
  }
}
