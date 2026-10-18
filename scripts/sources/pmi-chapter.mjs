// PMI chapter sites (e.g. pmi-centraliowa.org) load their calendar from a JSON
// endpoint: [{ id, name, timeStartRaw: "2026-10-27 17:00:00.0", timeEndRaw }].
// Times are local. The endpoint has no venue or description, so each event's
// own page (/calendar?eventId=…) is read for its write-up and Location box.
import { localToUtc } from '../../src/lib/time.mjs';
import { toText, richText } from './html.mjs';

export default async function pmiChapter(group, { get }) {
  const origin = new URL(group.website).origin;
  const list = JSON.parse(await get(`${origin}/action/pmiAjaxGetEvent?future=true`));
  if (!Array.isArray(list)) throw new Error('unexpected response from PMI events endpoint');

  const toUtc = (raw) => {
    const [date, time] = raw.split(' ');
    return localToUtc(date, time.slice(0, 5));
  };
  const events = [];
  for (const e of list) {
    const url = `${origin}/calendar?eventId=${e.id}`;
    const page = readEventPage(await get(url), url);
    events.push({
      id: `${group.id}-${e.id}`,
      sourceId: String(e.id),
      title: e.name.trim(),
      start: toUtc(e.timeStartRaw),
      end: toUtc(e.timeEndRaw ?? e.timeStartRaw),
      allDay: false,
      url,
      ...page,
    });
  }
  return events;
}

// The write-up and the Location box of an event page. The box is always
// there but can be empty (header only), so a missing venue is allowed; a
// missing box or write-up means the page changed.
function readEventPage(html, url) {
  const body = /<div class="editable-text-inner">([\s\S]*?)<div class="formatted-text-ctn">/.exec(html)?.[1];
  if (body == null) throw new Error(`no event text on ${url}`);
  const box = /data-label="location"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1];
  if (box == null) throw new Error(`no Location box on ${url}`);

  // "📅 Date: Tuesday, October 27, 2026" repeats the card's own date.
  const description = richText(body)
    .split('\n')
    .filter((line) => !/^\W*Date:/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  const venue = toText(/<p class="h5 ">([\s\S]*?)<\/p>/.exec(box)?.[1] ?? '') || null;
  // "2816 Beaver Avenue<br>Des Moines, Iowa, 50310" → "2816 Beaver Avenue, Des Moines, IA 50310"
  const street = toText(/<p class="event-popup-info-header ">([\s\S]*?)<\/p>/.exec(box)?.[1] ?? '');
  const address =
    street
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ')
      .replace(/,?\s*Iowa,?\s*/i, ', IA ')
      .trim() || null;
  return { description, venue, address };
}
