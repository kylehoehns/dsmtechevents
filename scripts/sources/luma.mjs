// One-off events on Luma, listed in data/events.yaml as `luma: <event link>`.
// Reads the JSON behind the event page (api.lu.ma/url, what luma.com itself
// loads; Luma's documented API needs a paid key per calendar) into the shape
// the cache stores. fetch-events.mjs keeps the results in data/cache/luma.json.
import { lumaSlug } from '../../src/lib/data.mjs';
import { httpUrl } from './html.mjs';

export default async function readLuma(link, { get }) {
  const slug = lumaSlug(link);
  let res;
  try {
    res = JSON.parse(await get(`https://api.lu.ma/url?url=${slug}`));
  } catch (err) {
    throw new Error(err instanceof SyntaxError ? 'Luma did not return JSON' : err.message, { cause: err });
  }
  const data = res?.data;
  const ev = data?.event;
  if (res?.kind !== 'event' || !ev?.name || !ev.start_at || !ev.end_at) throw new Error(`unexpected response from Luma for ${slug}`);

  const place = ev.geo_address_info ?? {};
  const address = place.full_address?.replace(/,\s*(USA|United States)$/, '') ?? place.city_state ?? null;
  // Luma's place name is the street address itself when there's no venue name.
  const venue = place.description && !address?.startsWith(place.description) ? place.description : null;
  return {
    title: ev.name.trim(),
    start: new Date(ev.start_at).toISOString(),
    end: new Date(ev.end_at).toISOString(),
    allDay: false,
    url: `https://luma.com/${slug}`,
    ...(ev.location_type === 'online' ? { online: true } : { venue, address }),
    image: httpUrl(ev.cover_url),
    ...(!ev.hide_rsvp && Number.isInteger(data.guest_count) && { going: data.guest_count }),
    description: mirrorText(data.description_mirror),
  };
}

// Luma's description (a ProseMirror document) as the text the cards format:
// blank lines between blocks, **bold**, [links](url) and ## headings.
export function mirrorText(doc) {
  return (doc?.content ?? []).map(block).map((s) => s.trim()).filter(Boolean).join('\n\n');
}

function block(node) {
  const kids = node.content ?? [];
  if (node.type === 'paragraph') return inline(kids);
  if (node.type === 'heading') return `## ${inline(kids)}`;
  if (node.type === 'bullet_list' || node.type === 'ordered_list') {
    return kids.map((li, i) => `${node.type === 'bullet_list' ? '-' : `${i + 1}.`} ${(li.content ?? []).map(block).join(' ')}`).join('\n');
  }
  if (node.type === 'text' || node.type === 'hard_break') return inline([node]);
  // A blockquote, or anything Luma adds later: its blocks, one after another.
  return kids.map(block).filter(Boolean).join('\n\n');
}

function inline(nodes) {
  return nodes.map((n) => {
    if (n.type === 'hard_break') return '\n';
    if (n.type !== 'text') return inline(n.content ?? []);
    const marks = n.marks ?? [];
    let text = n.text ?? '';
    const href = httpUrl(marks.find((m) => m.type === 'link')?.attrs?.href);
    if (href && text.trim() !== href) text = `[${text}](${href})`; // a bare URL links itself
    if (marks.some((m) => m.type === 'bold') && text.trim()) text = text.replace(/^(\s*)(.*?)(\s*)$/s, '$1**$2**$3');
    return text;
  }).join('');
}
