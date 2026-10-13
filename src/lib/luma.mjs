// Luma links its cover images at full size (one was a 713 KB PNG for a box
// 600 wide), and its image host sets a Cloudflare bot cookie (__cf_bm) on
// every response, which costs the page its Lighthouse best-practices score.
// So a Luma image is served from our own /img/luma/ path instead: the Worker
// fetches a resized webp from Luma and passes it on without the cookie.
// Anything that isn't a Luma image URL gets null, and callers keep the URL they had.
export const LUMA_HOST = 'https://images.lumacdn.com';
export const LUMA_WIDTHS = ['180', '600'];
// The part after the host, e.g. uploads/6c/<uuid>.png. Folders and a file
// name only, so the Worker can't be pointed anywhere else.
export const LUMA_PATH = /^(?:[a-z0-9-]+\/)+[\w-]+(?:\.[\w-]+)*\.(?:png|jpe?g|webp|gif|avif)$/i;

export function lumaPhoto(url) {
  const path = url?.startsWith(`${LUMA_HOST}/`) ? url.slice(LUMA_HOST.length + 1) : null;
  if (!path || !LUMA_PATH.test(path)) return null;
  const [small, large] = LUMA_WIDTHS.map((w) => `/img/luma/${w}/${path}`);
  return { small, large };
}
