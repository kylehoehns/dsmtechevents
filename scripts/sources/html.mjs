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

// A link in a write-up as Markdown, which the cards turn back into a link
// (formatDescription): [Eventbrite](https://…). Only web addresses: a
// mailto: or javascript: link keeps just its text. A link whose text is a web
// address stays that bare address (the cards link those too), even when the
// href is a redirect around it, like LinkedIn's "leaving LinkedIn" page
// wrapping a lnkd.in link the author wrote. One with no text (an image
// button) is dropped, as before. Brackets in the text, and ")" or spaces in
// the address, would end the Markdown early, so they go.
function linkToMarkdown(_, href, inner) {
  const text = toText(inner).replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim();
  const url = httpUrl(decode(href))?.replace(/\)/g, '%29').replace(/\s/g, '%20');
  if (!text || !url || (httpUrl(text) && !/\s/.test(text))) return text;
  return `[${text}](${url})`;
}

// An event write-up from a site's rich-text editor, as the description text
// the cards format: paragraphs split by blank lines, <strong> as **bold**,
// links as [text](url), images dropped (the card has its own photo slot).
export function richText(html = '') {
  return toText(html
    .replace(/<a\b[^>]*?\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, linkToMarkdown)
    .replace(/<img[^>]*>/gi, '')
    .replace(/<br[^>]*>/gi, '<br>') // toText only breaks lines at a bare <br>; editors add styles
    .replace(/<(strong|b)>([^<]*\S[^<]*)<\/\1>/gi, '**$2**')
    .replace(/<hr[^>]*>|<\/(p|div|h\d|li)>/gi, '$&\n\n'))
    .replace(/\n{3,}/g, '\n\n').trim();
}

// Every fetched event needs a real start and an end no earlier than it; a
// reader that gets the times wrong fails (and opens a source-broken issue)
// instead of caching an event that vanishes before it starts.
export function checkTimes(events) {
  for (const e of events) {
    if (Number.isNaN(Date.parse(e.start))) throw new Error(`"${e.title}" has no start time`);
    if (!(Date.parse(e.end) >= Date.parse(e.start))) throw new Error(`"${e.title}" ends before it starts`);
  }
  return events;
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
