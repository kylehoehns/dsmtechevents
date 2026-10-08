// Automated accessibility checks (axe) on every page, light and dark, at both
// sizes (the desktop and phone projects). The shared fixture also fails any
// page that logs a console error.
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.mjs';

const PAGES = ['/', '/?view=calendar', '/groups/', '/about/', '/add/', '/organizers/', '/status/', '/tv/', '/tv/?event=webgeeks-tonight&welcome=Hi&agenda=Pizza|Talks&wifi=Guest&note=Hello&slides=event,welcome,agenda,wifi,note,next-group,next-all', '/print/', '/404'];

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
