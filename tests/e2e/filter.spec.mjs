// The group filter: group links, the URL, the screen-reader status line, Back/Forward.
import { test, expect } from './fixtures.mjs';

const list = (page) => page.getByRole('region', { name: 'Upcoming events' });
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// An event's title in the list (its accessible name adds "(opens in new tab)").
const event = (page, title) => list(page).getByRole('heading', { name: new RegExp(`^${escape(title)}`) });
// A group's name on an event row is the way into its filter (search covers the rest).
const groupLink = (page, eventText, name) => list(page).getByRole('listitem').filter({ hasText: eventText }).getByRole('link', { name, exact: true });

test('a group link filters the list, and the note offers the group and a way out', async ({ page }) => {
  await page.goto('/');
  await groupLink(page, 'Coding Dojo', 'Web Geeks').click();

  await expect(page).toHaveURL(/\?group=webgeeks$/);
  await expect(event(page, 'Coding Dojo')).toBeVisible();
  await expect(event(page, 'Python Office Hours')).toBeHidden();
  await expect(page.getByRole('status')).toHaveText('Showing 1 event from Web Geeks');
  await expect(page.getByText('Showing only DSM Web Geeks.')).toBeVisible();
  await expect(page.locator('#filter-note').getByRole('link', { name: 'About the group' })).toHaveAttribute('href', '/groups/#webgeeks');

  await page.getByRole('button', { name: 'Show all groups' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#filter')).toBeHidden();
  await expect(list(page)).toBeFocused();
  await expect(event(page, 'Python Office Hours')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Showing 7 events');
});

test('there is no group picker until a group is chosen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#filter')).toBeHidden();
  await expect(page.getByRole('group', { name: 'Filter by group' })).toHaveCount(0);
});

test('Back and Forward step through filters', async ({ page }) => {
  await page.goto('/');
  await groupLink(page, 'Coding Dojo', 'Web Geeks').click();
  await expect(page).toHaveURL(/\?group=webgeeks$/);
  await page.goto('/?group=pyowa');
  await expect(event(page, 'Coding Dojo')).toBeHidden();

  await page.goBack();
  await expect(page).toHaveURL(/\?group=webgeeks$/);
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
  await expect(page.locator('#filter')).toBeHidden();
  await expect(event(page, 'Coding Dojo')).toBeVisible();

  await page.goto('/?view=calendar&day=2026-13-45');
  await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wednesday, October 14' })).toBeVisible();
});
