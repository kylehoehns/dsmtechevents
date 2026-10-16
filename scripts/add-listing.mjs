// Adds a listing from one link, the way a person would by hand: the entry in
// data/groups.yaml or data/events.yaml, plus its cache file from the fetch,
// so it shows up as soon as the PR merges. Two kinds of link are automatic:
//   - a Luma event   → a `luma:` entry in events.yaml (data/cache/luma.json)
//   - a Meetup group → an entry in groups.yaml (data/cache/<id>.json)
// Anything else, or a link that doesn't fit (already listed, over, outside
// Iowa, a private group), is left for a person, with the reason.
//
//   node scripts/add-listing.mjs <link> [--short "DSM AI"] [--issue 12] [--out listing.json]
//   node scripts/add-listing.mjs --from-event "$GITHUB_EVENT_PATH" --out listing.json
//
// --from-event reads the link, short name and issue number from the issue
// that triggered the workflow (the "Add from a link" form).
// --out writes what happened as JSON (the PR title and body, the branch and
// preview link, or the reason it stopped) for .github/workflows/add-listing.yml.
// Exits 0 when the listing was added, 2 when it's left for a person, 1 on an
// unexpected error. A link from an issue is untrusted: it's only ever matched
// against the two patterns below, never passed to a shell.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { lumaSlug, shortAddress } from '../src/lib/data.mjs';
import { meetupSlug, meetupUrl } from '../src/lib/meetup.mjs';
import { fmt, dayKey } from '../src/lib/format.mjs';
import readLuma from './sources/luma.mjs';
import { parseEventsPage } from './sources/meetup.mjs';
import { refresh, get } from './refresh.mjs';

const root = path.resolve(import.meta.dirname, '..');

// A request this script won't do on its own; `message` says why, for the issue.
export class LeaveIt extends Error {}

