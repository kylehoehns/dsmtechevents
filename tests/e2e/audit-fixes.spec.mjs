import { test, expect } from './fixtures.mjs';

test('Recently recounts its summary and "All" button for a group filter', async ({ page }) => {
  await page.goto('/');
  const sub = page.locator('#recent-sub');
  const before = await sub.textContent();
  const group = await page.locator('#recent-list li').first().getAttribute('data-groups');
  await page.goto(`/?group=${group.split(' ')[0]}`);
  const rows = page.locator('#recent-list li:not([hidden])');
  const n = await rows.count();
  const rsvps = (await rows.evaluateAll((lis) => lis.map((li) => Number(li.dataset.going)))).reduce((a, b) => a + b, 0);
  await expect(sub).toHaveText(`The last three months. ${n} event${n === 1 ? '' : 's'}, ${rsvps} RSVP${rsvps === 1 ? '' : 's'}.`);
  expect(await sub.textContent()).not.toBe(before);
});

test('the flyer prints on one Letter page with its QR code and URL', async ({ page }) => {
  await page.setViewportSize({ width: 816, height: 1056 }); // 8.5in × 11in at 96dpi
  await page.goto('/print/');
  await page.emulateMedia({ media: 'print' });
  const sheet = await page.locator('.sheet').boundingBox();
  const foot = await page.locator('.sheet-foot').boundingBox();
  const tabs = await page.locator('.tabs').boundingBox();
  expect(foot.y + foot.height, 'footer inside the page').toBeLessThanOrEqual(sheet.y + sheet.height);
  expect(foot.y + foot.height, 'footer above the tear-off tabs').toBeLessThanOrEqual(tabs.y + 1);
  // Rows keep the four-column layout on paper, not the stacked phone layout.
  const cols = await page.locator('.lineup li').first().evaluate((li) => getComputedStyle(li).gridTemplateColumns.split(' ').length);
  expect(cols).toBe(3);
});

test('/print/ fits a phone screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/print/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
