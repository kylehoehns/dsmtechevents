// Automated accessibility checks (axe) on every page, light and dark, at both
// sizes (the desktop and phone projects). The shared fixture also fails any
// page that logs a console error.
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.mjs';

const PAGES = ['/', '/?view=calendar', '/groups/', '/about/', '/organizers/', '/status/', '/tv/', '/tv/?event=cijug-joint', '/print/', '/404'];

for (const colorScheme of ['light', 'dark']) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    for (const path of PAGES) {
      test(`${path} has no axe violations`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
          .analyze();
        expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual([]);
      });
    }
  });
}

// Each event title is a heading holding a link. "Opens in new tab" is the
// link's description, so a screen reader's list of headings reads titles only.
test('event headings are named by the title alone', async ({ page }) => {
  await page.goto('/');
  const title = page.getByRole('region', { name: 'Upcoming events' }).getByRole('heading', { name: 'Coding Dojo', exact: true });
  await expect(title).toBeVisible();
  await expect(title.getByRole('link')).toHaveAccessibleDescription('Opens in new tab');
  await expect(page.getByRole('heading', { name: /Full calendar/ })).toHaveCount(0);
});

// The phone's strip of posters has no scrollbar. Tabbing to a poster's button
// brings the whole poster on screen, focus ring and all.
test('tabbing to a poster off to the side scrolls it into view', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the strip scrolls sideways on phones only');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  // The fixtures have one conference; a copy of its poster makes the strip scroll.
  await page.locator('.poster').evaluate((p) => p.after(Object.assign(p.cloneNode(true), { id: 'second-poster' })));
  await page.locator('.poster .go').first().focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#second-poster .go')).toBeFocused();
  const box = await page.locator('#second-poster').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
});