// Text from a stranger's page (a title, name or address), made inert before
// it goes in an issue comment, the PR or the commit message: no backticks or
// line breaks to break out of the formatting around it, and an invisible space
// after each @ and #, so "@someone" pings nobody and "Fixes #3" closes nothing.
export const tame = (s) => String(s).replace(/[`\r\n]+/g, ' ').replace(/[@#]/g, '$&\u200b');

// Which kind of link this is. Only exact Luma event and Meetup group links
// (or one of the group's event links) get through.
export function classify(link) {
  const url = String(link ?? '').trim();
  if (/^https:\/\/(?:www\.)?(?:luma\.com|lu\.ma)\/[\w-]+\/?$/i.test(url)) return { kind: 'luma', slug: lumaSlug(url) };
  const m = /^https:\/\/(?:www\.)?meetup\.com\/([\w-]+)(?:\/[\w/-]*)?\/?(?:\?.*)?$/i.exec(url);
  if (m && !['find', 'topics', 'cities', 'events', 'lp', 'apps'].includes(m[1].toLowerCase())) return { kind: 'meetup', slug: m[1] };
  throw new LeaveIt('Only Luma event links and Meetup group links are added automatically so far.');
}

// The entry already in the data that this link would duplicate, if any.
export function alreadyListed({ kind, slug }, groups, events) {
  const same = (a, b) => a?.toLowerCase() === b.toLowerCase(); // Meetup urlnames differ in case
  if (kind === 'meetup') return groups.find((g) => same(meetupSlug(g.meetup), slug))?.name ?? null;
  const hit = events.find((e) => (e.luma && same(lumaSlug(e.luma), slug)) || (e.url && new RegExp(`/${slug}/?$`, 'i').test(e.url)));
  return hit ? (hit.title ?? hit.luma) : null;
}

// Reasons a Luma event can't go in, and things the reviewer should check.
export function checkLumaEvent(e, now) {
  if (Date.parse(e.end) < now) throw new LeaveIt(`"${tame(e.title)}" is already over.`);
  if (!e.online && !/\b(IA|Iowa)\b/.test(e.address ?? '')) throw new LeaveIt(`"${tame(e.title)}" isn't in Iowa (Luma says ${tame(e.address ?? 'no address')}).`);
  return e.online ? ['It is online: check it is run by a local group.'] : [];
}

export function checkMeetupGroup(g, slug) {
  if (!g.name) throw new LeaveIt(`Couldn't read the group's name from meetup.com/${slug}.`);
  if (g.isPrivate) throw new LeaveIt(`${tame(g.name)} is a private Meetup group.`);
  if (g.state !== 'IA') throw new LeaveIt(`${tame(g.name)} isn't in Iowa (Meetup says ${tame([g.city, g.state].filter(Boolean).join(', ') || 'nowhere')}).`);
  return [];
}

// A first guess at the name on calendar pills: the group's name without the
// place and "User Group" ("Iowa Python User Group" → "Python"). The reviewer
// checks it; --short sets it.
export function defaultShort(name) {
  const s = name
    .replace(/^(?:the\s+)?(?:greater\s+)?(?:central\s+iowa|des\s+moines|dsm|iowa)\s+/i, '')
    .replace(/\s+(?:users?\s+group|meetup|group|community)$/i, '')
    .trim();
  return s || name;
}

export function uniqueId(short, groups) {
  const base = short.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
  const taken = new Set(groups.map((g) => g.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

// groups.yaml with a new entry after the last Meetup group, where the others
// are. Text, not a YAML round trip, so the file's comments stay.
export function insertGroup(text, entry) {
  const blocks = text.split(/\n(?=- id: )/);
  const at = blocks.findLastIndex((b) => /^ {2}meetup: /m.test(b));
  blocks.splice(at < 0 ? blocks.length : at + 1, 0, entry.trimEnd() + '\n');
  return blocks.join('\n');
}

export const appendEvent = (text, entry) => `${text.trimEnd()}\n\n${entry.trimEnd()}\n`;

const when = (e) => `${fmt({ weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(e.start))}`
  + ` to ${fmt({ hour: 'numeric', minute: '2-digit' }).format(new Date(e.end))}`;

// Cloudflare's preview for a branch: <branch>-dsmtechevents.kyhoehns.workers.dev.
export const previewUrl = (branch, page = '/') => `https://${branch}-dsmtechevents.kyhoehns.workers.dev${page}`;

// The PR, in the owner's template (Summary, Evidence, Undo and Impact).
// `title`, `entry` and `facts` carry the page's own words, so they're tamed
// here (warnings are tamed where they're written); the closing "Closes #12"
// is ours and isn't.
export function pullRequest({ title: raw, entry, facts, warnings, preview, id, issue }) {
  const title = tame(raw);
  const body = [
    '## Summary',
    '',
    `Adds **${title}**${issue ? `, as asked in #${issue}` : ''}. \`scripts/add-listing.mjs\` wrote this entry from the link:`,
    '',
    '```yaml',
    ...entry.trimEnd().split('\n').map(tame),
    '```',
    '',
    ...facts.map((f) => `- ${tame(f)}`),
    ...(warnings.length ? ['', '**Check before merging:**', '', ...warnings.map((w) => `- ${w}`)] : []),
    '',
    '## Evidence',
    '',
    `- Preview: ${preview}`,
    `- \`npm run fetch -- --only ${id}\` read it and wrote its cache file, so it shows up as soon as this merges.`,
    '- The checks below build the site with it.',
    '',
    '## Undo and Impact',
    '',
    '**Door:** two-way',
    '',
    'Close this PR to skip it, or revert it after merging.',
    '',
    '**Blast Radius:** tiny',
    '',
    'One new listing. No code changed.',
    ...(issue ? ['', `Closes #${issue}`] : []),
  ].join('\n');
  return { title: `Add ${title}`, body };
}

// An issue form's answers by heading: GitHub writes each as "### Label",
// a blank line, then the answer, or "_No response_" when left empty.
export function issueAnswers(body = '') {
  const answers = {};
  for (const [, label, value] of String(body).matchAll(/^### (.+)\r?\n([\s\S]*?)(?=^### |(?![\s\S]))/gm)) {
    const v = value.trim();
    answers[label.trim()] = v === '_No response_' ? '' : v;
  }
  return answers;
}

export async function addListing(link, { short, issue, now = Date.now() } = {}) {
  const target = classify(link);
  const file = (f) => path.join(root, 'data', f);
  const groupsText = fs.readFileSync(file('groups.yaml'), 'utf8');
  const eventsText = fs.readFileSync(file('events.yaml'), 'utf8');
  const groups = YAML.parse(groupsText);
  const listed = alreadyListed(target, groups, YAML.parse(eventsText) ?? []);
  if (listed) throw new LeaveIt(`Already listed as ${listed}.`);

  let id, title, entry, facts, warnings, page, write;
  if (target.kind === 'luma') {
    const e = await readLuma(link, { get });
    warnings = checkLumaEvent(e, now);
    id = `luma-${target.slug}`;
    title = e.title;
    entry = YAML.stringify([{ luma: `https://luma.com/${target.slug}` }]);
    facts = [
      `When: ${when(e)}`,
      `Where: ${e.online ? 'Online' : [e.venue, shortAddress(e.address)].filter(Boolean).join(', ') || 'not given'}`,
      ...(e.going != null ? [`Going so far: ${e.going}`] : []),
    ];
    if (/\s[|·–—-]\s/.test(e.title)) warnings.push(`Luma's title is "${tame(e.title)}". If part of it repeats the date or place, add a shorter \`title:\` to the entry.`);
    page = `/?view=calendar&day=${dayKey(e.start)}`;
    write = () => fs.writeFileSync(file('events.yaml'), appendEvent(eventsText, entry));
  } else {
    const g = parseEventsPage(await get(meetupUrl(target.slug, 'events/')), target.slug);
    warnings = checkMeetupGroup(g, target.slug);
    const pill = short?.trim() || defaultShort(g.name);
    id = uniqueId(pill, groups);
    title = g.name;
    entry = YAML.stringify([{ id, name: g.name, short: pill, meetup: meetupUrl(target.slug) }]);
    facts = [`Where: ${g.city}, ${g.state}`, ...(g.members != null ? [`Members: ${g.members}`] : [])];
    if (!short?.trim()) warnings.push(`The short name on calendar pills is a guess: "${tame(pill)}". Change \`short:\` if the group goes by something else.`);
    page = `/?group=${id}`;
    write = () => fs.writeFileSync(file('groups.yaml'), insertGroup(groupsText, entry));
  }

  write();
  try {
    // Fills in the new listing's cache the way the refresh will.
    const { problems } = await refresh({ root, only: id });
    if (problems.length) throw new Error(problems[0].message);
  } catch (err) {
    // Put the data back so a failed run leaves nothing half done.
    fs.writeFileSync(file('groups.yaml'), groupsText);
    fs.writeFileSync(file('events.yaml'), eventsText);
    throw new Error(`the fetch couldn't read ${id}`, { cause: err });
  }
  // A prefix no person uses for a branch, since the workflow force-pushes it.
  const branch = `bot-add-${id}`;
  const preview = previewUrl(branch, page);
  return { ok: true, id, kind: target.kind, branch, preview, ...pullRequest({ title, entry, facts, warnings, preview, id, issue }) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const out = flag('--out');
  let link = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
  let short = flag('--short');
  let issue = flag('--issue');
  if (flag('--from-event')) {
    const event = JSON.parse(fs.readFileSync(flag('--from-event'), 'utf8'));
    const answers = issueAnswers(event.issue?.body);
    [link, short, issue] = [answers.Link, answers['Short name'], event.issue?.number];
  }
  let result, code;
  try {
    result = await addListing(link, { short, issue });
    code = 0;
    console.log(`\n${result.title}\nbranch: ${result.branch}\npreview: ${result.preview}`);
  } catch (err) {
    const leave = err instanceof LeaveIt;
    result = { ok: false, reason: leave ? err.message : `Something went wrong: ${err.message}` };
    code = leave ? 2 : 1;
    console.error(result.reason);
  }
  if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  process.exit(code);
}
