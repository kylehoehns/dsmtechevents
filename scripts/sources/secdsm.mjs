// SecDSM (secdsm.org) isn't on Meetup. Its homepage lists the next few
// meetings, each a `secdsm-job` block with a date and its talks. The venue
// address and door time are printed in the page's "dig venue.secdsm.org" box.
import { localToUtc } from '../../src/lib/time.mjs';
import { decode, textOf, toText } from './html.mjs';

const twelveHour = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};

export default async function secdsm(group, { get }) {
  const base = group.website ?? 'https://secdsm.org/';
  const html = await get(base);

  const doors = /doors=(\d{2}:\d{2})/.exec(html)?.[1] ?? '18:00';
  const address = decode(/addr=([^"&]+)/.exec(decode(html))?.[1] ?? '').trim() || null;
  // Their venue is written "T12 Distillery @ The Foundry"; our cards already put
  // "@" before the venue, so say "at" inside the name.
  const venue = toText(/<strong[^>]*>([^<]+)<\/strong>\s*hosts us/.exec(html)?.[1] ?? '').replace(/\s+@\s+/g, ' at ') || null;

  const meetings = html.split(/class="secdsm-job(?: [^"]*)?"/).slice(1);
  if (!meetings.length) throw new Error('no schedule blocks found on secdsm.org');

  return meetings.flatMap((block) => {
    const date = /class="secdsm-job-date"[^>]*>(\d{4}-\d{2}-\d{2})</.exec(block)?.[1];
    if (!date) return [];
    const talks = block.split(/class="secdsm-act secdsm-act-[^"]*"/).slice(1).map((act) => ({
      time: textOf(act, 'secdsm-act-time'),
      speaker: textOf(act, 'secdsm-act-speaker'),
      title: textOf(act, 'secdsm-act-title'),
      desc: textOf(act, 'secdsm-act-desc'),
    })).filter((t) => t.title && !/^(tba|tbd)$|schedule pending/i.test(t.title));

    const title = talks.length === 0 ? 'Monthly Security Meetup'
      : talks.length === 1 ? talks[0].title
      : `${talks[0].title} + ${talks.length - 1} more`;
    const description = [
      `Doors open at ${twelveHour(doors)}.`,
      ...talks.map((t) => `**${t.time} · ${t.title}**${t.speaker ? ` — ${t.speaker}` : ''}${t.desc ? `\n${t.desc}` : ''}`),
      talks.length ? '' : 'Talk schedule pending. Check the SecDSM Discord for updates.',
    ].filter(Boolean).join('\n\n');

    return [{
      id: `${group.id}-${date}`,
      sourceId: date,
      title,
      start: localToUtc(date, doors),
      end: new Date(Date.parse(localToUtc(date, doors)) + 150 * 60_000).toISOString(), // they run about 2½ hours
      allDay: false,
      url: new URL('/#schedule', base).href,
      description,
      venue,
      address,
    }];
  });
}
