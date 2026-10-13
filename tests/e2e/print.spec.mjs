// The /print/ flyer's paper touches.
import { test, expect } from './fixtures.mjs';

test('a conference row is boxed on paper, and the tape stays on screen', async ({ page }) => {
  await page.goto('/print/');
  const conf = page.locator('.lineup li', { hasText: 'Test Conf 2026' });
  await expect(conf).toHaveClass(/\bheadliner\b/);
  await expect(page.locator('.sheet .tape')).toHaveCount(2);
  await expect(page.locator('.sheet .tape').first()).toBeVisible();
  await expect(page.locator('.tear-note')).toHaveText('Tear one off ↓');

  await page.emulateMedia({ media: 'print' });
  await expect(conf).toHaveCSS('border-top-width', '2px');
  await expect(conf).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)'); // an outline, no fill
  await expect(page.locator('.sheet .tape').first()).toBeHidden();
  await expect(page.locator('.tear-note')).toBeVisible();
});

// A sheet on a corkboard goes stale; it says, big, the last day it lists
// everything. The fixtures all fit, so that's the end of the four weeks from
// the build (Wed Oct 14): Tue Nov 10.
test('the flyer says how long it is good for', async ({ page }) => {
  await page.goto('/print/');
  await expect(page.locator('.sheet-foot .through')).toHaveText('Good through Tue Nov 10');
  await expect(page.locator('.kicker')).toHaveText('Des Moines tech meetups'); // the date is said once, in the footer
});
