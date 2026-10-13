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

test('About opened near the bottom of the screen scrolls its photo up, words under it', async ({ page }) => {
  await page.goto('/');
  const about = dojo(page).getByRole('button', { name: 'About Coding Dojo' });
  // End the screen just under the button, where the photo alone would fill
  // what's left. (The row is the first one, so scrolling can't put it there.)
  const { y, height } = await about.boundingBox();
  await page.setViewportSize({ width: page.viewportSize().width, height: Math.ceil(y + height + 4) });
  await about.click();
  // The scroll is smooth and starts once the panel has opened.
  const photo = dojo(page).getByRole('img', { name: 'Event image for Coding Dojo' });
  await expect.poll(async () => (await photo.boundingBox()).y).toBeLessThan(40);
  await expect(dojo(page).getByText('Bring a laptop.')).toBeInViewport();
});

test('About with its words already on screen leaves the page where it is', async ({ page }) => {
  await page.goto('/');
  await dojo(page).getByRole('button', { name: 'About Coding Dojo' }).click();
  await expect(dojo(page)).not.toHaveAttribute('data-animating');
  await expect(dojo(page).getByText('Bring a laptop.')).toBeInViewport();
  expect(await page.evaluate(() => scrollY)).toBe(0);
});
