// Images that won't load (offline and not saved, or taken down at the source)
// are taken away rather than left as empty framed boxes. Every photo and logo
// in the fixture data but one (a data: image) is on Meetup's host, which fails here.
// The shared fixture fails a test on any console error, and a failed image
// logs one, so these use Playwright's own test with the clock set the same way.
import { test, expect } from '@playwright/test';
import { NOW, PHOTOS } from './fixtures.mjs';

test.beforeEach(async ({ page, baseURL }) => {
  await page.route((url) => !url.href.startsWith(baseURL) && !url.protocol.startsWith('data'), (route) => route.abort());
  await page.route(PHOTOS, (route) => route.fulfill({ status: 404, body: '' }));
  await page.clock.install({ time: new Date(NOW) });
});

test('a group logo that will not load becomes the group monogram', async ({ page }) => {
  await page.goto('/groups/');
  const flyer = page.locator('article#aws');
  await expect(flyer.locator('span.logo-img.logo-mono')).toHaveText('A', { useInnerText: true }); // the tile a group with no logo gets
  await expect(page.locator('img.logo-img')).toHaveCount(0);
});

test('an event photo that will not load leaves its card without one; one that loads stays', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const failed = page.locator('#list-view .show', { hasText: 'Remote DevOps Chat' }); // a Meetup photo, failed above
  const fine = page.locator('#list-view .show', { hasText: 'Coding Dojo' }); // a data: image, which loads
  // Photos are lazy: they only try to load, and fail, once scrolled to.
  await failed.scrollIntoViewIfNeeded();
  await expect(failed).not.toHaveClass(/has-photo/);
  await expect(failed.locator('.photo')).toHaveCount(0);
  await fine.scrollIntoViewIfNeeded();
  await expect(fine).toHaveClass(/has-photo/);
  await expect(fine.locator('.photo img')).toHaveJSProperty('complete', true);
});
