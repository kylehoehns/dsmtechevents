// The width and height of event photos that don't come with one, so an
// <img> can hold its space while it loads instead of shoving the card down.
// Meetup photos have a known size (meetupPhoto in src/lib/meetup.mjs); the
// rest (group websites, Eventbrite, Luma) are read here, once per image, from
// the first bytes of the file: every format puts its size in its header.
// The build never touches the network, so the refresh does this and the
// size rides along in the cache as `imageSize`.
import { meetupPhoto } from '../src/lib/meetup.mjs';

const HEAD_BYTES = 128 * 1024; // a JPEG's size can sit after a big EXIF block

const ascii = (b, at, s) => [...s].every((c, i) => b[at + i] === c.charCodeAt(0));
const be16 = (b, at) => (b[at] << 8) | b[at + 1];
const be32 = (b, at) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const le16 = (b, at) => b[at] | (b[at + 1] << 8);
const le24 = (b, at) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
const size = (width, height) => (width > 0 && height > 0 && Number.isFinite(width + height) ? { width, height } : null);

// { width, height } from the start of a PNG, GIF, JPEG, WebP or AVIF, or null.
export function imageSize(b) {
  if (b.length >= 24 && b[0] === 0x89 && ascii(b, 1, 'PNG') && ascii(b, 12, 'IHDR')) return size(be32(b, 16), be32(b, 20));
  if (b.length >= 10 && ascii(b, 0, 'GIF8')) return size(le16(b, 6), le16(b, 8));
  if (b.length >= 30 && ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) {
    if (ascii(b, 12, 'VP8X')) return size(le24(b, 24) + 1, le24(b, 27) + 1);
    if (ascii(b, 12, 'VP8 ')) return size(le16(b, 26) & 0x3fff, le16(b, 28) & 0x3fff);
    if (ascii(b, 12, 'VP8L')) {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return size((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    // Walk the segments to the frame header (SOF0–SOF15, less DHT, JPG and DAC).
    for (let at = 2; at + 9 <= b.length;) {
      if (b[at] !== 0xff) return null;
      const marker = b[at + 1];
      if (marker === 0xff) { at++; continue; }
      if (marker >= 0xd0 && marker <= 0xd9) { at += 2; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return size(be16(b, at + 7), be16(b, at + 5));
      at += 2 + be16(b, at + 2);
    }
    return null;
  }
  if (b.length >= 12 && ascii(b, 4, 'ftyp')) {
    // AVIF/HEIF: the size is in the item's 'ispe' property box.
    for (let at = 8; at + 16 <= b.length; at++) if (ascii(b, at, 'ispe')) return size(be32(b, at + 8), be32(b, at + 12));
    return null;
  }
  return null;
}

// The size of the image at `url`, from its first HEAD_BYTES (a server that
// ignores Range sends the whole file; only that much is read). null when it
// can't be fetched or read: a missing size is never worth an alert.
export async function fetchImageSize(url, { fetch: send = fetch, ua } = {}) {
  try {
    const res = await send(url, { headers: { ...(ua && { 'user-agent': ua }), range: `bytes=0-${HEAD_BYTES - 1}` }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok || !res.body) return null;
    const chunks = [];
    let got = 0;
    for await (const chunk of res.body) {
      chunks.push(chunk);
      got += chunk.length;
      if (got >= HEAD_BYTES) break;
    }
    return imageSize(Buffer.concat(chunks));
  } catch {
    return null;
  }
}

// `events` with `imageSize` filled in where it's missing. The size from
// `previous` (last run's events) stands while the image stays the same, so
// a file doesn't change run to run; a new image is fetched once. Unknown
// sizes are left out, not written as null (the cache stability rule).
// `key` matches an event to its copy last run (a Luma event has no id; the
// caller keys it by slug).
export async function sizeImages(events, previous, { sizeOf, key = (e) => e.id }) {
  const known = new Map(previous.filter((e) => e.imageSize).map((e) => [key(e), e]));
  return Promise.all(events.map(async ({ imageSize: _, ...e }) => {
    if (!e.image || meetupPhoto(e.image)) return e;
    const had = known.get(key(e));
    const found = had?.image === e.image ? had.imageSize : await sizeOf(e.image);
    return found ? { ...e, imageSize: found } : e;
  }));
}
