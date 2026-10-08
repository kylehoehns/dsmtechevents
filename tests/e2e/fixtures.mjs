// Shared setup for every browser test:
// - the browser clock starts at NOW, the moment the fixture site was built for
// - requests leave localhost never (no Meetup, no fonts CDN; the tests can't flake on the network)
// - any console error or uncaught exception fails the test
import { test as base, expect } from '@playwright/test';

// Wednesday Oct 14 2026, 9am in Des Moines. playwright.config.mjs builds the site at this moment.
export const NOW = '2026-10-14T14:00:00Z';

export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    await page.route((url) => !url.href.startsWith(baseURL) && !url.protocol.startsWith('data'), (route) => route.abort());
    await page.clock.install({ time: new Date(NOW) });
    await use(page);
    expect(errors, 'console errors on the page').toEqual([]);
  },
});

export { expect };
