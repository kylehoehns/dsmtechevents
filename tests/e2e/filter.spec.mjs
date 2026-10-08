// The group filter: chips, the URL, the screen-reader status line, Back/Forward.
import { test, expect } from './fixtures.mjs';

const list = (page) => page.getByRole('region', { name: 'Upcoming events' });
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// An event's title in the list (its accessible name adds "(opens in new tab)").
const event = (page, title) => list(page).getByRole('heading', { name: new RegExp(`^${escape(title)}`) });
const chip =(page, name) => page.getByRole('group', { name: 'Filter by group' }).getByRole('button', { name: new RegExp(`^${name}\\b`) });

test('a chip filters the list and updates the URL', async ({ page }) => {
  await page.goto('/');
  await chip(page, 'Web Geeks').click();

  await expect(page).toHaveURL(/\?group=webgeeks$/);
  await expect(chip(page, 'Web Geeks')).toHaveAttribute('aria-pressed', 'true');
  await expect(event(page, 'Coding Dojo')).toBeVisible();
  await expect(event(page, 'Python Office Hours')).toBeHidden();
  await expect(page.getByRole('status')).toHaveText('Showing 1 event from Web Geeks');
  await expect(page.getByText('Showing only DSM Web Geeks.')).toBeVisible();

  await page.getByRole('button', { name: 'Show all groups' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(chip(page, 'All groups')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 'All groups')).toBeFocused();
  await expect(event(page, 'Python Office Hours')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Showing 7 events');
});

test('Back and Forward step through filters', async ({ page }) => {
  await page.goto('/');
  await chip(page, 'Web Geeks').click();
  await chip(page, 'Pyowa').click();
  await expect(page).toHaveURL(/\?group=pyowa$/);
  await expect(event(page, 'Coding Dojo')).toBeHidden();

  await page.goBack();
  await expect(page).toHaveURL(/\?group=webgeeks$/);
  await expect(chip(page, 'Web Geeks')).toHaveAttribute('aria-pressed', 'true');
  await expect(event(page, 'Coding Dojo')).toBeVisible();
  await expect(event(page, 'Python Office Hours')).toBeHidden();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(event(page, 'Python Office Hours')).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\?group=webgeeks$/);
  await expect(event(page, 'Python Office Hours')).toBeHidden();
});

test('a group link on a row filters to that group', async ({ page }) => {
  await page.goto('/');
  await list(page).getByRole('listitem').filter({ hasText: 'Joint night' }).getByRole('link', { name: 'IADNUG', exact: true }).click();
  await expect(page).toHaveURL(/\?group=iadnug$/);
  await expect(event(page, 'Joint night - JVM vs. CLR')).toBeVisible();
  await expect(event(page, 'Coding Dojo')).toBeHidden();
});

test('unknown groups and impossible dates in the URL are ignored', async ({ page }) => {
  await page.goto('/?group=constructor');
  await expect(chip(page, 'All groups')).toHaveAttribute('aria-pressed', 'true');
  await expect(event(page, 'Coding Dojo')).toBeVisible();

  await page.goto('/?view=calendar&day=2026-13-45');
  await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wednesday, October 14' })).toBeVisible();
});
