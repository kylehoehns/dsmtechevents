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
