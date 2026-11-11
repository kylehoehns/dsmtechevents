// A few pages, so a hand-written sitemap beats adding @astrojs/sitemap.
import type { APIRoute } from 'astro';
import { site } from '../lib/site.mjs';
import { loadData } from '../lib/data.mjs';

export const GET: APIRoute = () => {
  // The list and the groups change whenever event data does. /organizers/ and
  // /about/ don't, and Google stops trusting a lastmod that's always new, so
  // they have none.
  const lastmod = loadData().updatedAt.slice(0, 10);
  const urls = [['/', lastmod], ['/groups/', lastmod], ['/organizers/'], ['/about/']]
    .map(([p, mod]) => `  <url><loc>${new URL(p, site.url).href}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ''}</url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`, { headers: { 'Content-Type': 'application/xml' } });
};
