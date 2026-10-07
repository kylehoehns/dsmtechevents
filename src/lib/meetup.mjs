// Accepts "central-iowa-java-users-group" or "https://www.meetup.com/central-iowa-java-users-group/".
export function meetupSlug(value) {
  if (!value) return null;
  return /meetup\.com\/([^/?#]+)/.exec(value)?.[1] ?? value.replace(/\//g, '');
}
