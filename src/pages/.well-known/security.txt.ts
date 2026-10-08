// security.txt (RFC 9116). Its Expires must stay in the future, so it's set at
// build time to a year out; the site rebuilds at least daily (refresh.yml).
import type { APIRoute } from 'astro';
import { site } from '../../lib/site.mjs';

export const GET: APIRoute = () => {
  const expires = new Date();
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);
  expires.setUTCHours(0, 0, 0, 0);
  return new Response(`Contact: mailto:${site.email}
Expires: ${expires.toISOString()}
Preferred-Languages: en
Canonical: ${site.url}/.well-known/security.txt
Policy: ${site.repo}/blob/main/SECURITY.md
`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
