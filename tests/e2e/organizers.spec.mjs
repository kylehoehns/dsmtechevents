// /organizers/: the TV screen builder and the badge kit.
import { test, expect } from './fixtures.mjs';

const row = (page, kind) => page.locator(`.slide-row[data-kind="${kind}"]`);
const link = (page) => page.locator('#b-url');

test('picking an event and typing builds the screen link', async ({ page, baseURL }) => {
  await page.goto('/organizers/');
  await page.getByLabel('Your event', { exact: true }).selectOption({ label: 'Web Geeks: Coding Dojo, Wed Oct 14' });
  await expect(link(page)).toHaveText(`${baseURL}/tv/?event=webgeeks-tonight&slides=event,next-all`);

  await row(page, 'welcome').getByRole('checkbox').check();
  await page.getByLabel('Message', { exact: true }).fill('Hi & welcome <3');
  await row(page, 'wifi').getByRole('checkbox').check();
  await page.getByLabel('Network name').fill('Guest Net');
  await page.getByLabel(/^Password/).fill('p;w');
  await row(page, 'agenda').getByRole('checkbox').check();
  await page.getByLabel(/One item per line/).fill('Pizza\nTalks');
  await page.getByLabel('Plain transitions, for a slow TV stick').check();
  const url = `${baseURL}/tv/?event=webgeeks-tonight&slides=event,welcome,agenda,wifi,next-all&welcome=Hi%20%26%20welcome%20%3C3&agenda=Pizza%7CTalks&wifi=Guest%20Net&wifipass=p%3Bw&fx=off`;
  await expect(link(page)).toHaveText(url);
  await expect(page.getByRole('link', { name: /Open preview/ })).toHaveAttribute('href', url);
});

test('Up and Down reorder the slides, and the link follows', async ({ page }) => {
  await page.goto('/organizers/');
  await page.getByLabel('Your event', { exact: true }).selectOption({ label: 'Web Geeks: Coding Dojo, Wed Oct 14' });
  await row(page, 'next-group').getByRole('checkbox').check();
  await expect(link(page)).toContainText('slides=event,next-group,next-all');
  await page.getByRole('button', { name: 'Move Up next: all groups up' }).click();
  await expect(link(page)).toContainText('slides=event,next-all,next-group');
  await expect(page.getByRole('button', { name: 'Move Up next: all groups up' })).toBeFocused();
  // past the four unticked host slides and Up next
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Move The event down' }).click();
  await expect(link(page)).toContainText('slides=next-all,event,next-group');
});

test('a joint event offers a choice of group for its next meetup', async ({ page }) => {
  await page.goto('/organizers/');
  await page.getByLabel('Your event', { exact: true }).selectOption({ label: 'CIJUG + IADNUG: Joint night - JVM vs. CLR, Tue Oct 20' });
  await row(page, 'next-group').getByRole('checkbox').check();
  await page.getByLabel('Which group').selectOption({ label: 'IADNUG' });
  await expect(link(page)).toContainText('slides=event,next-group,next-all&group=iadnug');
});

test('copies the screen link and the badge snippets', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/organizers/');
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
