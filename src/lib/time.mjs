import { site } from './site.mjs';

// "2026-10-15" + "08:00" in Des Moines time → UTC ISO string.
export function localToUtc(date, time = '00:00') {
  const guess = new Date(`${date}T${time}:00Z`);
  return new Date(guess.getTime() - tzOffsetMinutes(guess) * 60_000).toISOString();
}

function tzOffsetMinutes(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: site.timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(date).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return (asUtc - date.getTime()) / 60_000;
}
