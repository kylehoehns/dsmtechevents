import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageSize, fetchImageSize, sizeImages } from '../scripts/image-size.mjs';

// Just enough of each format's header to carry its size.
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w, h) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...u32(w), ...u32(h), 8, 6, 0, 0, 0]);
const gif = (w, h) => Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, w & 255, w >> 8, h & 255, h >> 8]);
// SOI, an APP0 segment to skip, then SOF0 with height before width.
const jpeg = (w, h) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0]);
const riff = (chunk, body) => Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP'), ...Buffer.from(chunk), 0, 0, 0, 0, ...body]);
const webpX = (w, h) => riff('VP8X', [0, 0, 0, 0, (w - 1) & 255, ((w - 1) >> 8) & 255, (w - 1) >> 16, (h - 1) & 255, ((h - 1) >> 8) & 255, (h - 1) >> 16]);
const webpLossy = (w, h) => riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, w & 255, w >> 8, h & 255, h >> 8]);
const avif = (w, h) => Uint8Array.from([0, 0, 0, 20, ...Buffer.from('ftypavif'), 0, 0, 0, 0, ...Buffer.from('avif'), 0, 0, 0, 20, ...Buffer.from('ispe'), 0, 0, 0, 0, ...u32(w), ...u32(h)]);

test('imageSize reads the width and height from PNG, GIF, JPEG, WebP and AVIF headers', () => {
  assert.deepEqual(imageSize(png(1200, 630)), { width: 1200, height: 630 });
  assert.deepEqual(imageSize(gif(320, 200)), { width: 320, height: 200 });
  assert.deepEqual(imageSize(jpeg(450, 200)), { width: 450, height: 200 });
  assert.deepEqual(imageSize(webpX(1920, 1080)), { width: 1920, height: 1080 });
  assert.deepEqual(imageSize(webpLossy(600, 338)), { width: 600, height: 338 });
  assert.deepEqual(imageSize(avif(800, 450)), { width: 800, height: 450 });
});

test('imageSize gives null for anything else, or a header cut short', () => {
  assert.equal(imageSize(Buffer.from('<html>not an image</html>')), null);
  assert.equal(imageSize(png(10, 10).slice(0, 18)), null);
  assert.equal(imageSize(jpeg(10, 10).slice(0, 12)), null);
  assert.equal(imageSize(new Uint8Array()), null);
});

test('fetchImageSize reads only the start of the image, and gives null on a failure', async () => {
  let asked;
  const reply = (body, status = 200) => async (url, opts) => { asked = opts; return new Response(body, { status }); };
  assert.deepEqual(await fetchImageSize('https://x.test/a.png', { fetch: reply(png(40, 20)) }), { width: 40, height: 20 });
  assert.match(asked.headers.range, /^bytes=0-\d+$/);
  assert.equal(await fetchImageSize('https://x.test/a.png', { fetch: reply('', 404) }), null);
  assert.equal(await fetchImageSize('https://x.test/a.png', { fetch: async () => { throw new TypeError('fetch failed'); } }), null);
});

// The size is fetched once per image: kept while the image stays the same,
// so cache files don't change from run to run, and left out when unknown.
test('sizeImages keeps a known size, fetches a new image once, and skips Meetup photos', async () => {
  const asked = [];
  const sizeOf = async (url) => { asked.push(url); return url.includes('broken') ? null : { width: 450, height: 200 }; };
  const previous = [{ id: 'a', image: 'https://site.test/a.png', imageSize: { width: 9, height: 9 } }, { id: 'b', image: 'https://site.test/old.png', imageSize: { width: 9, height: 9 } }];
  const events = await sizeImages([
    { id: 'a', image: 'https://site.test/a.png' },
    { id: 'b', image: 'https://site.test/new.png' },
    { id: 'c', image: 'https://site.test/broken.png' },
    { id: 'd', image: 'https://secure.meetupstatic.com/photos/event/1/2/3/highres_4.jpeg' },
    { id: 'e' },
  ], previous, { sizeOf });
  assert.deepEqual(events.map((e) => e.imageSize), [{ width: 9, height: 9 }, { width: 450, height: 200 }, undefined, undefined, undefined]);
  assert.ok(!('imageSize' in events[2]), 'unknown is left out, not null');
  assert.deepEqual(asked, ['https://site.test/new.png', 'https://site.test/broken.png'], 'a known size and a Meetup photo are never fetched');
});
