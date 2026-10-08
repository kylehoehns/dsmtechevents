// Event mode on the lobby TV: /tv/?event=<id>, one event, then what's next.
// The example is CIJUG's joint night with IADNUG, Tue Oct 20, 5:30p–7:30p.
// Each test sets the clock to 9am that day (the site was built Oct 14, 9am).
import { test as base, expect } from './fixtures.mjs';

const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.setSystemTime(new Date('2026-10-20T14:00:00Z'));
    await use(page);
  },
});

const EVENT = 'cijug-joint';
const current = (page) => page.locator('.slide.is-on');
const kinds = (page) => page.locator('.tv-stage > .slide').evaluateAll((els) => els.map((el) => [...el.classList].find((c) => c.startsWith('ev-') && c !== 'ev-slide')));

test("CIJUG's event: title, lineup and a QR code to RSVP, then the two Up next slides", async ({ page }) => {
  await page.goto(`/tv/?event=${EVENT}`);
  expect(await kinds(page)).toEqual(['ev-event', 'ev-next-group', 'ev-next-all']);
  const slide = current(page);
  await expect(slide).toHaveClass(/ev-event/);
  await expect(slide.getByRole('heading', { name: 'Joint night - JVM vs. CLR' })).toBeVisible();
  await expect(slide.locator('.hosts')).toHaveText('CIJUG + IADNUG');
  await expect(slide.locator('.where')).toContainText('Court Avenue Hub');
  await expect(slide.locator('.ev-lineup li')).toHaveText(['5:45pRecords on the JVM — Sam Lee', '6:30pRecords in C# — Ana Ruiz']);
  await expect(slide.locator('.qr-code svg')).toBeVisible();
  await expect(slide).toContainText('Scan to RSVP');
  // The regular rotation is gone.
  await expect(page.locator('.overview')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});

test("CIJUG's event counts down, says Happening now, then thanks everyone", async ({ page }) => {
  await page.goto(`/tv/?event=${EVENT}&fx=off`);
  const stamp = page.locator('.ev-event .ev-stamp');
  await expect(stamp).toHaveText('Tonight at 5:30p');
  await page.clock.fastForward('08:05:00'); // 5:05pm
  await expect(stamp).toHaveText('Starts in 25 min');
  await page.clock.fastForward('00:30:00'); // 5:35pm
  await expect(stamp).toHaveText('Happening now');
  await page.clock.fastForward('02:00:00'); // 7:35pm, over
  const slide = page.locator('.ev-event');
  await expect(slide.getByRole('heading', { name: 'Thanks for coming' })).toBeVisible();
  await expect(slide).toContainText("See what's next at dsmtechevents.com");
  await expect(slide.locator('.qr-code svg')).toBeVisible();
});

test("CIJUG's event slide stays up longer than the rest", async ({ page }) => {
  await page.goto(`/tv/?event=${EVENT}`);
  await page.clock.runFor(13_000);
  await expect(current(page)).toHaveClass(/ev-event/);
  await page.clock.runFor(12_000);
  await expect(current(page)).toHaveClass(/ev-next-group/);
  await page.keyboard.press('ArrowRight');
  await expect(current(page)).toHaveClass(/ev-next-all/);
  await page.keyboard.press('ArrowRight');
  await expect(current(page)).toHaveClass(/ev-event/);
});

test("Up next lists events after CIJUG's, by date, not CIJUG's own", async ({ page }) => {
  await page.goto(`/tv/?event=${EVENT}`);
  const rows = page.locator('.ev-next li');
  await expect(rows.locator('.row-title')).toHaveText(['Test Conf 2026', 'Remote DevOps Chat', 'AI Study Group', 're:Invent Recap']);
  await expect(rows.first()).toContainText('Thu Oct 22');
  await expect(rows.first().locator('.row-group')).toHaveText('Conference');
  await expect(page.locator('.ev-next-all .qr-code svg')).toBeAttached();
});

test('next-group: CIJUG has nothing after this, so it says where to watch', async ({ page }) => {
  await page.goto(`/tv/?event=${EVENT}`);
  const slide = page.locator('.ev-next-group');
  await expect(slide.locator('.ev-kicker')).toHaveText('Next CIJUG meetup');
  await expect(slide).toContainText('Watch for the next one');
  await expect(slide).toContainText('at dsmtechevents.com');
});

test("next-group shows a group's next meetup as a poster", async ({ page }) => {
  // CIJUG's fixture has only the one event, so DSM AI's monthly series stands in.
  await page.goto('/tv/?event=dsmai-nov');
  const slide = page.locator('.ev-next-group');
  await expect(slide.locator('.ev-kicker')).toHaveText('Next DSM AI meetup');
  await expect(slide.getByRole('heading', { name: 'AI Study Group' })).toBeAttached();
  await expect(slide.locator('.num')).toHaveText('10');
  await expect(slide.locator('.mon')).toHaveText('Dec');
});

test('an unknown event id says so, then carries on with the regular rotation', async ({ page }) => {
  await page.goto('/tv/?event=no-such-event');
  await expect(current(page).getByRole('heading', { name: "This event isn't on the calendar anymore" })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(current(page).getByRole('heading', { name: 'Coming up' })).toBeVisible();
});

test('the hourly reload keeps the query', async ({ page }) => {
  const path = `/tv/?event=${EVENT}&fx=off`;
  await page.goto(path);
  await page.evaluate(() => { window.__before = true; });
  await page.clock.fastForward('01:01:00');
  // The jump fires the event slide's timer; step to the last slide, and
  // when it ends the page reloads instead of starting over.
  await page.keyboard.press('ArrowRight');
  await expect(current(page)).toHaveClass(/ev-next-all/);
  const reloaded = page.waitForEvent('load');
  await page.clock.runFor(13_000);
  await reloaded;
  expect(await page.evaluate(() => window.__before ?? false)).toBe(false);
  const url = new URL(page.url());
  expect(url.pathname + url.search).toBe(path);
  await expect(page.locator('.ev-event')).toHaveCount(1);
});
