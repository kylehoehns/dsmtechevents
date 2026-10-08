import { test, expect } from './fixtures.mjs';

// Outbound clicks send one beacon to /api/click (docs/ANALYTICS.md). The
// links themselves are stopped here so no tab opens to Meetup.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.addEventListener('click', (ev) => ev.preventDefault(), true));
});

const beacons = (page) => {
  const sent = [];
  page.route('**/api/click', (route) => { sent.push(JSON.parse(route.request().postData())); route.fulfill({ status: 204 }); });
  return sent;
};

test('an RSVP click sends its kind, host groups and event, and nothing else', async ({ page }) => {
  const sent = beacons(page);
  await page.goto('/');
  const card = page.locator('.show:has([data-click="rsvp"])').first();
  const [id, groups] = [await card.getAttribute('data-id'), await card.getAttribute('data-groups')];
  await card.locator('[data-click="rsvp"]').click();
  await expect.poll(() => sent).toEqual([{ kind: 'rsvp', groups: groups.split(' '), event: id }]);
});

test('a joint meetup credits every host, and plain UI clicks send nothing', async ({ page }) => {
  const sent = beacons(page);
  await page.goto('/');
  await page.goto('/?group=pyowa');
  await page.getByRole('button', { name: 'Show all groups' }).click();
  const joint = page.locator('.show[data-groups*=" "] [data-click="title"]').first();
  await joint.click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].kind).toBe('title');
  expect(sent[0].groups.length).toBeGreaterThan(1);
});

test('Groups page links count as meetup or website for that group', async ({ page }) => {
  const sent = beacons(page);
  await page.goto('/groups/');
  const flyer = page.locator('article.flyer:has([data-click="meetup"])').first();
  await flyer.locator('[data-click="meetup"]').click();
  await expect.poll(() => sent).toEqual([{ kind: 'meetup', groups: [await flyer.getAttribute('id')], event: '' }]);
});
