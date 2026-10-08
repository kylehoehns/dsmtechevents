// Event mode on the lobby TV: /tv/?event=<id>, one event plus the host's slides.
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

test("CIJUG's event: title, lineup and a QR code to RSVP", async ({ page }) => {
  await page.goto(`/tv/?event=${EVENT}`);
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

test('host text from the # fragment is plain text, capped, and labeled as from the host', async ({ page }) => {
  const long = 'y'.repeat(1000);
  await page.goto(`/tv/?event=${EVENT}#welcome=${encodeURIComponent('<b>x</b>')}&note=${long}&agenda=Pizza|Talks%0ADemos&wifi=Guest&wifipass=${long}`);
  expect(await kinds(page)).toEqual(['ev-event', 'ev-welcome', 'ev-agenda', 'ev-wifi', 'ev-note', 'ev-next-all']);

  const welcome = page.locator('.ev-welcome-text');
  await expect(welcome).toHaveText('<b>x</b>');
  await expect(welcome.locator('b')).toHaveCount(0);
  await expect(welcome.locator('..').locator('.ev-kicker')).toHaveText("From tonight's host");

  const note = await page.locator('.ev-note-text').textContent();
  expect([...note].length).toBe(280);
  expect(note.endsWith('…')).toBe(true);
  await expect(page.locator('.ev-agenda-list .ag-text')).toHaveText(['Pizza', 'Talks', 'Demos']);
  await expect(page.locator('.ev-wifi-list dd').first()).toHaveText('Guest');
  expect([...await page.locator('.ev-wifi-list dd').nth(1).textContent()].length).toBe(64);
  await expect(page.locator('.ev-wifi-list a, .ev-note-text a')).toHaveCount(0);
});

test('an older link with host text in the query still works; the fragment wins', async ({ page }) => {
  await page.goto(`/tv/?event=${EVENT}&slides=event,welcome,wifi&welcome=From%20the%20query&wifi=Guest&wifipass=example-password`);
  await expect(page.locator('.ev-welcome-text')).toHaveText('From the query');
  await expect(page.locator('.ev-wifi-list dd')).toHaveText(['Guest', 'example-password']);

  await page.goto(`/tv/?event=${EVENT}&slides=event,welcome&welcome=Old#welcome=Welcome%20to%20CIJUG!`);
  await expect(page.locator('.ev-welcome-text')).toHaveText('Welcome to CIJUG!');
});

test('slides= sets the order and ignores unknown names', async ({ page }) => {
  await page.goto(`/tv/?event=${EVENT}&slides=wifi,next-group,bogus,event,welcome,next-all#wifi=Guest`);
  // welcome has no text, so it's dropped; bogus is ignored
  expect(await kinds(page)).toEqual(['ev-wifi', 'ev-next-group', 'ev-event', 'ev-next-all']);
  await expect(current(page)).toHaveClass(/ev-wifi/);
  await page.keyboard.press('ArrowRight');
  await expect(current(page)).toHaveClass(/ev-next-group/);
});

test("CIJUG's event slide stays up longer than the rest", async ({ page }) => {
  await page.goto(`/tv/?event=${EVENT}&slides=event,next-all`);
  await page.clock.runFor(13_000);
  await expect(current(page)).toHaveClass(/ev-event/);
  await page.clock.runFor(12_000);
  await expect(current(page)).toHaveClass(/ev-next-all/);
});

test('Up next lists events after CIJUG\'s, by date, not CIJUG\'s own', async ({ page }) => {
  await page.goto(`/tv/?event=${EVENT}&slides=next-all`);
  await page.keyboard.press('ArrowRight');
  const rows = page.locator('.ev-next li');
  await expect(rows.locator('.row-title')).toHaveText(['Test Conf 2026', 'Remote DevOps Chat', 'AI Study Group', 're:Invent Recap']);
  await expect(rows.first()).toContainText('Thu Oct 22');
  await expect(rows.first().locator('.row-group')).toHaveText('Conference');
  await expect(page.locator('.ev-next-all .qr-code svg')).toBeVisible();
});

test("next-group: CIJUG has nothing after this, so it says where to watch", async ({ page }) => {
  await page.goto(`/tv/?event=${EVENT}&slides=next-group`);
  const slide = page.locator('.ev-next-group');
  await expect(slide.locator('.ev-kicker')).toHaveText('Next CIJUG meetup');
  await expect(slide).toContainText('Watch for the next one');
  await expect(slide).toContainText('at dsmtechevents.com');
});

test("next-group shows a group's next meetup as a poster", async ({ page }) => {
  // CIJUG's fixture has only the one event, so DSM AI's monthly series stands in.
  await page.goto('/tv/?event=dsmai-nov&slides=next-group');
  const slide = page.locator('.ev-next-group');
  await expect(slide.locator('.ev-kicker')).toHaveText('Next DSM AI meetup');
  await expect(slide.getByRole('heading', { name: 'AI Study Group' })).toBeAttached();
  await expect(slide.locator('.num')).toHaveText('10');
  await expect(slide.locator('.mon')).toHaveText('Dec');
});

test('a joint event picks the group with ?group=', async ({ page }) => {
  await page.goto(`/tv/?event=${EVENT}&slides=next-group&group=iadnug`);
  await expect(page.locator('.ev-next-group .ev-kicker')).toHaveText('Next IADNUG meetup');
  await page.goto(`/tv/?event=${EVENT}&slides=next-group`);
  await expect(page.locator('.ev-next-group .ev-kicker')).toHaveText('Next CIJUG meetup');
});

test('an unknown event id says so, then carries on with the regular rotation', async ({ page }) => {
  await page.goto('/tv/?event=no-such-event');
  await expect(current(page).getByRole('heading', { name: "This event isn't on the calendar anymore" })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(current(page).getByRole('heading', { name: 'Coming up' })).toBeVisible();
});

test('the hourly reload keeps the query and the # fragment', async ({ page }) => {
  const path = `/tv/?event=${EVENT}&slides=event,wifi#wifi=Guest&wifipass=example-password`;
  await page.goto(path);
  await page.evaluate(() => { window.__before = true; });
  await page.clock.fastForward('01:01:00');
  // The jump fires the event slide's timer, so the Wi-Fi slide (the last) is
  // up; when it ends, the page reloads instead of starting over.
  await expect(current(page)).toHaveClass(/ev-wifi/);
  const reloaded = page.waitForEvent('load');
  await page.clock.runFor(13_000);
  await reloaded;
  expect(await page.evaluate(() => window.__before ?? false)).toBe(false);
  const url = new URL(page.url());
  expect(url.pathname + url.search + url.hash).toBe(path);
  await expect(page.locator('.ev-wifi-list dd')).toHaveText(['Guest', 'example-password']);
});
