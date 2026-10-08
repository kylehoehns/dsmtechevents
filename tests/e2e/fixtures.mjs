// Shared setup for every browser test:
// - the browser clock starts at NOW, the moment the fixture site was built for
// - requests leave localhost never (no Meetup, no fonts CDN; the tests can't flake on the network);
//   Meetup photos get a stand-in image
// - any console error or uncaught exception fails the test
// - pages get the production Content-Security-Policy from dist-e2e/_headers
//   (astro preview doesn't send it), so a blocked inline script is a console error
import fs from 'node:fs';
import { test as base, expect } from '@playwright/test';

// Wednesday Oct 14 2026, 9am in Des Moines. playwright.config.mjs builds the site at this moment.
export const NOW = '2026-10-14T14:00:00Z';

// Meetup photos and logos in the fixture data get a 1×1 PNG from here instead,
// with the CORS header Meetup's photo host sends.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
export const PHOTOS = 'https://secure.meetupstatic.com/**';
export const fakePhotos = (target) => target.route(PHOTOS, (route) => route.fulfill({ contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PNG }));

export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    await page.route((url) => !url.href.startsWith(baseURL) && !url.protocol.startsWith('data'), (route) => route.abort());
    await fakePhotos(page);
    const csp = /^\s*Content-Security-Policy:\s*(.+)$/m.exec(fs.readFileSync(new URL('../../dist-e2e/_headers', import.meta.url), 'utf8'))[1];
    await page.route((url) => url.href.startsWith(baseURL), async (route) => {
      if (route.request().resourceType() !== 'document') return route.fallback();
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
    });
    await page.clock.install({ time: new Date(NOW) });
    await use(page);
    expect(errors, 'console errors on the page').toEqual([]);
  },
});

export { expect };
