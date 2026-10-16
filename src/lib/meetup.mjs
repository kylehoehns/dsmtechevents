// Accepts "central-iowa-java-users-group" or "https://www.meetup.com/central-iowa-java-users-group/".
export function meetupSlug(value) {
  if (!value) return null;
  return /meetup\.com\/([^/?#]+)/.exec(value)?.[1] ?? value.replace(/\//g, '');
}

// https://www.meetup.com/<slug>/<path>, e.g. meetupUrl(slug, 'events/ical/').
export const meetupUrl = (slug, path = '') => `https://www.meetup.com/${slug}/${path}`;

// Meetup serves every photo in a few sizes, picked by the file-name prefix:
// global_ is 180 wide, 600_ is 600 wide, and any of them comes as .webp by
// changing the extension. (Other numeric prefixes like 200_ quietly return the
// full-size original, so don't use them.) Anything that isn't a Meetup photo
// URL gets null, and callers keep the URL they had. Most event photos are
// 16:9, so the 600_ copy is 600x338: `width` and `height` let an <img> hold
// that shape until it loads. Photos from anywhere else come in any shape (a
// 1400x400 banner), so they get no size.
const MEETUP_PHOTO = /^(https:\/\/secure\.meetupstatic\.com\/photos\/[a-z]+\/(?:[0-9a-f]\/)+)(?:600|global|highres)_(\d+)\.(?:jpe?g|png|webp)$/i;
export function meetupPhoto(url) {
  const m = MEETUP_PHOTO.exec(url ?? '');
  return m && { small: `${m[1]}global_${m[2]}.webp`, large: `${m[1]}600_${m[2]}.webp`, width: 600, height: 338 };
}
