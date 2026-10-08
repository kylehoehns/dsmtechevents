// Date and text formatting shared by the build and the browser.
// Everything displays in Des Moines time, wherever the viewer is.
const TZ = 'America/Chicago';
const fmt = (opts) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...opts });

const weekdayShort = fmt({ weekday: 'short' });
const monthShort = fmt({ month: 'short' });
const dayNum = fmt({ day: 'numeric' });
const timeFmt = fmt({ hour: 'numeric', minute: '2-digit' });
const longDate = fmt({ weekday: 'long', month: 'long', day: 'numeric' });
const monthYear = fmt({ month: 'long', year: 'numeric' });
const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });

export const dayKey = (iso) => keyFmt.format(new Date(iso)); // "2026-10-22"
export const weekday = (iso) => weekdayShort.format(new Date(iso));
export const month = (iso) => monthShort.format(new Date(iso));
export const day = (iso) => dayNum.format(new Date(iso));
export const fullDate = (iso) => longDate.format(new Date(iso));
export const monthLabel = (iso) => monthYear.format(new Date(iso));
export const monthKey = (iso) => dayKey(iso).slice(0, 7);

export function time(iso) {
  return timeFmt.format(new Date(iso)).replace(':00', '').replace(' ', ' ');
}

// Flyer-style times: "5:30p", "12p".
export function shortTime(iso) {
  return timeFmt.format(new Date(iso)).replace(':00', '').replace(/\s?AM$/, 'a').replace(/\s?PM$/, 'p');
}

// "5:30p–7p", "Thu–Fri Oct 15–16 · 8a–5p", "All day".
export function shortRange(e) {
  if (e.allDay) return e.multiDay ? `${month(e.start)} ${day(e.start)}–${day(e.end)} · All day` : 'All day';
  const t = `${shortTime(e.start)}–${shortTime(e.end)}`;
  return e.multiDay ? `${weekday(e.start)}–${weekday(e.end)} ${month(e.start)} ${day(e.start)}–${day(e.end)} · ${t}` : t;
}

export function timeRange(e) {
  if (e.allDay) return e.multiDay ? `${month(e.start)} ${day(e.start)}–${day(e.end)} · All day` : 'All day';
  const t = `${time(e.start)} – ${time(e.end)}`;
  return e.multiDay ? `${month(e.start)} ${day(e.start)}–${day(e.end)} · ${t} daily` : t;
}

const escape = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Meetup descriptions are loose Markdown. Handle the common bits safely:
// paragraphs, line breaks, **bold**, [links](url), bare URLs, and "## headings".
export function formatDescription(text = '') {
  return escape(text)
    .replace(/\\([*_#\[\]()-])/g, '$1')
    .split(/\n{2,}/)
    .map((para) => {
      let html = para
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener" target="_blank">$1</a>')
        .replace(/(^|[\s(])(https?:\/\/[^\s<)]+?)(?=[.,;:!?]*(?:[\s<)]|$))/g, '$1<a href="$2" rel="noopener" target="_blank">$2</a>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      const heading = /^#{1,6}\s+(.*)(?:\n([\s\S]*))?$/.exec(html);
      if (heading) return `<h4>${heading[1]}</h4>` + (heading[2] ? `<p>${heading[2].replace(/\n/g, '<br>')}</p>` : '');
      return `<p>${html.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
}
