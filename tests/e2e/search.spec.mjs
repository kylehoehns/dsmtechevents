// Search: the magnifier in the nav, what it matches, the URL, the status line.
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.mjs';

const list = (page) => page.getByRole('region', { name: 'Upcoming events' });
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const event = (page, title) => list(page).getByRole('heading', { name: new RegExp(`^${escape(title)}`) });
const recent = (page, title) => page.locator('#recent-list li').filter({ hasText: title });
const box = (page) => page.getByRole('searchbox', { name: 'Search events' });

async function search(page, q) {
  await page.getByRole('button', { name: 'Search events' }).click();
  await expect(box(page)).toBeFocused();
  await box(page).fill(q);
}

test('the search box stays closed until the magnifier opens it', async ({ page }) => {
  await page.goto('/');
  const btn = page.getByRole('button', { name: 'Search events' });
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await expect(box(page)).toBeHidden();
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  await expect(box(page)).toBeFocused();
  // Closing an empty box hands focus back to the button.
  await btn.click();
  await expect(box(page)).toBeHidden();
  await expect(btn).toBeFocused();
});

test('a word only in a group\'s full name finds its events', async ({ page }) => {
  await page.goto('/');
  // "Java" is only in "Central Iowa Java Users Group"; the rows say CIJUG.
  await search(page, 'java');
  await expect(page).toHaveURL(/\?q=java$/);
  await expect(event(page, 'Joint night - JVM vs. CLR')).toBeVisible();
  await expect(event(page, 'Coding Dojo')).toBeHidden();
  await expect(event(page, 'Python Office Hours')).toBeHidden();
  // Recent events are searched too.
  await expect(recent(page, 'Records and sealed types')).toBeVisible();
  await expect(recent(page, 'Pyowa September')).toBeHidden();
  // Counts follow what's left.
  await expect(list(page).locator('[data-sec]:not([hidden]) [data-count]')).toHaveText(['1 event']);
});

test('the About text is searched', async ({ page }) => {
  await page.goto('/');
  await search(page, 'Kata');
  await expect(event(page, 'Coding Dojo')).toBeVisible();
  await expect(event(page, 'Joint night - JVM vs. CLR')).toBeHidden();
  await expect(event(page, 'Python Office Hours')).toBeHidden();
});

test('words match from their start: "ai" finds AI, not "said"', async ({ page }) => {
  await page.goto('/');
  await search(page, 'ai');
  await expect(list(page).getByRole('heading', { name: /^AI Study Group/ }).first()).toBeVisible();
  // Coding Dojo's About text says "said".
  await expect(event(page, 'Coding Dojo')).toBeHidden();
  await expect(recent(page, 'Hiring in the Age of AI')).toBeVisible();
});

test('the address is searched, so a town name works', async ({ page }) => {
  await page.goto('/');
  await search(page, 'urbandale');
  await expect(event(page, 'Coding Dojo')).toBeVisible();
  await expect(event(page, 'Python Office Hours')).toBeVisible();
  await expect(event(page, 'Joint night - JVM vs. CLR')).toBeHidden();
  await expect(page.getByRole('status')).toHaveText("Showing 2 events matching 'urbandale'");
});

test('".net" finds the .NET group', async ({ page }) => {
  await page.goto('/');
  await search(page, '.NET');
  await expect(event(page, 'Joint night - JVM vs. CLR')).toBeVisible();
  await expect(event(page, 'Coding Dojo')).toBeHidden();
});

test('every word has to match', async ({ page }) => {
  await page.goto('/');
  await search(page, 'source python');
  await expect(event(page, 'Python Office Hours')).toBeVisible();
  await expect(event(page, 'Coding Dojo')).toBeHidden();
});

test('no match shows a friendly note that clears the search', async ({ page }) => {
  await page.goto('/');
  await search(page, 'cobol');
  await expect(page.getByText("Nothing coming up matches 'cobol'.")).toBeVisible();
  await expect(list(page).locator('[data-sec]:not([hidden])')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText("Nothing coming up matches 'cobol'");

  await page.locator('#list-empty').getByRole('button', { name: 'Clear search' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(box(page)).toBeFocused();
  await expect(box(page)).toHaveValue('');
  await expect(event(page, 'Coding Dojo')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Showing 7 events');
});

test('Escape and the × empty the search and close it', async ({ page }) => {
  await page.goto('/');
  await search(page, 'java');
  await box(page).press('Escape');
  await expect(box(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Search events' })).toBeFocused();
  await expect(page).toHaveURL(/\/$/);
  await expect(event(page, 'Coding Dojo')).toBeVisible();

  await search(page, 'java');
  await page.locator('#search').getByRole('button', { name: 'Clear search' }).click();
  await expect(box(page)).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await expect(event(page, 'Coding Dojo')).toBeVisible();
});

test('?q= on load opens the box with the search applied', async ({ page }) => {
  await page.goto('/?q=python');
  await expect(box(page)).toBeVisible();
  await expect(box(page)).toHaveValue('python');
  await expect(event(page, 'Python Office Hours')).toBeVisible();
  await expect(event(page, 'Joint night - JVM vs. CLR')).toBeHidden();
  await expect(page).toHaveTitle(/^'python' · /);
});

test('a search covers every group and shows the list, even from the calendar', async ({ page }) => {
  await page.goto('/?group=pyowa');
  await search(page, 'java');
  await expect(page).toHaveURL(/\?q=java$/);
  await expect(event(page, 'Joint night - JVM vs. CLR')).toBeVisible();
  await expect(page.locator('#filter')).toBeHidden(); // the search cleared the group filter
  // Back returns to the group filter in one step, not a keystroke at a time.
  await page.goBack();
  await expect(page).toHaveURL(/\?group=pyowa$/);
  await expect(box(page)).toBeHidden();

  await page.goto('/?view=calendar');
  await search(page, 'java');
  await expect(page.getByRole('region', { name: 'Calendar' })).toBeHidden();
  await expect(event(page, 'Joint night - JVM vs. CLR')).toBeVisible();
});

for (const colorScheme of ['light', 'dark']) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });
    for (const q of ['java', 'cobol']) {
      test(`an open search for '${q}' has no axe violations`, async ({ page }) => {
        await page.goto('/');
        await search(page, q);
        await expect(page).toHaveURL(new RegExp(`q=${q}$`));
        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
          .analyze();
        expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual([]);
      });
    }
  });
}

test('every page has the search button in the same spot; elsewhere it opens search on the events page', async ({ page }) => {
  const spot = async (path) => { await page.goto(path); return page.getByRole('link', { name: 'Search events' }).or(page.getByRole('button', { name: 'Search events' })).boundingBox(); };
  const home = await spot('/');
  for (const path of ['/groups/', '/about/', '/add/']) expect(await spot(path), path).toEqual(home);
  await page.getByRole('link', { name: 'Search events' }).click();
  await expect(page).toHaveURL(/\/(\?search)?$/);
  await expect(page.getByRole('searchbox', { name: 'Search events' })).toBeFocused();
});
