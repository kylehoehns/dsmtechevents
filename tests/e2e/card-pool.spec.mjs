// The card pool (/cards/): cards for events the list doesn't print, fetched
// by the calendar's day panel when it first needs one.
import { test, expect } from './fixtures.mjs';
import { test as plain, expect as plainExpect } from '@playwright/test';

const dayPanel = (page) => page.locator('#day-panel');

test('the list never fetches the pool; a past day in the calendar does', async ({ page }) => {
  const fetched = [];
  page.on('request', (req) => { if (new URL(req.url()).pathname === '/cards/') fetched.push(req.url()); });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(fetched).toEqual([]);

  await page.goto('/?view=calendar&day=2026-10-05');
  const card = dayPanel(page).locator('.show[data-id="webgeeks-past"]');
  await expect(card).toBeVisible();
  await expect(card.locator('.title a')).toHaveText('Hiring in the Age of AI');
  await expect(card).toContainText('Source Allies');
});

test('the day panel says it is loading while the pool is on its way', async ({ page }) => {
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route('**/cards/', async (route) => { await held; await route.continue(); });
  await page.goto('/?view=calendar&day=2026-10-05');
  await expect(dayPanel(page)).toContainText('Loading events…');
  release();
  await expect(dayPanel(page)).toContainText('Hiring in the Age of AI');
  await expect(dayPanel(page)).not.toContainText('Loading events…');
});

// Plain Playwright: the failed request logs a console error on purpose.
plain('if the pool can\'t load, the day panel still names the event and links to it', async ({ page }) => {
  await page.route('**/cards/', (route) => route.fulfill({ status: 503, body: 'offline' }));
  await page.goto('/?view=calendar&day=2026-10-05');
  const link = dayPanel(page).getByRole('link', { name: 'Hiring in the Age of AI (opens in new tab)' });
  await plainExpect(link).toHaveAttribute('href', 'https://www.meetup.com/des-moines-web-geeks/events/1/');
  await plainExpect(dayPanel(page)).not.toContainText('Loading events…');
});
