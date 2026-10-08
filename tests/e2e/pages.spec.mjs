// The Groups and Add pages, and the theme button every page shares.
import { test, expect } from './fixtures.mjs';

test('groups page lists every group alphabetically', async ({ page }) => {
  await page.goto('/groups/');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([/^AWS/, /^CIJUG/, /^DevOps/, /^DSM AI/, /^IADNUG/, /^Pyowa/, /^UX/, /^Web Geeks/]);
  // A group with nothing posted still gets a card.
  await expect(page.locator('article', { has: page.getByRole('heading', { name: /^UX/ }) })).toContainText('Nothing scheduled');
});

test('a link to /groups/#id highlights that group', async ({ page }) => {
  await page.goto('/groups/#pyowa');
  const outline = (id) => page.locator(`article#${id}`).evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(await outline('pyowa')).toBe('solid');
  expect(await outline('cijug')).toBe('none');
  await page.locator('article#pyowa').getByRole('link', { name: '1 event from Pyowa' }).click();
  await expect(page).toHaveURL(/\/\?group=pyowa$/);
});

test('add page copies the email address', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/add/');
  await page.getByRole('button', { name: 'Copy address' }).click();
  await expect(page.getByRole('status')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('hello@dsmtechevents.com');
});

test('theme button cycles auto, light, dark and remembers the choice', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  const theme = page.getByRole('button', { name: /^Theme:/ });
  await expect(theme).toHaveAccessibleName('Theme: auto');

  await theme.click();
  await expect(theme).toHaveAccessibleName('Theme: light');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await theme.click();
  await expect(theme).toHaveAccessibleName('Theme: dark');
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(theme).toHaveAccessibleName('Theme: dark');
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await theme.click();
  await expect(theme).toHaveAccessibleName('Theme: auto');
  await expect(html).not.toHaveAttribute('data-theme');
  await page.reload();
  await expect(theme).toHaveAccessibleName('Theme: auto');
  await expect(html).not.toHaveAttribute('data-theme');
});

test('the footer links to the TV and print pages', async ({ page }) => {
  await page.goto('/about/');
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Put it on a TV' })).toHaveAttribute('href', '/tv/');
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Print a flyer' })).toHaveAttribute('href', '/print/');
});
