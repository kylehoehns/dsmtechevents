// /organizers/: the event screen link and the badge kit.
import { test, expect } from './fixtures.mjs';

const link = (page) => page.locator('#b-url');

test("picking CIJUG's event gives its screen link and preview", async ({ page, baseURL }) => {
  await page.goto('/organizers/');
  await page.getByLabel('Your event', { exact: true }).selectOption({ label: 'Tue Oct 20 · CIJUG + IADNUG: Joint night - JVM vs. CLR' });
  const url = `${baseURL}/tv/?event=cijug-joint`;
  await expect(link(page)).toHaveText(url);
  await expect(page.getByRole('link', { name: /Open preview/ })).toHaveAttribute('href', url);
});

// Two repeating series in the fixtures: DSM AI's study group (3 dates) and
// Pyowa's office hours (2). Each is one choice, its next date, from the data
// alone; when that date ends, the next one takes its place.
test('a repeating series is one choice in the screen picker, its next date', async ({ page }) => {
  const options = (title) => page.locator('#b-event option', { hasText: title });
  await page.goto('/organizers/');
  await expect(options('AI Study Group')).toHaveText(['Thu Nov 12 · DSM AI: AI Study Group']);
  await expect(options('Python Office Hours')).toHaveText(['Thu Oct 15 · Pyowa: Python Office Hours']);

  await page.clock.setSystemTime(new Date('2026-10-16T14:00:00Z'));
  await page.reload();
  await expect(options('Python Office Hours')).toHaveText(['Thu Nov 19 · Pyowa: Python Office Hours']);
});

test('says how to fix a listing', async ({ page }) => {
  await page.goto('/organizers/');
  const fix = page.locator('section', { has: page.getByRole('heading', { name: 'Something wrong?' }) });
  await expect(fix).toContainText('picks it up at its next check');
  await expect(fix.getByRole('link', { name: 'Fix a listing form' })).toHaveAttribute('href', 'https://github.com/kylehoehns/dsmtechevents/issues/new?template=3-fix-listing.yml');
  await expect(page.getByRole('link', { name: 'paste its link into this form' })).toHaveAttribute('href', 'https://github.com/kylehoehns/dsmtechevents/issues/new?template=1-add-from-link.yml');
});

test('copies the screen link and the badge snippets', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/organizers/');
  await page.getByLabel('Your event', { exact: true }).selectOption({ label: 'Tue Oct 20 · CIJUG + IADNUG: Joint night - JVM vs. CLR' });
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.locator('#b-copy')).toHaveText('Copied');
  // The button's new text isn't announced while it has focus; the status line is.
  await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toHaveCount(1);
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
