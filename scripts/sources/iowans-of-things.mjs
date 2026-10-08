// Iowans of Things (iowansofthings.com) isn't on Meetup. Its homepage has an
// "Upcoming Events" section with one `archive-item` per event, each with
// "Date:", "Time:" and "Place:" lines followed by a short write-up.
import { localToUtc } from '../../src/lib/time.mjs';
import { decode, toText } from './html.mjs';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// "October 8th, 2026" → "2026-10-08"
function isoDate(text) {
  const m = /([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i.exec(text);
  const month = m && MONTHS.indexOf(m[1].toLowerCase()) + 1;
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

// "7:00 PM" → "19:00"
function hhmm(text) {
  const m = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m/i.exec(text ?? '');
  if (!m) return null;
  const h = (Number(m[1]) % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
}

const field = (html, name) => {
  const m = new RegExp(`<strong>\\s*${name}:\\s*</strong>([\\s\\S]*?)</p>`, 'i').exec(html);
  return m ? toText(m[1]) : null;
};

export default async function iowansOfThings(group, { get }) {
  const base = group.website ?? 'https://iowansofthings.com/';
  const html = await get(base);

  const start = html.indexOf('id="upcoming-events"');
  const end = html.indexOf('id="past-events"');
  if (start < 0 || end < start) throw new Error('no Upcoming Events section on iowansofthings.com');
  const items = html.slice(start, end).split('class="archive-item"').slice(1);

  return items.flatMap((item) => {
    const link = /<h4>\s*<a href="([^"]+)">([\s\S]*?)<\/a>/.exec(item);
    const date = isoDate(field(item, 'Date') ?? '');
    if (!link || !date) return [];
    const [from, to] = (field(item, 'Time') ?? '').split(/\s*[-–]\s*/);
    const startTime = hhmm(from);
    const endTime = hhmm(to) ?? startTime;

    // "Area515, Des Moines Maker Space - 108 Jefferson Avenue, Des Moines, IA 50314"
    const place = field(item, 'Place') ?? '';
    const [venue, address] = place.split(/\s+[-–]\s+/);

    // The write-up: the plain paragraphs after Place, minus images and the
    // "Registration below." pointer to a form further down their page.
    const paragraphs = [...item.slice(item.indexOf('Place:')).matchAll(/<p>([\s\S]*?)<\/p>/g)]
      .map((m) => m[1])
      .filter((p) => !/<img|registration below/i.test(p))
      .map(toText)
      .filter(Boolean);

    const banner = /<img src="([^"]+)"/.exec(item.slice(0, item.indexOf('Date:')))?.[1];
    const slug = link[1].replace(/^\/|\/$/g, '');
    return [{
      id: `${group.id}-${slug}`,
      sourceId: slug,
      title: decode(toText(link[2])),
      start: localToUtc(date, startTime ?? '00:00'),
      end: localToUtc(date, endTime ?? '23:59'),
      allDay: !startTime,
      url: new URL(link[1], base).href,
      description: paragraphs.join('\n\n').slice(0, 2000),
      venue: venue?.trim() || null,
      address: address?.trim() || null,
      ...(banner && { image: new URL(banner, base).href }),
    }];
  });
}
