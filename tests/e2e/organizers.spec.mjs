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

test('getting listed comes first, then the badge kit', async ({ page }) => {
  await page.goto('/organizers/');
  await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('Get listed');
  await expect(page.getByRole('link', { name: 'Open in your email app' })).toHaveAttribute('href', /^mailto:hello@dsmtechevents\.com\?subject=/);
  await expect(page.getByRole('heading', { name: 'Point your members here' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Find more Des Moines tech events' })).toBeVisible();
});

test('lists rooms that have hosted a meetup, folded away until asked', async ({ page }) => {
  await page.goto('/organizers/');
  const summary = page.getByText(/^\d+ places? that have hosted a meetup since /);
  const rows = page.locator('.venue-list li');
  await expect(rows.first()).toBeHidden();
  await summary.click();
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toContainText(/\d+ meetups?$/);
  await expect(page.locator('.venue-list')).not.toContainText(/^Online/m);
});
