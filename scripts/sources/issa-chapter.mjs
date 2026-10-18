// ISSA Des Moines (issadesmoines.org) posts each meeting as a WordPress page
// under /events/, newest post first, with no feed that carries the date. Each
// page in the list's first page is read: an <h2> "September 29, 2026 11:30 am",
// then the place in bold, then the write-up. A post with an empty date is an
// announcement ("Coming Soon – a fall event") and is skipped.
import { localToUtc } from '../../src/lib/time.mjs';
import { toText, richText } from './html.mjs';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const LENGTH = 90 * 60_000; // no end time on the page: about one lunch meeting

export default async function issaChapter(group, { get, now = Date.now(), since = now }) {
  const origin = new URL(group.website).origin;
  const list = await get(`${origin}/events/`);
  const urls = [...new Set([...list.matchAll(/<article[\s\S]*?href="([^"]*\/events\/[a-z0-9-]+\/)"/g)].map((m) => m[1]))];
  if (!urls.length) throw new Error(`no events listed on ${origin}/events/`);

  const events = [];
  for (const url of urls) {
    const page = readEventPage(await get(url), url);
    if (!page || Date.parse(page.start) + LENGTH < since) continue;
    const sourceId = /\/events\/([a-z0-9-]+)\/$/.exec(url)[1];
    const { title, start, description, venue, address } = page;
    const end = new Date(Date.parse(start) + LENGTH).toISOString();
    events.push({ id: `${group.id}-${sourceId}`, sourceId, title, start, end, allDay: false, url, description, venue, address });
  }
  return events;
}

function readEventPage(html, url) {
  // The theme leaves a commented-out copy of the entry-content tag above the real one.
  const article = /<article[\s\S]*?<\/article>/.exec(html)?.[0].replace(/<!--[\s\S]*?-->/g, '');
  const head = article && /<h2>([^<]*)<\/h2>\s*<p><strong>([\s\S]*?)<\/strong><\/p>/.exec(article);
  if (!head) throw new Error(`no date heading on ${url}`);
  const when = toText(head[1]);
  if (!when) return null;
  const m = /^([a-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})\s*([ap])\.?m\.?$/i.exec(when);
  const month = MONTHS.indexOf(m?.[1].toLowerCase());
  if (!m || month < 0) throw new Error(`unreadable date "${when}" on ${url}`);
  const hour = (Number(m[4]) % 12) + (m[6].toLowerCase() === 'p' ? 12 : 0);
  const pad = (n) => String(n).padStart(2, '0');
  const start = localToUtc(`${m[3]}-${pad(month + 1)}-${pad(m[2])}`, `${pad(hour)}:${m[5]}`);

  // "Principal Financial Group, 750 Park Street, Des Moines IA 50309": the
  // name, then the address when one follows. "Apex Systems" is a name alone.
  const place = toText(head[2]);
  const [, name, rest] = /^([^,]+),\s*(\d.*)$/.exec(place) ?? [null, place, null];

  const title = toText(/<h1 class="page-title"[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '');
  if (!title) throw new Error(`no title on ${url}`);
  const presenting = toText(/<h3>Presenting:<\/h3>\s*<h4>([\s\S]*?)<\/h4>/.exec(article)?.[1] ?? '');
  // "Where: At Principal…" repeats the card's venue.
  const body = richText(/<section class="entry-content[^>]*>([\s\S]*?)<\/section>/.exec(article)?.[1] ?? '')
    .split('\n')
    .filter((line) => !/^Where:/i.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const description = [presenting && `**Presenting:** ${presenting}`, body].filter(Boolean).join('\n\n');

  return { title, start, description, venue: name.trim() || null, address: rest?.trim() || null };
}
