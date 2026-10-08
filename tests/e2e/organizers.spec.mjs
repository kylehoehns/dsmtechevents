// /organizers/: the event screen link and the badge kit.
import { test, expect } from './fixtures.mjs';

const link = (page) => page.locator('#b-url');

test("picking CIJUG's event gives its screen link and preview", async ({ page, baseURL }) => {
  await page.goto('/organizers/');
  await page.getByLabel('Your event', { exact: true }).selectOption({ label: 'CIJUG + IADNUG: Joint night - JVM vs. CLR, Tue Oct 20' });
  const url = `${baseURL}/tv/?event=cijug-joint`;
  await expect(link(page)).toHaveText(url);
  await expect(page.getByRole('link', { name: /Open preview/ })).toHaveAttribute('href', url);
});

test('copies the screen link and the badge snippets', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/organizers/');
  await page.getByLabel('Your event', { exact: true }).selectOption({ label: 'CIJUG + IADNUG: Joint night - JVM vs. CLR, Tue Oct 20' });
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.locator('#b-copy')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await link(page).textContent());

  await page.locator('.badge-kit').getByRole('button', { name: 'Copy' }).last().click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Find more Des Moines tech meetups and conferences: https://dsmtechevents.com');
});

test('the badge kit lives here, and /add/ points to it', async ({ page }) => {
  await page.goto('/add/');
  await expect(page.locator('.badge-kit')).toHaveCount(0);
  await page.getByRole('link', { name: 'The organizers page' }).click();
  await expect(page).toHaveURL(/\/organizers\/$/);
  await expect(page.getByRole('heading', { name: 'Point your members here' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Find more Des Moines tech events' })).toBeVisible();
});
