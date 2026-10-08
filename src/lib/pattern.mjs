// A group's usual meeting night, worked out from its event dates: "4th Tue ·
// 5:30p", or "Tuesdays" when the week of the month varies. Null unless most
// dates agree, so a group that moves around doesn't get a made-up pattern.
import { weekday, day, shortTime } from './format.mjs';

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th'];
const longDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long' });

function most(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
}

export function usualNight(starts, { min = 4, share = 0.6 } = {}) {
  const dates = [...new Set(starts)];
  if (dates.length < min) return null;
  const info = dates.map((s) => ({ s, dow: weekday(s), nth: Math.ceil(Number(day(s)) / 7) }));
  const fits = (n) => n >= 3 && n / dates.length >= share;

  const [slot, slotCount] = most(info.map((x) => `${x.nth}|${x.dow}`));
  let matching, label;
  if (fits(slotCount)) {
    const [nth, dow] = slot.split('|');
    matching = info.filter((x) => `${x.nth}|${x.dow}` === slot);
    label = `${ORD[nth]} ${dow}`;
  } else {
    const [dow, dowCount] = most(info.map((x) => x.dow));
    if (!fits(dowCount)) return null;
    matching = info.filter((x) => x.dow === dow);
    label = `${longDay.format(new Date(matching[0].s))}s`;
  }
  // Add the start time only when most of those nights share one.
  const [time, timeCount] = most(matching.map((x) => shortTime(x.s)));
  return timeCount / matching.length >= 0.6 ? `${label} · ${time}` : label;
}
