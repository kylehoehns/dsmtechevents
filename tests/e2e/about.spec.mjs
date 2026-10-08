// The About toggle on an event row (photo + description).
import { test, expect } from './fixtures.mjs';

const dojo = (page) => page.getByRole('region', { name: 'Upcoming events' }).getByRole('listitem').filter({ hasText: 'Coding Dojo' });

test('About opens and closes the description and photo', async ({ page }) => {
  await page.goto('/');
  const about = dojo(page).getByRole('button', { name: 'About Coding Dojo' });
  await expect(about).toHaveAttribute('aria-expanded', 'false');
  await expect(dojo(page).getByText('Bring a laptop.')).toBeHidden();

  await about.click();
  await expect(about).toHaveAttribute('aria-expanded', 'true');
  await expect(dojo(page).getByText('Bring a laptop.')).toBeVisible();
  await expect(dojo(page).getByRole('img', { name: 'Event image for Coding Dojo' })).toBeVisible();
  // The flying copy of the photo is cleaned up once it lands. Clicks during
  // the animation are ignored, so wait for it before closing.
  await expect(page.locator('.about-ghost')).toHaveCount(0);
  await expect(dojo(page)).not.toHaveAttribute('data-animating');

  await about.click();
  await expect(about).toHaveAttribute('aria-expanded', 'false');
  await expect(dojo(page).getByText('Bring a laptop.')).toBeHidden();
  await expect(page.locator('.about-ghost')).toHaveCount(0);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('About toggles at once, with no animation', async ({ page }) => {
    await page.goto('/');
    const about = dojo(page).getByRole('button', { name: 'About Coding Dojo' });
    await about.click();
    // Checked right after the click, without waiting: there is nothing to wait for.
    expect(await about.getAttribute('aria-expanded')).toBe('true');
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
    await expect(dojo(page).getByRole('img', { name: 'Event image for Coding Dojo' })).toBeVisible();
    await about.click();
    expect(await about.getAttribute('aria-expanded')).toBe('false');
  });
});
