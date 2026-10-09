// The /tv/ lobby screen.
import { test, expect } from './fixtures.mjs';

const current = (page) => page.locator('.slide.is-on');

test('starts on the overview and steps through posters', async ({ page }) => {
  await page.goto('/tv/');
  await expect(current(page).getByRole('heading', { name: 'Coming up' })).toBeVisible();
  await expect(current(page)).toContainText('Coding Dojo');
  await expect(current(page)).toContainText('Test Conf 2026');

  await page.keyboard.press('ArrowRight');
  await expect(current(page).getByRole('heading', { name: 'Coding Dojo' })).toBeVisible();
  await expect(current(page)).toContainText('Tonight');
  await expect(current(page)).toContainText('Scan to RSVP');
  await expect(current(page).locator('.qr-code svg')).toBeVisible();

  await page.keyboard.press('ArrowLeft');
  await expect(current(page).getByRole('heading', { name: 'Coming up' })).toBeVisible();
});

test('the overview shows every day of a multi-day event, with its hours apart', async ({ page }) => {
  await page.goto('/tv/');
  const row = page.locator('.overview li', { hasText: 'Test Conf 2026' });
  await expect(row.locator('.row-date')).toHaveText('Thu–Fri Oct 22–23');
  await expect(row.locator('.row-time')).toHaveText('8a–5p');
  // Its poster prints THU 22 OCT big, so the time line adds only the last day.
  await expect(page.locator('.poster-slide', { hasText: 'Test Conf 2026' }).locator('.time')).toHaveText('through Fri Oct 23 · 8a–5p');
});

test('overview rows carry the Tonight / Happening now stamp, and a headliner poster its countdown', async ({ page }) => {
  await page.goto('/tv/?fx=off');
  const tag = (title) => page.locator('.overview li', { hasText: title }).locator('.when-tag');
  await expect(tag('Coding Dojo')).toHaveText('Tonight');
  await expect(tag('Python Office Hours')).toHaveText('Tomorrow');
  await expect(tag('Remote DevOps Chat')).toBeHidden();
  // Test Conf is 8 days out: its poster says so, like its poster on the home page.
  await expect(page.locator('.poster-slide.headliner', { hasText: 'Test Conf 2026' }).locator('.when-tag')).toHaveText('8 days out');

  await page.clock.fastForward('09:00:00'); // 6pm, Coding Dojo is on
  await page.keyboard.press('ArrowRight'); // the next slide change re-checks
  await expect(tag('Coding Dojo')).toHaveText('Happening now');
});

test('drops events once they have ended', async ({ page }) => {
  await page.goto('/tv/');
  await expect(page.locator('.slide', { hasText: 'Coding Dojo' })).toHaveCount(2); // overview row + poster

  // Coding Dojo ends at 7:30pm; jump to 9pm and move to the next slide.
  await page.clock.fastForward('12:00:00');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('Coding Dojo')).toHaveCount(0);
  await expect(page.locator('.overview')).toContainText('Python Office Hours');
});

test('asks the browser to keep the screen awake, and again when the tab comes back', async ({ page }) => {
  await page.addInitScript(() => {
    window.__locks = 0;
    Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => { window.__locks++; return { release: async () => {} }; } } });
  });
  await page.goto('/tv/');
  await expect.poll(() => page.evaluate(() => window.__locks)).toBe(1);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => page.evaluate(() => window.__locks)).toBe(2);
});

test('slides are screen-printed in, and still step through', async ({ page }) => {
  await page.goto('/tv/');
  await expect(page.locator('.tv')).toHaveAttribute('data-fx', 'print');
  await page.keyboard.press('ArrowRight');
  await expect(current(page).getByRole('heading', { name: 'Coding Dojo' })).toBeVisible();
  await expect(page.locator('.slide.was-on')).toHaveClass(/overview/); // the old slide lingers for the wipe
  await page.clock.runFor(2000);
  await expect(page.locator('.slide.was-on')).toHaveCount(0);
});

test('?fx=off, or reduced motion, keeps the plain swap', async ({ page }) => {
  await page.goto('/tv/?fx=off');
  await expect(page.locator('.tv')).not.toHaveAttribute('data-fx');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tv/');
  await expect(page.locator('.tv')).not.toHaveAttribute('data-fx');
});

test.describe('on a portrait screen', () => {
  test.use({ viewport: { width: 1080, height: 1920 } });

  test('the poster stacks inside the screen, under the clock', async ({ page }) => {
    await page.goto('/tv/');
    await page.keyboard.press('ArrowRight');
    await expect(current(page).getByRole('heading', { name: 'Coding Dojo' })).toBeVisible();
    await page.clock.runFor(2000); // let the screen-print entrance finish
    const header = await page.locator('.tv-top').boundingBox();
    for (const sel of ['.date-block', '.hosts', 'h2', '.time', '.where', '.qr']) {
      const b = await page.locator(`.slide.is-on ${sel}`).boundingBox();
      expect(b.y, `${sel} below the header`).toBeGreaterThanOrEqual(header.y + header.height);
      expect(b.x + b.width, `${sel} inside the screen`).toBeLessThanOrEqual(1080);
      expect(b.y + b.height, `${sel} above the bottom`).toBeLessThanOrEqual(1920);
    }
  });
});
