// Two pages, so a hand-written sitemap beats adding @astrojs/sitemap.
import type { APIRoute } from 'astro';
import { site } from '../lib/site.mjs';

export const GET: APIRoute = () => {
  const urls = ['/', '/groups/'].map((p) => `  <url><loc>${new URL(p, site.url).href}</loc></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`, { headers: { 'Content-Type': 'application/xml' } });
};
