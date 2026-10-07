// PMI chapter sites (e.g. pmi-centraliowa.org) load their calendar from a JSON
// endpoint: [{ id, name, timeStartRaw: "2026-10-27 17:00:00.0", timeEndRaw }].
// Times are local. The endpoint has no venue or description, so each event
// links to its page on the chapter site.
import { localToUtc } from '../../src/lib/time.mjs';

export default async function pmiChapter(group, { get }) {
  const origin = new URL(group.website).origin;
  const list = JSON.parse(await get(`${origin}/action/pmiAjaxGetEvent?future=true`));
  if (!Array.isArray(list)) throw new Error('unexpected response from PMI events endpoint');

  const toUtc = (raw) => {
    const [date, time] = raw.split(' ');
    return localToUtc(date, time.slice(0, 5));
  };
  return list.map((e) => ({
    id: `${group.id}-${e.id}`,
    sourceId: String(e.id),
    title: e.name.trim(),
    start: toUtc(e.timeStartRaw),
    end: toUtc(e.timeEndRaw ?? e.timeStartRaw),
    allDay: false,
    url: `${origin}/calendar?eventId=${e.id}`,
    description: '',
    venue: null,
  }));
}
