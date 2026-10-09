// On a phone, the small controls take a tap anywhere in a box at least 44px
// tall (the touch rule in global.css), though they look the same size.
import { test, expect } from './fixtures.mjs';

test.skip(({ isMobile }) => !isMobile, 'phone only: desktop keeps its pointer-sized targets');

// How tall the area is that a tap lands on `el`: walk up and down from its
// middle while elementFromPoint still finds it (or something inside it).
async function tapHeight(loc) {
  return loc.evaluate((el) => {
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const hits = (y) => { const t = document.elementFromPoint(x, y); return !!t && el.contains(t); };
    let top = r.top + r.height / 2;
    let bottom = top;
    while (hits(top - 1)) top--;
    while (hits(bottom + 1)) bottom++;
    return Math.round(bottom - top + 1); // both ends are the last pixel that still hits
  });
}

const targets = {
  '/': ['#list-view .more', '#list-view .rsvp', '#list-view .band a'],
  '/groups/': ['.flyer h2 a', '.flyer .links a.btn-outline'],
  '/organizers/': ['#b-event', '[data-copy-from="add-email"]', '#b-copy', '.snippet [data-copy-from]'],
};

for (const [path, sels] of Object.entries(targets)) {
  test(`tap areas on ${path} are at least 44px tall`, async ({ page }) => {
    await page.goto(path);
    for (const sel of sels) expect(await tapHeight(page.locator(sel).first()), sel).toBeGreaterThanOrEqual(44);
  });
}

test('the bigger tap areas leave This week and its first event on the first screen', async ({ page }) => {
  await page.goto('/');
  const height = page.viewportSize().height;
  const head = await page.getByRole('heading', { name: 'This week' }).boundingBox();
  const first = await page.locator('#list-view .show').first().locator('.title').boundingBox();
  expect(head.y + head.height).toBeLessThan(height);
  expect(first.y + first.height).toBeLessThan(height);
});
