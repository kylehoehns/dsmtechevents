// Tiny helpers for reading event details out of a group's own web page.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', middot: '·', rarr: '→' };

export function decode(s = '') {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Inner text of the first element with this class, inside `html`.
export function textOf(html, className) {
  const m = new RegExp(`class="${className}"[^>]*>([\\s\\S]*?)</`).exec(html);
  return m ? toText(m[1]) : null;
}

export function toText(html = '') {
  return decode(html.replace(/<br\s*\/?>\n?/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n').trim();
}

// A link from a feed or page is kept only if it is a web address: a
// `javascript:` or `data:` URL in someone's feed must never become a link on
// our site. Everything fetched passes through safeLinks before it is cached.
export const httpUrl = (url) => (typeof url === 'string' && /^https?:\/\//i.test(url.trim()) ? url.trim() : null);

export function safeLinks(events, group) {
  return events.map((e) => {
    const out = { ...e, url: httpUrl(e.url) ?? httpUrl(group.website) };
    if ('image' in e) out.image = httpUrl(e.image);
    return out;
  });
}
