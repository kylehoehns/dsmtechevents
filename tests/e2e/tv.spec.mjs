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
