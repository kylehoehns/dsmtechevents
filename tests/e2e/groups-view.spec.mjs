// The Groups tab on the home page (?view=groups): switched to in place, like
// the calendar, with the same cards as /groups/ (src/components/GroupBoard.astro).
import { test, expect } from './fixtures.mjs';

const nav = (page, name) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true });

test('the Groups tab switches in place and Back returns to the list', async ({ page }) => {
  await page.goto('/');
  await nav(page, 'Groups').click();
  await expect(page).toHaveURL(/\/\?view=groups$/);
  await expect(nav(page, 'Groups')).toHaveAttribute('aria-current', 'page');
  const groupsView = page.getByRole('region', { name: 'Groups' });
  await expect(groupsView.locator('article#cijug')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Upcoming events' })).toBeHidden();
  await expect(page.locator('#minical')).toBeHidden();
  await expect(page).toHaveTitle(/^Groups · /);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('region', { name: 'Upcoming events' })).toBeVisible();
  await expect(nav(page, 'Events')).toHaveAttribute('aria-current', 'page');
});

test("a group card's See events switches to that group's list", async ({ page }) => {
  await page.goto('/?view=groups');
  await expect(nav(page, 'Groups')).toHaveAttribute('aria-current', 'page');
  await page.locator('#groups-view article#cijug').getByRole('link', { name: 'See events from CIJUG' }).click();
  await expect(page).toHaveURL(/\/\?group=cijug$/);
  await expect(page.locator('#filter-note')).toContainText('Central Iowa Java Users Group');
  await page.goBack();
  await expect(page).toHaveURL(/\?view=groups$/);
  await expect(page.locator('#groups-view article#cijug')).toBeVisible();
});

test('the /groups/ page prints the same cards', async ({ page }) => {
  await page.goto('/groups/');
  const onPage = await page.locator('article.flyer').evaluateAll((els) => els.map((e) => e.id));
  await page.goto('/?view=groups');
  expect(await page.locator('#groups-view article.flyer').evaluateAll((els) => els.map((e) => e.id))).toEqual(onPage);
});

test('quick clicks between tabs all land, even mid-swipe', async ({ page }) => {
  await page.goto('/');
  // Click by position, 120ms apart, the way a quick human does: each lands
  // while the last swipe is still playing (Playwright's own click would wait
  // for the transition's snapshot layer to clear first).
  const at = async (name) => { const b = await nav(page, name).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const spots = { Events: await at('Events'), Calendar: await at('Calendar'), Groups: await at('Groups') };
  for (const name of ['Calendar', 'Groups', 'Events', 'Groups']) {
    await page.mouse.click(...spots[name]);
    await page.waitForTimeout(120);
  }
  await expect(page).toHaveURL(/\?view=groups$/);
  await expect(nav(page, 'Groups')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#groups-view')).toBeVisible();
});
