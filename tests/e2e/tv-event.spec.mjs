// Event mode on the lobby TV: /tv/?event=<id>, one event plus the host's slides.
// The test clock starts Wednesday Oct 14, 9am; Coding Dojo (Web Geeks) runs 5:30p–7:30p that night.
import { test, expect } from './fixtures.mjs';

const current = (page) => page.locator('.slide.is-on');
const kinds = (page) => page.locator('.tv-stage > .slide').evaluateAll((els) => els.map((el) => [...el.classList].find((c) => c.startsWith('ev-') && c !== 'ev-slide')));

test('shows the event, its lineup and a QR code to RSVP', async ({ page }) => {
  await page.goto('/tv/?event=webgeeks-tonight');
  const slide = current(page);
  await expect(slide).toHaveClass(/ev-event/);
  await expect(slide.getByRole('heading', { name: 'Coding Dojo' })).toBeVisible();
  await expect(slide.locator('.hosts')).toHaveText('Web Geeks');
  await expect(slide.locator('.where')).toContainText('Source Allies');
  await expect(slide.locator('.ev-lineup li')).toHaveText(['5:45pWarm-up kata — Sam Lee', '6:30pMob programming — Ana Ruiz']);
  await expect(slide.locator('.qr-code svg')).toBeVisible();
  await expect(slide).toContainText('Scan to RSVP');
  // The regular rotation is gone.
  await expect(page.locator('.overview')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});

test('counts down, says Happening now, then thanks everyone', async ({ page }) => {
  await page.goto('/tv/?event=webgeeks-tonight&fx=off');
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

test('host text is plain text, capped, and labeled as from the host', async ({ page }) => {
  const long = 'y'.repeat(1000);
  await page.goto(`/tv/?event=webgeeks-tonight&welcome=${encodeURIComponent('<b>x</b>')}&note=${long}&agenda=Pizza|Talks%0ADemos&wifi=Guest&wifipass=${long}`);
  expect(await kinds(page)).toEqual(['ev-event', 'ev-welcome', 'ev-agenda', 'ev-wifi', 'ev-note', 'ev-next-all']);

  const welcome = page.locator('.ev-welcome-text');
  await expect(welcome).toHaveText('<b>x</b>');
  await expect(welcome.locator('b')).toHaveCount(0);
  await expect(page.locator('.ev-welcome-text').locator('..').locator('.ev-kicker')).toHaveText("From tonight's host");

  const note = await page.locator('.ev-note-text').textContent();
  expect([...note].length).toBe(280);
  expect(note.endsWith('…')).toBe(true);
  await expect(page.locator('.ev-agenda-list .ag-text')).toHaveText(['Pizza', 'Talks', 'Demos']);
  await expect(page.locator('.ev-wifi-list dd').first()).toHaveText('Guest');
  expect([...await page.locator('.ev-wifi-list dd').nth(1).textContent()].length).toBe(64);
  await expect(page.locator('.ev-wifi-list a, .ev-note-text a')).toHaveCount(0);
});

test('slides= sets the order and ignores unknown names', async ({ page }) => {
  await page.goto('/tv/?event=webgeeks-tonight&slides=wifi,next-group,bogus,event,welcome,next-all&wifi=Guest');
  // welcome has no text, so it's dropped; bogus is ignored
  expect(await kinds(page)).toEqual(['ev-wifi', 'ev-next-group', 'ev-event', 'ev-next-all']);
  await expect(current(page)).toHaveClass(/ev-wifi/);
  await page.keyboard.press('ArrowRight');
  await expect(current(page)).toHaveClass(/ev-next-group/);
});

test('the event slide stays up longer than the rest', async ({ page }) => {
  await page.goto('/tv/?event=webgeeks-tonight&slides=event,next-all');
  await page.clock.runFor(13_000);
  await expect(current(page)).toHaveClass(/ev-event/);
  await page.clock.runFor(12_000);
  await expect(current(page)).toHaveClass(/ev-next-all/);
});

test('Up next lists other events by date, not this one', async ({ page }) => {
  await page.goto('/tv/?event=webgeeks-tonight&slides=next-all');
  await page.keyboard.press('ArrowRight');
  const rows = page.locator('.ev-next li');
  await expect(rows.locator('.row-title')).toHaveText(['Python Office Hours', 'Joint night - JVM vs. CLR', 'Test Conf 2026', 'Remote DevOps Chat', 'AI Study Group']);
  await expect(rows.first()).toContainText('Thu Oct 15');
  await expect(rows.first().locator('.row-group')).toHaveText('Pyowa');
  await expect(page.locator('.ev-next-all .qr-code svg')).toBeVisible();
});

test("next-group shows the group's next meetup, or where to watch for one", async ({ page }) => {
  await page.goto('/tv/?event=dsmai-nov&slides=next-group');
  const slide = page.locator('.ev-next-group');
  await expect(slide.locator('.ev-kicker')).toHaveText('Next DSM AI meetup');
  await expect(slide.getByRole('heading', { name: 'AI Study Group' })).toBeAttached();
  await expect(slide.locator('.dow')).toHaveText('Thu');
  await expect(slide.locator('.num')).toHaveText('10');
  await expect(slide.locator('.mon')).toHaveText('Dec');

  // Web Geeks has nothing after tonight.
  await page.goto('/tv/?event=webgeeks-tonight&slides=next-group');
  await expect(page.locator('.ev-next-group')).toContainText('Next Web Geeks meetup');
  await expect(page.locator('.ev-next-group')).toContainText('Watch for the next one');
  await expect(page.locator('.ev-next-group')).toContainText('at dsmtechevents.com');
});

test('a joint event picks the group with ?group=', async ({ page }) => {
  await page.goto('/tv/?event=cijug-joint&slides=next-group&group=iadnug');
  await expect(page.locator('.ev-next-group .ev-kicker')).toHaveText('Next IADNUG meetup');
  await page.goto('/tv/?event=cijug-joint&slides=next-group');
  await expect(page.locator('.ev-next-group .ev-kicker')).toHaveText('Next CIJUG meetup');
});

test('an unknown event id says so, then carries on with the regular rotation', async ({ page }) => {
  await page.goto('/tv/?event=no-such-event');
  await expect(current(page).getByRole('heading', { name: "This event isn't on the calendar anymore" })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(current(page).getByRole('heading', { name: 'Coming up' })).toBeVisible();
});

test('the hourly reload keeps the address', async ({ page }) => {
  const query = '?event=webgeeks-tonight&slides=event,wifi&wifi=Guest';
  await page.goto(`/tv/${query}`);
  await page.evaluate(() => { window.__before = true; });
  await page.clock.fastForward('01:01:00');
  // The jump fires the event slide's timer, so the Wi-Fi slide (the last) is
  // up; when it ends, the page reloads instead of starting over.
  await expect(current(page)).toHaveClass(/ev-wifi/);
  const reloaded = page.waitForEvent('load');
  await page.clock.runFor(13_000);
  await reloaded;
  expect(await page.evaluate(() => window.__before ?? false)).toBe(false);
  expect(new URL(page.url()).search).toBe(query);
  await expect(page.locator('.ev-wifi')).toHaveCount(1);
});
