// Big text: people who zoom in or raise their browser's default text size.
// WCAG 1.4.10 asks for no sideways scrolling at 320 CSS px wide (a 1280
// screen at 400%, or a phone zoomed in). body clips sideways overflow, so
// instead of checking the page's scroll width we look for anything that
// sticks out past the edge and would be cut off. The headliner posters are
// the one deliberate sideways scroller, so they're skipped.
import { test, expect } from './fixtures.mjs';

const VIEWS = [
  ['/', null],
  ['/', (page) => page.getByRole('button', { name: 'Search events' }).click()],
  ['/?group=pyowa', null],
  ['/?view=calendar', (page) => page.getByRole('button', { name: /^Thursday, October 22,/ }).click()],
  ['/groups/', null],
  ['/about/', null],
  ['/add/', null],
  ['/404', null],
];

const stickingOut = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('.headliners, .sr-only, script, style')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
    if (r.left < -1 || r.right > vw + 1) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}: ${Math.round(r.left)}–${Math.round(r.right)}px`);
  }
  return { scroll: document.documentElement.scrollWidth - vw, out: out.slice(0, 10) };
});

async function check(page, path, open) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  if (open) await open(page);
  await page.evaluate(() => document.fonts.ready);
  expect(await stickingOut(page), `${path} at ${page.viewportSize().width}px`).toEqual({ scroll: 0, out: [] });
}

test.describe('320px wide', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  for (const [path, open] of VIEWS) {
    test(`${path}${open ? ' (opened)' : ''} fits without sideways scrolling`, async ({ page }) => {
      await check(page, path, open);
    });
  }
});

// The type scale is in rem, so a reader who sets their browser's default text
// size to 24px ("very large") gets 1.5× text, and the phone layout still fits.
test.describe('24px default text size', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const [path, open] of VIEWS) {
    test(`${path}${open ? ' (opened)' : ''} grows and still fits`, async ({ page }) => {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Page.setFontSizes', { fontSizes: { standard: 24, fixed: 24 } });
      await check(page, path, open);
      // Body text is 15px at the default 16px, so 22.5px here.
      expect(await page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe('22.5px');
    });
  }
});

// WCAG 1.4.12: readers who widen letter, word and line spacing (the usual
// bookmarklet) must not lose anything. Before, the logo pushed the search and
// theme buttons off the right edge.
test.describe('320px wide with wider text spacing', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  for (const [path, open] of VIEWS) {
    test(`${path}${open ? ' (opened)' : ''} still fits`, async ({ page }) => {
      await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }';
        document.head.append(s);
      }));
      await check(page, path, open);
    });
  }
});
