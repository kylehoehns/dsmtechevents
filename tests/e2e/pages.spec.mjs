// The Groups and Add pages, and the theme button every page shares.
import { test, expect } from './fixtures.mjs';

test('groups page lists every active group alphabetically, and hides quiet ones', async ({ page }) => {
  await page.goto('/groups/');
  // UX hasn't met since 2024 and has nothing coming up, so it's hidden.
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([/^AWS/, /^CIJUG/, /^DevOps/, /^DSM AI/, /^IADNUG/, /^Mobile/, /^Pyowa/, /^Web Geeks/]);
  // A group that met recently but has nothing posted still gets a card.
  await expect(page.locator('article#mobile')).toContainText('Nothing scheduled');
});

test('a group back after a quiet year says "Back!" once on its card and once on its next event', async ({ page }) => {
  await page.goto('/groups/');
  await expect(page.locator('.back-tag')).toHaveCount(1);
  await expect(page.locator('article#devopsdsm h2 .back-tag')).toHaveText('Back!');

  await page.goto('/');
  const card = page.locator('#list-view .show', { hasText: 'Remote DevOps Chat' });
  await expect(card.locator('.back-tag')).toHaveText('Back!');
  await expect(page.locator('#list-view .back-tag')).toHaveCount(1);
  // A group that never went quiet gets no tag.
  await expect(page.locator('#list-view .show', { hasText: 'Coding Dojo' }).locator('.back-tag')).toHaveCount(0);
});

test('status page lists every group, quiet ones included, with source and health', async ({ page }) => {
  await page.goto('/status/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  const row = (name) => page.locator('.sources li', { has: page.getByRole('heading', { name: new RegExp(`^${name}`) }) });
  await expect(page.locator('.sources li')).toHaveCount(9);
  await expect(row('UX')).toContainText('Quiet');
  await expect(row('UX').getByRole('link')).toHaveCount(0); // no Groups card to link to
  await expect(row('AWS')).toContainText('Partial since Oct 12');
  await expect(row('Pyowa')).toContainText('Healthy');
  await expect(row('Pyowa')).toContainText('Meetup · changed Oct 14 · 1 coming up');
  await expect(page.getByText('most recently on Oct 14')).toBeVisible();
});

test('the about page links to the status page', async ({ page }) => {
  await page.goto('/about/');
  await page.getByRole('link', { name: "see each source's status" }).click();
  await expect(page).toHaveURL(/\/status\/$/);
});

test('a link to /groups/#id highlights that group', async ({ page }) => {
  await page.goto('/groups/#pyowa');
  const outline = (id) => page.locator(`article#${id}`).evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(await outline('pyowa')).toBe('solid');
  expect(await outline('cijug')).toBe('none');
  await page.locator('article#pyowa').getByRole('link', { name: '1 event from Pyowa' }).click();
  await expect(page).toHaveURL(/\/\?group=pyowa$/);
});

test('add page copies the email address', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/add/');
  await page.getByRole('button', { name: 'Copy address' }).click();
  await expect(page.getByRole('status')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('hello@dsmtechevents.com');
});

test('theme button remembers the choice', async ({ page }) => {
  // Light device: auto, then dark, then back to auto (frontend-fixes.spec.mjs covers every tap flipping).
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const html = page.locator('html');
  const theme = page.getByRole('button', { name: /^Theme:/ });
  await expect(theme).toHaveAccessibleName('Theme: auto');

  await theme.click();
  await expect(theme).toHaveAccessibleName('Theme: dark');
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(theme).toHaveAccessibleName('Theme: dark');
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await theme.click();
  await expect(theme).toHaveAccessibleName('Theme: auto');
  await expect(html).not.toHaveAttribute('data-theme');
  await page.reload();
  await expect(theme).toHaveAccessibleName('Theme: auto');
  await expect(html).not.toHaveAttribute('data-theme');
});

test('the footer links to the organizers page, which links the TV and print pages', async ({ page }) => {
  await page.goto('/about/');
  await page.getByRole('contentinfo').getByRole('link', { name: 'For organizers' }).click();
  await expect(page).toHaveURL(/\/organizers\/$/);
  await expect(page.getByRole('link', { name: 'The regular TV page' })).toHaveAttribute('href', '/tv/');
  await expect(page.getByRole('link', { name: 'Print a flyer' })).toHaveAttribute('href', '/print/');
});

// The pages are built in the morning; the Coding Dojo, Web Geeks' only
// upcoming event, runs 5:30-7:30p.
test('a group card catches up once its next event is over', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-10-15T00:20:00Z')); // 7:20p
  await page.goto('/groups/');
  const card = page.locator('article#webgeeks');
  await expect(card.locator('.next:visible')).toContainText('Next: Wed Oct 14, Coding Dojo');
  await expect(card.locator('.last:visible')).toHaveText('Last event Oct 5 · 37 went');
  await expect(card.getByRole('link', { name: '1 event from Web Geeks' })).toBeVisible();

  await page.clock.runFor('15:00'); // left open past 7:30p
  await expect(card.locator('.next')).toHaveText("Nothing scheduledCheck their page for what's next.");
  await expect(card.locator('.last')).toHaveText('Last event Oct 14 · 12 went');
  await expect(card.getByRole('link', { name: 'Past events from Web Geeks' })).toBeVisible();
  await expect(card.getByRole('link', { name: '1 event from Web Geeks' })).toHaveCount(0);
  // Pyowa's lunch tomorrow is still next.
  await expect(page.locator('article#pyowa .next:visible')).toContainText('Python Office Hours');
});

test('status counts catch up on a page opened the next day', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T14:00:00Z')); // Thursday 9am
  await page.goto('/status/');
  const count = (name) => page.locator('.sources li', { has: page.getByRole('heading', { name: new RegExp(`^${name}`) }) }).locator('.facts span:visible');
  await expect(count('Web Geeks')).toHaveText('0 coming up');
  await expect(count('Pyowa')).toHaveText('1 coming up');
});
