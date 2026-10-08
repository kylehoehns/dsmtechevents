// The month calendar and its day panel.
import { test, expect } from './fixtures.mjs';
import { test as plain, expect as plainExpect } from '@playwright/test';

const dayPanel = (page) => page.locator('#day-panel');

test('switches to the calendar and pages through months', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Calendar' }).click();

  await expect(page).toHaveURL(/\?view=calendar/);
  await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Upcoming events' })).toBeHidden();
  // Today has an event, so it's picked.
  await expect(dayPanel(page).getByRole('heading', { name: 'Wednesday, October 14' })).toBeVisible();

  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.getByRole('heading', { name: 'November 2026' })).toBeVisible();
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.getByRole('heading', { name: 'December 2026' })).toBeVisible();
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.getByRole('heading', { name: 'November 2026' })).toBeVisible();
  // November's first day with something on it.
  await expect(dayPanel(page)).toContainText('AI Study Group');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();
});

test('picking a day lists that day\'s events', async ({ page }) => {
  await page.goto('/?view=calendar');
  await page.getByRole('button', { name: 'Tuesday, October 20, 1 event' }).click();

  await expect(page).toHaveURL(/day=2026-10-20/);
  await expect(dayPanel(page).getByRole('heading', { name: 'Tuesday, October 20' })).toBeVisible();
  await expect(dayPanel(page).getByRole('listitem')).toHaveCount(1);
  await expect(dayPanel(page)).toContainText('Joint night - JVM vs. CLR');

  // Both conference days show the conference.
  await page.getByRole('button', { name: 'Friday, October 23, 1 event' }).click();
  await expect(dayPanel(page)).toContainText('Test Conf 2026');

  await page.getByRole('button', { name: 'Monday, October 19, nothing scheduled' }).click();
  await expect(dayPanel(page)).toContainText('A quiet day');
});

test('arrow keys move between days and focus survives picking one', async ({ page }) => {
  await page.goto('/?view=calendar');
  const today = page.getByRole('button', { name: /^Wednesday, October 14,/ });
  await today.focus();

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: /^Thursday, October 15,/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const conf = page.getByRole('button', { name: /^Thursday, October 22,/ });
  await expect(conf).toBeFocused();

  // Enter picks it; the grid is rebuilt and focus stays on the same day.
  await page.keyboard.press('Enter');
  await expect(conf).toHaveAttribute('aria-pressed', 'true');
  await expect(conf).toBeFocused();
  await expect(dayPanel(page)).toContainText('Test Conf 2026');
  await expect(page.getByRole('status')).toHaveText('Thursday, October 22: 1 event');
});

// Plain Playwright here: blocking app.js on purpose logs a failed request,
// which the shared fixture would count as a console error.
plain('opening the calendar from another page never shows Events as the current tab', async ({ page }) => {
  // Hold back app.js, so this checks what the page shows before any script of ours runs.
  await page.route('**/_astro/*.js', (route) => route.abort());
  await page.goto('/?view=calendar');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await plainExpect(nav.getByRole('link', { name: 'Calendar' })).toHaveAttribute('aria-current', 'page');
  await plainExpect(nav.getByRole('link', { name: 'Events' })).not.toHaveAttribute('aria-current');
});
