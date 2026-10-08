// Layout shift, the iOS install hint, the theme button, ended events in the
// day panel, empty searches, landscape phones and the calendar's date range.
import { test, expect } from './fixtures.mjs';

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1';
const INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone14,5; iOS 18_0; en_US)';

// Sum of layout shifts while the web fonts are held back, then let in.
async function clsWithSlowFonts(page, url) {
  let release;
  const gate = new Promise((r) => { release = r; });
  await page.route('**/*.woff2', async (route) => { await gate; await route.continue(); });
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const before = await page.locator('.mast').evaluate((el) => el.offsetHeight);
  release();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const after = await page.locator('.mast').evaluate((el) => el.offsetHeight);
  return { cls: await page.evaluate(() => window.__cls), before, after };
}

test.describe('layout shift while fonts load', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'layout-shift entries are Chromium-only');
  for (const url of ['/', '/?view=calendar']) {
    test(`${url} barely moves when the fonts arrive`, async ({ page }) => {
      const { cls, before, after } = await clsWithSlowFonts(page, url);
      expect(after, 'masthead height on the fallback faces').toBe(before);
      expect(cls).toBeLessThan(0.05);
    });
  }
});

test.describe('iOS install hint', () => {
  test.use({ userAgent: SAFARI });

  test('shows from the second visit, keeps the footer clear and stays dismissed', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.locator('#install-hint')).toBeHidden();

    // A new visit is a new browser session (sessionStorage is per tab).
    const again = await context.newPage();
    await again.clock.install({ time: new Date('2026-10-14T14:00:00Z') });
    await again.goto('/');
    const hint = again.locator('#install-hint');
    await expect(hint).toBeVisible();

    // Scrolled to the bottom, every footer link can be tapped.
    await again.evaluate(() => scrollTo(0, document.body.scrollHeight));
    for (const name of ['About this site', 'Add your group or event']) {
      const clear = await again.getByRole('link', { name }).evaluate((a) => {
        const b = a.getBoundingClientRect();
        return a.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2));
      });
      expect(clear, `${name} is not under the hint`).toBe(true);
    }

    await hint.getByRole('button', { name: 'Dismiss' }).click();
    await expect(hint).toBeHidden();
    await expect(again.locator('html')).not.toHaveClass(/has-hint/);
    await again.reload();
    await expect(hint).toBeHidden();
    await again.close();
  });
});

for (const [name, ua] of [['Chrome on iOS', CHROME_IOS], ['an in-app browser', INSTAGRAM]]) {
  test.describe(`no install hint in ${name}`, () => {
    test.use({ userAgent: ua });
    test('even on a later visit', async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('visits', '5'));
      await page.goto('/');
      await expect(page.locator('#install-hint')).toBeHidden();
    });
  });
}

for (const scheme of ['light', 'dark']) {
  test(`every tap of the theme button changes the page (${scheme} device)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    const theme = page.getByRole('button', { name: /^Theme:/ });
    const paper = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const opposite = scheme === 'light' ? 'dark' : 'light';
    const start = await paper();

    await theme.click();
    await expect(theme).toHaveAccessibleName(`Theme: ${opposite}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', opposite);
    expect(await paper()).not.toBe(start);

    await theme.click();
    await expect(theme).toHaveAccessibleName('Theme: auto');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    expect(await paper()).toBe(start);
  });
}

test('a saved choice that matches the device flips on the first tap', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('theme', 'light'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Theme: light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the day panel reads ended events as past', async ({ page }) => {
  // Sep 21: IADNUG's Minimal APIs, 18 went.
  await page.goto('/?view=calendar&day=2026-09-21');
  const panel = page.locator('#day-panel');
  await expect(panel.getByRole('heading', { name: 'Monday, September 21' })).toBeVisible();
  await expect(panel.locator('.going')).toHaveText(/\d+\s*went/);
  await expect(panel.getByRole('link', { name: /RSVP/ })).toHaveCount(0);
  await expect(panel.getByRole('link', { name: /Minimal APIs/ })).toBeVisible();

  // An upcoming day keeps its RSVP button.
  await page.goto('/?view=calendar&day=2026-10-20');
  await expect(panel.getByRole('heading', { name: 'Tuesday, October 20' })).toBeVisible();
  await expect(panel.getByRole('link', { name: /RSVP/ }).first()).toBeVisible();
});

for (const q of ['🎉', '"', '-', '...']) {
  test(`searching only "${q}" finds nothing and says so`, async ({ page }) => {
    await page.goto(`/?q=${encodeURIComponent(q)}`);
    await expect(page.locator('#list-empty')).toBeVisible();
    await expect(page.locator('#list-empty')).toContainText('coming up or past');
    await expect(page.locator('#list-view .show:visible')).toHaveCount(0);

    await page.locator('#q').fill(`${q}${q}`);
    await expect(page.getByRole('status')).toHaveText(`Nothing matches '${q}${q}', coming up or past`);
  });
}

test('This week shows on a phone held sideways', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await expect(page.locator('#headliners')).toBeVisible();
  const head = await page.getByRole('heading', { name: 'This week' }).boundingBox();
  expect(head.y + head.height).toBeLessThanOrEqual(390);
});

test('the calendar stops at the months the data covers', async ({ page }) => {
  // Fixture data runs from September 2026 to January 2027.
  await page.goto('/?view=calendar&day=1999-01-01');
  await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();

  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.getByRole('heading', { name: 'September 2026' })).toBeVisible();
  const prev = page.getByRole('button', { name: 'No listings before September 2026' });
  await expect(prev).toHaveAttribute('aria-disabled', 'true');
  await expect(prev).toBeFocused();
  await prev.dispatchEvent('click'); // Playwright won't click an aria-disabled button; a tap still lands on it
  await expect(page.getByRole('heading', { name: 'September 2026' })).toBeVisible();
  // August days in the first row can't be picked either.
  await expect(page.locator('.day[data-day="2026-08-31"]')).toBeDisabled();

  await page.goto('/?view=calendar&day=2027-01-14');
  await expect(page.getByRole('heading', { name: 'January 2027' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nothing listed after January 2027' })).toHaveAttribute('aria-disabled', 'true');
});
