// The events list, as the fixture data builds it on Wednesday Oct 14, 9am.
import { test, expect } from './fixtures.mjs';

const row = (page, title) => page.getByRole('region', { name: 'Upcoming events' }).getByRole('listitem').filter({ hasText: title });

test('groups events into sections by week and month', async ({ page }) => {
  await page.goto('/');
  const list = page.getByRole('region', { name: 'Upcoming events' });
  await expect(list.getByRole('heading', { level: 2 })).toHaveText(['This week', 'Next week', 'Rest of October', 'November', 'Further out']);
  await expect(row(page, 'Coding Dojo')).toBeVisible();
  await expect(row(page, 'Remote DevOps Chat')).toContainText('Online');
  // A joint meetup is one row naming both hosts.
  await expect(row(page, 'Joint night - JVM vs. CLR')).toHaveCount(1);
  await expect(row(page, 'Joint night - JVM vs. CLR').getByRole('link', { name: 'CIJUG', exact: true })).toBeVisible();
  await expect(row(page, 'Joint night - JVM vs. CLR').getByRole('link', { name: 'IADNUG', exact: true })).toBeVisible();
  await expect(row(page, 're:Invent Recap')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recent events' })).toContainText('Hiring in the Age of AI');
});

test('tags tonight and tomorrow, and sums up a repeating series', async ({ page }) => {
  await page.goto('/');
  await expect(row(page, 'Coding Dojo').getByText('Tonight', { exact: true })).toBeVisible();
  await expect(row(page, 'Python Office Hours').getByText('Tomorrow', { exact: true })).toBeVisible();
  await expect(row(page, 'Remote DevOps Chat').getByText(/^(Today|Tonight|Tomorrow)$/)).toHaveCount(0);
  // Three monthly dates collapse into one row.
  await expect(row(page, 'AI Study Group')).toHaveCount(1);
  await expect(row(page, 'AI Study Group')).toContainText('Every 2nd Thursday');
  await expect(row(page, 'AI Study Group')).toContainText('3 dates through Jan 2027');
});

test('the browser re-labels a page opened on a later day', async ({ page }) => {
  // Same build, opened Thursday morning: tonight's event is over and gone,
  // and Thursday's lunch is now "Today".
  await page.clock.setFixedTime(new Date('2026-10-15T14:00:00Z'));
  await page.goto('/');
  await expect(row(page, 'Coding Dojo')).toHaveCount(0);
  await expect(row(page, 'Python Office Hours').getByText('Today', { exact: true })).toBeVisible();
});

// An app on an iPhone home screen is resumed, not reloaded. Layout.astro
// reloads a page more than an hour old; these cover the hour before that.
// The Coding Dojo runs 5:30-7:30p.
test('a page reopened within the hour re-labels itself', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-10-14T22:00:00Z'));
  await page.goto('/');
  await expect(row(page, 'Coding Dojo').getByText('Tonight', { exact: true })).toBeVisible();
  await page.clock.setSystemTime(new Date('2026-10-14T22:45:00Z'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(row(page, 'Coding Dojo').getByText('Happening now', { exact: true })).toBeVisible();
});

test('a page left showing re-checks once a minute', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-10-14T22:20:00Z'));
  await page.goto('/');
  await page.clock.runFor('15:00');
  await expect(row(page, 'Coding Dojo').getByText('Happening now', { exact: true })).toBeVisible();
  await page.clock.runFor('02:00:00');
  await expect(row(page, 'Coding Dojo')).toHaveCount(0);
});

test('an event that ends while the page is open moves to Recent events', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-10-15T00:20:00Z')); // 7:20p
  await page.goto('/');
  const recent = page.getByRole('region', { name: 'Recent events' }).getByRole('listitem').filter({ hasText: 'Coding Dojo' });
  await expect(recent).toHaveCount(0);
  await page.clock.runFor('15:00');
  await expect(row(page, 'Coding Dojo')).toHaveCount(0);
  await expect(recent).toContainText('12 went');
  await expect(page.locator('#recent-list li:not([hidden])').first()).toContainText('Coding Dojo');
});

test('headliner poster counts down to the conference', async ({ page }) => {
  await page.goto('/');
  const poster = page.getByRole('region', { name: 'Coming up soon' });
  await expect(poster.getByRole('heading', { name: 'Test Conf 2026' })).toBeVisible();
  await expect(poster).toContainText('Two-day conference');
  await expect(poster).toContainText('8 days out');
  await expect(poster).toContainText('Oct 22–23');
});

test('a conference row says its start date once, and "@" stays with the venue', async ({ page }) => {
  await page.goto('/');
  const conf = row(page, 'Test Conf 2026');
  // The date block already says THU 22 OCT; the time line adds only the last day.
  await expect(conf.locator('.time')).toHaveText('through Fri Oct 23 · 8a–5p');
  // No-break spaces: "·" stays with the time and "@" with the venue on a narrow card.
  expect(await conf.locator('.meta').textContent()).toContain('8a–5p\u00a0· @\u00a0Convention Center'); // raw text: toContainText would fold the no-break spaces
});

test('overnight between conference days, the poster stamp agrees with the row', async ({ page }) => {
  // Thu Oct 22, 9pm: day one (8a–5p) is over, day two is tomorrow.
  await page.clock.setFixedTime(new Date('2026-10-23T02:00:00Z'));
  await page.goto('/');
  const poster = page.getByRole('region', { name: 'Coming up soon' });
  await expect(poster.locator('.countdown')).toHaveText('Tomorrow');
  await expect(row(page, 'Test Conf 2026').getByText('Tomorrow', { exact: true })).toBeVisible();
});

test('a venue already listed above drops its street address', async ({ page }) => {
  await page.goto('/');
  // Both are at Source Allies; only the first row prints the address.
  await expect(row(page, 'Coding Dojo').getByText('4501 NW Urbandale Dr, Urbandale')).toBeVisible();
  await expect(row(page, 'Python Office Hours').getByText('4501 NW Urbandale Dr, Urbandale')).toBeHidden();
  await expect(row(page, 'Python Office Hours').getByRole('link', { name: /Source Allies/ })).toBeVisible();
});

test('venue links open Google Maps', async ({ page }) => {
  await page.goto('/');
  const map = row(page, 'Coding Dojo').getByRole('link', { name: /Source Allies.*opens map in new tab/ });
  await expect(map).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Source%20Allies%2C%204501/);
});

test.describe('on an iPhone', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });

  test('venue links open Apple Maps', async ({ page }) => {
    await page.goto('/');
    const map = row(page, 'Coding Dojo').getByRole('link', { name: /Source Allies.*opens map in new tab/ });
    await expect(map).toHaveAttribute('href', /^https:\/\/maps\.apple\.com\/\?q=Source%20Allies%2C%204501/);
  });
});
