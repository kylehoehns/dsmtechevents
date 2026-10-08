// A few pages, so a hand-written sitemap beats adding @astrojs/sitemap.
import type { APIRoute } from 'astro';
import { site } from '../lib/site.mjs';
import { loadData } from '../lib/data.mjs';

export const GET: APIRoute = () => {
  // Both pages change whenever event data does.
  const lastmod = loadData().updatedAt.slice(0, 10);
  const urls = ['/', '/groups/', '/add/', '/about/'].map((p) => `  <url><loc>${new URL(p, site.url).href}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`, { headers: { 'Content-Type': 'application/xml' } });
};
