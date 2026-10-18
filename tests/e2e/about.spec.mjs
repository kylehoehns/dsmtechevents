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

// Opens the row's About once to measure the panel, closes it, then ends the
// screen `below(panel)` px under the button, where `panel` has the open
// panel's height and where its words start. (The rows are near the top, so
// scrolling can't put them low on the screen; a shorter screen can.)
async function endScreenUnder(page, row, about, below) {
  await about.click();
  await expect(row).not.toHaveAttribute('data-animating');
  const desc = await row.locator('.desc').boundingBox();
  const words = await row.locator('.desc p').first().boundingBox();
  await about.click();
  await expect(row).not.toHaveAttribute('data-animating');
  const { y, height } = await about.boundingBox();
  const panel = { height: desc.height, wordsAt: words.y - desc.y };
  await page.setViewportSize({ width: page.viewportSize().width, height: Math.ceil(y + height + below(panel)) });
}

// The scroll is smooth and starts once the panel has opened. A panel taller
// than the screen can't all show; it starts at the top instead.
async function expectWholePanelShown(page, row) {
  await expect(row).not.toHaveAttribute('data-animating');
  await expect
    .poll(async () => {
      const { y, height } = await row.locator('.desc').boundingBox();
      return y >= 0 && (y + height <= page.viewportSize().height || y <= 13);
    })
    .toBe(true);
}

test('About opened at the bottom of the screen scrolls the whole panel into view', async ({ page }) => {
  await page.goto('/');
  const about = dojo(page).getByRole('button', { name: 'About Coding Dojo' });
  await endScreenUnder(page, dojo(page), about, () => 4);
  await about.click();
  await expectWholePanelShown(page, dojo(page));
});

test('About whose photo fits but whose words run off the screen scrolls them into view', async ({ page }) => {
  await page.goto('/');
  const about = dojo(page).getByRole('button', { name: 'About Coding Dojo' });
  // The photo and the first couple of lines show; the rest is below.
  await endScreenUnder(page, dojo(page), about, ({ wordsAt }) => wordsAt + 60);
  await about.click();
  await expectWholePanelShown(page, dojo(page));
});

test('About scrolls in small steps while the panel grows, not after', async ({ page }) => {
  await page.goto('/');
  const about = dojo(page).getByRole('button', { name: 'About Coding Dojo' });
  await endScreenUnder(page, dojo(page), about, () => 4);
  // Each frame: is the panel still growing, and where is the page?
  const recording = await page.evaluateHandle(() => {
    const frames = [];
    const f = () => {
      const desc = document.querySelector('.show[data-animating] .desc');
      frames.push({ growing: !!desc?.getAnimations().length, y: scrollY });
      if (frames.length < 60) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
    return frames;
  });
  await about.click();
  await expectWholePanelShown(page, dojo(page));
  // Measured from where the page was when the panel started opening (a tap
  // can nudge the page first).
  const frames = await recording.jsonValue();
  const start = frames.find((f) => f.growing).y;
  const end = frames.at(-1).y;
  const between = new Set(frames.filter((f) => f.y > start && f.y < end).map((f) => f.y));
  expect(between.size).toBeGreaterThan(3);
  expect(frames.some((f) => f.growing && f.y > start)).toBe(true);
});

test('About with no photo scrolls into view too', async ({ page }) => {
  await page.goto('/');
  const row = page.getByRole('region', { name: 'Upcoming events' }).getByRole('listitem').filter({ hasText: 'Joint night' });
  const about = row.getByRole('button', { name: /^About Joint night/ });
  await endScreenUnder(page, row, about, ({ height }) => height / 3);
  await about.click();
  await expectWholePanelShown(page, row);
});

test('About that fits on the screen leaves the page where it is', async ({ page }) => {
  await page.setViewportSize({ width: page.viewportSize().width, height: 1400 });
  await page.goto('/');
  await dojo(page).getByRole('button', { name: 'About Coding Dojo' }).click();
  await expect(dojo(page)).not.toHaveAttribute('data-animating');
  await expect(dojo(page).locator('.desc')).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => scrollY)).toBe(0);
});
