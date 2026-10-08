// Offline: the installed site keeps working with no network (public/sw.js).
// Runs only in the "offline" project (playwright.config.mjs), the one that
// lets the service worker run; every other test blocks it.
import { test, expect, fakePhotos, PHOTOS } from './fixtures.mjs';

test.beforeEach(async ({ context, baseURL }) => {
  // The shared fixture keeps the page off other hosts; keep the worker off them too.
  await context.route((url) => !url.href.startsWith(baseURL) && !url.protocol.startsWith('data'), (route) => route.abort());
  await fakePhotos(context);
});

// The first visit installs the worker, which saves the site, then takes over the page.
async function installWorker(page) {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

// Forget what the browser itself cached, so only the worker can answer, then cut the network.
async function goOffline(page, context) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.clearBrowserCache');
  await context.setOffline(true);
}

async function expectHomeWorks(page) {
  // The list is in the HTML; the mini calendar is drawn by the page script,
  // so seeing it means the script and everything it imports loaded.
  await expect(page.locator('#list-view .show').first()).toBeVisible();
  await expect(page.locator('#minical button').first()).toBeVisible();
}

async function expectTvWorks(page) {
  await page.goto('/tv/');
  const current = page.locator('.slide.is-on');
  await expect(current.getByRole('heading', { name: 'Coming up' })).toBeVisible();
  // Its stylesheet loaded: slides that aren't showing are see-through.
  await expect(page.locator('.slide').nth(1)).toHaveCSS('opacity', '0');
  // Its script runs: the arrow key moves to the next poster.
  await page.keyboard.press('ArrowRight');
  await expect(current.getByRole('heading', { name: 'Coding Dojo' })).toBeVisible();
}

test('one visit is enough: home page, calendar and TV page work offline', async ({ page, context }) => {
  await installWorker(page);
  await goOffline(page, context);

  await page.reload();
  await expectHomeWorks(page);

  // A past day's card isn't in the home page; it comes from the card pool.
  await page.goto('/?view=calendar&day=2026-10-05');
  await expect(page.locator('#day-panel .show')).toHaveCount(1);
  await expect(page.locator('#day-panel')).toContainText('Hiring in the Age of AI');

  await expectTvWorks(page);
});

test('visiting the home page again keeps the TV page\'s files', async ({ page, context }) => {
  await installWorker(page);
  // Online, the way a visitor goes: each home page load lets the worker tidy its cache.
  await page.goto('/tv/');
  await page.goto('/');
  await expectHomeWorks(page);
  await goOffline(page, context);

  await page.reload();
  await expectHomeWorks(page);
  await expectTvWorks(page);
});

// Neither page is opened online: the worker saved them on install, and their
// images with them (lazy logos, photos on slides not showing yet).
test('group logos and TV photos work offline without opening those pages first', async ({ page, context }) => {
  await installWorker(page);
  await goOffline(page, context);
  await context.unroute(PHOTOS); // only what the worker saved can answer
  const loaded = (img) => img.evaluate((el) => el.complete && el.naturalWidth > 0);

  await page.goto('/groups/');
  await expect.poll(() => loaded(page.locator('#aws .logo-img'))).toBe(true);
  await page.goto('/tv/');
  await expect.poll(() => loaded(page.locator('.tv-photo').first())).toBe(true);
});
