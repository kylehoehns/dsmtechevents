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
  await expect(dayPanel(page)).toContainText('Fall Back Hack Night');
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
  // The panel hides the card's date block, so the time line keeps the whole range.
  await expect(dayPanel(page).locator('.time')).toHaveText('Thu–Fri Oct 22–23 · 8a–5p');

  await page.getByRole('button', { name: 'Monday, October 19, nothing scheduled' }).click();
  await expect(dayPanel(page)).toContainText('A quiet day');
});

test('picking day after day on a phone leaves the grid where it is', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the day panel sits beside the grid on desktop');
  await page.goto('/?view=calendar');
  const grid = page.getByRole('group', { name: 'October 2026' });
  // A busy day, a quiet one, a conference day: each panel is a different height,
  // which used to leave the page scrolled somewhere different after every tap.
  for (const day of ['Tuesday, October 20', 'Monday, October 19', 'Thursday, October 22', 'Tuesday, October 27']) {
    await page.getByRole('button', { name: new RegExp(`^${day},`) }).tap();
    await expect(dayPanel(page).getByRole('heading', { name: day })).toBeInViewport();
    await expect(grid).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => scrollY)).toBe(0);
  }
});

test('the "Pick a day" hint goes once a day is picked', async ({ page }) => {
  const hint = page.locator('.cal-key').getByText('Pick a day to see its events');
  await page.goto('/?view=calendar');
  await expect(hint).toBeVisible();
  await page.getByRole('button', { name: 'Tuesday, October 20, 1 event' }).click();
  await expect(dayPanel(page)).toContainText('Joint night - JVM vs. CLR');
  await expect(hint).toHaveCount(0);
  // Paging months doesn't bring it back.
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(hint).toHaveCount(0);
  // A link to a day is a day already picked.
  await page.goto('/?view=calendar&day=2026-10-22');
  await expect(page.locator('.cal-key')).toBeVisible();
  await expect(hint).toHaveCount(0);
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

test('the mini calendar is one tab stop; arrow keys move between its days', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the mini calendar is desktop only');
  await page.goto('/');
  const mini = page.getByRole('group', { name: 'October 2026' });
  // Tab from the top of the page to the first link in the event list.
  let presses = 0;
  let minicalStops = 0;
  while (presses < 80 && !(await page.evaluate(() => !!document.activeElement?.closest('#list-view')))) {
    await page.keyboard.press('Tab');
    presses++;
    if (await page.evaluate(() => !!document.activeElement?.closest('.mini-grid'))) minicalStops++;
  }
  expect(minicalStops).toBe(1);
  expect(presses).toBeLessThanOrEqual(15);

  const today = mini.getByRole('button', { name: /^Wednesday, October 14,/ });
  await today.focus();
  await page.keyboard.press('ArrowRight');
  await expect(mini.getByRole('button', { name: /^Thursday, October 15,/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(mini.getByRole('button', { name: /^Thursday, October 22,/ })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(mini.getByRole('button', { name: /^Sunday, October 18,/ })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(mini.getByRole('button', { name: /^Sunday, October 4,/ })).toBeFocused();
  // Stops at the edge of the month.
  await page.keyboard.press('ArrowUp');
  await expect(mini.getByRole('button', { name: /^Sunday, October 4,/ })).toBeFocused();
  await page.keyboard.press('End');
  const sat = mini.getByRole('button', { name: /^Saturday, October 10,/ });
  await expect(sat).toBeFocused();
  // The moved-to day is now the one tab stop.
  await expect(mini.locator('button[tabindex="0"]')).toHaveCount(1);
  await expect(sat).toHaveAttribute('tabindex', '0');

  // Enter opens that day in the calendar, as a click does.
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/view=calendar&day=2026-10-10/);
  await expect(page.locator('.day[data-day="2026-10-10"]')).toBeFocused();
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
