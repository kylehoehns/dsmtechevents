// Time travel: the whole page at awkward moments. The fixture site is built
// once, as of Wed Oct 14 2026, 9am (fixtures.mjs). These tests move the
// browser's clock against that build, the way a page left open (or opened
// days later) sees it. format.test.mjs covers the label rules; this covers
// the pages acting on them: the labels the build printed, app.js re-checking
// them (freshen, and keepCurrent's reload on a new day), catch-up.js on
// /groups/ and /status/, the calendar, and the TV page.
//
// Des Moines is UTC-5 (CDT) until 2am Sun Nov 1 2026, then UTC-6 (CST)
// until 2am Sun Mar 14 2027. Times below are UTC, with Des Moines time beside.
//
// page.clock.runFor() fires every timer on the way (app.js re-checks once a
// minute); fastForward() jumps, firing what's due once, like a laptop waking.
import { test, expect } from './fixtures.mjs';

const at = (iso) => new Date(iso);
const row = (page, title) => page.getByRole('region', { name: 'Upcoming events' }).locator('.show').filter({ hasText: title });
const tag = (page, title) => row(page, title).locator('.when-tag');
const recent = (page) => page.locator('#recent-list li:not([hidden])');

// Counts page loads: the first, plus one per reload. A reload that lands
// while the clock is jumping is awaited with reload() below, so a count read
// after it is settled.
function countLoads(page) {
  const loads = { n: 0 };
  page.on('load', () => loads.n++);
  return loads;
}
async function reloadDuring(page, move) {
  const loaded = page.waitForEvent('load');
  await move();
  await loaded;
}

test.describe('New Year: a page left open past midnight on Dec 31', () => {
  const ELEVEN_58 = '2027-01-01T05:58:00Z'; // Thu Dec 31 2026, 11:58pm

  test('the list reloads once, into 2027, and the calendar opens on January', async ({ page }) => {
    await page.clock.setSystemTime(at(ELEVEN_58));
    const loads = countLoads(page);
    await page.goto('/');
    await expect(page.locator('#minical h2')).toContainText('December');
    await expect(page.locator('#minical .today')).toHaveText('31');

    await reloadDuring(page, () => page.clock.runFor('02:30')); // 12:00:30am
    expect(loads.n).toBe(2);
    await expect(page.locator('#minical h2')).toContainText('January');
    await expect(page.locator('#minical .today')).toHaveText('1');
    // The new page knows it's already the new day: no reload loop.
    await page.clock.runFor('05:00');
    expect(loads.n).toBe(2);

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Calendar' }).click();
    await expect(page.getByRole('heading', { name: 'January 2027' })).toBeVisible();
    await expect(page.locator('#calendar-view .day.today')).toHaveAttribute('data-day', '2027-01-01');
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(page.getByRole('heading', { name: 'December 2026' })).toBeVisible();
    await expect(page.locator('#calendar-view .day[data-day="2026-12-31"]')).toHaveClass(/\bpast\b/);
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(page.getByRole('heading', { name: 'January 2027' })).toBeVisible();
    expect(loads.n).toBe(2);
  });

  test("a picked day's 'tomorrow' becomes 'today'", async ({ page }) => {
    await page.clock.setSystemTime(at(ELEVEN_58));
    const loads = countLoads(page);
    await page.goto('/?view=calendar&day=2027-01-01');
    await expect(page.locator('#day-panel .sub')).toHaveText('A quiet day · tomorrow');
    await reloadDuring(page, () => page.clock.runFor('02:30'));
    await expect(page.locator('#day-panel .sub')).toHaveText('A quiet day · today');
    // Someone picked this day, so it stays picked.
    await expect(page).toHaveURL(/day=2027-01-01/);
    await page.clock.runFor('05:00');
    expect(loads.n).toBe(2);
  });

  test('the calendar left showing its own pick of today moves to the new today', async ({ page }) => {
    // The calendar picks a day for itself and writes it to the address
    // (?day=2026-12-31). The midnight reload used to keep that, and came
    // back on December with yesterday picked.
    await page.clock.setSystemTime(at(ELEVEN_58));
    const loads = countLoads(page);
    await page.goto('/?view=calendar');
    await expect(page.getByRole('heading', { name: 'December 2026' })).toBeVisible();
    await expect(page).toHaveURL(/day=2026-12-31/);

    await reloadDuring(page, () => page.clock.runFor('02:30'));
    await expect(page.getByRole('heading', { name: 'January 2027' })).toBeVisible();
    await expect(page.locator('#calendar-view .day.today')).toHaveAttribute('data-day', '2027-01-01');
    // January's first day with something on: the AI Study Group, Jan 14.
    await expect(page.locator('#day-panel h2')).toHaveText('Thursday, January 14');
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(page.getByRole('heading', { name: 'December 2026' })).toBeVisible();
    await page.clock.runFor('05:00');
    expect(loads.n).toBe(2);
  });
});

test.describe('daylight saving time', () => {
  // Fall Back Hack Night and Spring Forward Hack Night (fixture events.yaml)
  // run 6-8pm on the Sundays the clocks change.
  test('fall back (Nov 1): one reload at midnight, none at 2am, and 6pm stays 6pm', async ({ page }) => {
    await page.clock.setSystemTime(at('2026-11-01T04:00:00Z')); // Sat Oct 31, 11pm CDT
    const loads = countLoads(page);
    await page.goto('/');
    await expect(row(page, 'Fall Back Hack Night').locator('.time')).toHaveText('6p–8p');
    await expect(tag(page, 'Fall Back Hack Night')).toHaveText('Tomorrow');

    await reloadDuring(page, () => page.clock.runFor('01:00:30')); // midnight
    await expect(tag(page, 'Fall Back Hack Night')).toHaveText('Tonight');
    // 1am CDT, 1am again in CST, on to 2:01am CST, a minute at a time.
    await page.clock.runFor('03:00:00');
    expect(loads.n).toBe(2);
    await expect(tag(page, 'Fall Back Hack Night')).toHaveText('Tonight');

    await page.clock.fastForward('15:30:00'); // 5:30:30pm CST
    await expect(tag(page, 'Fall Back Hack Night')).toHaveText('In 30 min');
    await page.clock.runFor('30:00'); // 6:00:30pm CST: it has started, not an hour off either way
    await expect(tag(page, 'Fall Back Hack Night')).toHaveText('Happening now');
    await expect(row(page, 'Fall Back Hack Night').locator('.time')).toHaveText('6p–8p');
    expect(loads.n).toBe(2);
  });

  test('spring forward (Mar 14): one reload at midnight, none at 2am, and the day reads right', async ({ page }) => {
    await page.clock.setSystemTime(at('2027-03-14T05:00:00Z')); // Sat Mar 13, 11pm CST
    const loads = countLoads(page);
    await page.goto('/?view=calendar&day=2027-03-14');
    const panel = page.locator('#day-panel');
    await expect(panel.locator('.sub')).toHaveText('1 event · tomorrow');
    await expect(panel.locator('.time')).toHaveText('6p–8p');
    await expect(page.locator('.day[data-day="2027-03-14"] .pill')).toContainText('6p');

    await reloadDuring(page, () => page.clock.runFor('01:00:30')); // midnight
    await expect(panel.locator('.sub')).toHaveText('1 event · today');
    // 2am CST is 3am CDT: the hour that never happens.
    await page.clock.runFor('02:05:00'); // 3:05am CDT
    expect(loads.n).toBe(2);
    await expect(panel.locator('.sub')).toHaveText('1 event · today');
    await expect(page.locator('.day[data-day="2027-03-14"] .pill')).toContainText('6p');
  });

  test('spring forward on the TV: Tomorrow at 6p, then Tonight at 6p, then the countdown', async ({ page }) => {
    await page.clock.setSystemTime(at('2027-03-13T15:00:00Z')); // Sat Mar 13, 9am CST
    await page.goto('/tv/?event=manual-spring-forward-hack-night-2027-03-14&fx=off');
    const stamp = page.locator('.ev-event .ev-stamp');
    await expect(stamp).toHaveText('Tomorrow at 6p');
    await page.clock.fastForward('24:00:00'); // Sun 10am CDT: a day later, an hour later on the wall
    await expect(stamp).toHaveText('Tonight at 6p');
    await page.clock.fastForward('07:35:00'); // 5:35pm CDT
    await expect(stamp).toHaveText('Starts in 25 min');
  });
});

test.describe('a two-day conference overnight (Test Conf, Thu-Fri Oct 22-23, 8a-5p)', () => {
  const NINE_PM = '2026-10-23T02:00:00Z'; // Thu Oct 22, 9pm: day one is over

  test('the row and the poster agree from 9pm to day two', async ({ page }) => {
    await page.clock.setSystemTime(at(NINE_PM));
    const loads = countLoads(page);
    await page.goto('/');
    const stamp = page.getByRole('region', { name: 'Coming up soon' }).locator('.countdown');
    await expect(tag(page, 'Test Conf 2026')).toHaveText('Tomorrow');
    await expect(stamp).toHaveText('Tomorrow');

    await reloadDuring(page, () => page.clock.fastForward('10:15:00')); // Fri 7:15am; a new day, so a reload
    await expect(tag(page, 'Test Conf 2026')).toHaveText('In 45 min');
    await expect(stamp).toHaveText('In 45 min');

    await page.clock.fastForward('02:45:00'); // 10am
    await expect(tag(page, 'Test Conf 2026')).toHaveText('Happening now');
    await expect(stamp).toHaveText('Happening now');
    expect(loads.n).toBe(2);
  });

  test('the TV slide agrees, in the rotation and in event mode', async ({ page }) => {
    await page.clock.setSystemTime(at(NINE_PM));
    await page.goto('/tv/?fx=off');
    const slideTag = page.locator('.poster-slide', { hasText: 'Test Conf 2026' }).locator('.when-tag');
    await expect(slideTag).toHaveText('Tomorrow');
    await page.clock.fastForward('10:15:00'); // the next slide change re-checks
    await expect(slideTag).toHaveText('In 45 min');
    await page.clock.fastForward('02:45:00');
    await expect(slideTag).toHaveText('Happening now');

    await page.clock.setSystemTime(at(NINE_PM));
    await page.goto('/tv/?event=manual-test-conf-2026-2026-10-22&fx=off');
    const stamp = page.locator('.ev-event .ev-stamp');
    await expect(stamp).toHaveText('Tomorrow at 8a');
    await page.clock.fastForward('10:15:00');
    await expect(stamp).toHaveText('Starts in 45 min');
    await page.clock.fastForward('02:45:00');
    await expect(stamp).toHaveText('Happening now');
  });
});

test.describe('a visit that spans the Coding Dojo (Web Geeks, Wed Oct 14, 5:30-7:30p)', () => {
  const FIVE_TEN = '2026-10-14T22:10:00Z'; // 5:10pm

  test('the list counts down, says Happening now, then moves it to Recent events', async ({ page }) => {
    await page.clock.setSystemTime(at(FIVE_TEN));
    const loads = countLoads(page);
    await page.goto('/');
    const thisWeek = page.locator('[data-sec]', { has: page.getByRole('heading', { name: 'This week' }) });
    await expect(tag(page, 'Coding Dojo')).toHaveText('In 20 min');
    await expect(thisWeek.locator('[data-count]')).toHaveText('2 events');
    await expect(recent(page).filter({ hasText: 'Coding Dojo' })).toHaveCount(0);
    const summary = await page.locator('#recent-sub').textContent();

    await page.clock.runFor('10:00');
    await expect(tag(page, 'Coding Dojo')).toHaveText('In 10 min');
    await page.clock.runFor('10:00');
    await expect(tag(page, 'Coding Dojo')).toHaveText('Happening now');
    await expect(recent(page).filter({ hasText: 'Coding Dojo' })).toHaveCount(0);

    await page.clock.runFor('02:00:00'); // 7:30pm: over
    await expect(row(page, 'Coding Dojo')).toHaveCount(0);
    await expect(thisWeek.locator('[data-count]')).toHaveText('1 event');
    await expect(recent(page).first()).toContainText('Coding Dojo');
    await expect(recent(page).first()).toContainText('12 went');
    await expect(page.locator('#recent-sub')).not.toHaveText(summary);
    expect(loads.n).toBe(1);
  });

  test("Web Geeks' own view moves it from the list to Past", async ({ page }) => {
    await page.clock.setSystemTime(at(FIVE_TEN));
    const loads = countLoads(page);
    await page.goto('/?group=webgeeks');
    const past = page.getByRole('region', { name: 'Past' }).locator('li:not([hidden])');
    await expect(tag(page, 'Coding Dojo')).toHaveText('In 20 min');
    await expect(past.first()).toContainText('Hiring in the Age of AI');
    await expect(past.filter({ hasText: 'Coding Dojo' })).toHaveCount(0);

    await page.clock.runFor('02:21:00'); // 7:31pm
    await expect(row(page, 'Coding Dojo')).toHaveCount(0);
    await expect(page.locator('#list-empty')).toContainText('Nothing on the books for this group right now.');
    await expect(past.first()).toContainText('Coding Dojo');
    expect(loads.n).toBe(1);
  });

  test('/groups/ and /status/ catch up without a reload', async ({ page }) => {
    await page.clock.setSystemTime(at(FIVE_TEN));
    const loads = countLoads(page);
    await page.goto('/groups/');
    const card = page.locator('article#webgeeks');
    await expect(card.locator('.next:visible')).toContainText('Next: Wed Oct 14, Coding Dojo');
    await expect(card.locator('.last:visible')).toHaveText('Last event Oct 5 · 37 went');
    await page.clock.runFor('02:21:00'); // 7:31pm
    await expect(card.locator('.next:visible')).toContainText('Nothing scheduled');
    await expect(card.locator('.last:visible')).toHaveText('Last event Oct 14 · 12 went');
    expect(loads.n).toBe(1);

    await page.clock.setSystemTime(at(FIVE_TEN));
    await page.goto('/status/');
    const count = page.locator('.sources li', { has: page.getByRole('heading', { name: /^Web Geeks/ }) }).locator('.facts span:visible');
    await expect(count).toHaveText('1 coming up');
    await page.clock.runFor('02:21:00');
    await expect(count).toHaveText('0 coming up');
    expect(loads.n).toBe(2); // the two visits, no reloads
  });
});

test('midnight with the page hidden: one reload when it comes back, with the new day right', async ({ page }) => {
  await page.clock.setSystemTime(at('2026-10-15T04:00:00Z')); // Wed Oct 14, 11pm
  const loads = countLoads(page);
  await page.goto('/');
  await expect(row(page, 'Coding Dojo')).toHaveCount(0); // over at 7:30
  await expect(tag(page, 'Python Office Hours')).toHaveText('Tomorrow');

  // A phone locks, or the tab goes to the background.
  const setHidden = (hidden) => page.evaluate((h) => {
    if (h) {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    } else {
      delete document.hidden;
      delete document.visibilityState;
    }
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await setHidden(true);
  await page.clock.runFor('08:00:00'); // Thu 7am; nothing re-checks while hidden
  expect(loads.n).toBe(1);
  await expect(tag(page, 'Python Office Hours')).toHaveText('Tomorrow');

  await reloadDuring(page, () => setHidden(false));
  await expect(tag(page, 'Python Office Hours')).toHaveText('Today');
  await expect(page.locator('#minical .today')).toHaveText('15');
  const thisWeek = page.locator('[data-sec]', { has: page.getByRole('heading', { name: 'This week' }) });
  await expect(thisWeek.locator('[data-count]')).toHaveText('1 event');
  await page.clock.runFor('05:00');
  expect(loads.n).toBe(2);
});

test('TV event mode across a whole event: Tomorrow, Tonight, the countdown, Happening now, thanks, gone', async ({ page }) => {
  // CIJUG + IADNUG's joint night, Tue Oct 20, 5:30-7:30p.
  await page.clock.setSystemTime(at('2026-10-19T14:00:00Z')); // Mon 9am
  await page.goto('/tv/?event=cijug-joint&fx=off');
  const slide = page.locator('.ev-event');
  const stamp = slide.locator('.ev-stamp');
  const upNext = page.locator('.ev-next .row-title');
  await expect(stamp).toHaveText('Tomorrow at 5:30p');
  await page.clock.fastForward('24:00:00'); // Tue 9am
  await expect(stamp).toHaveText('Tonight at 5:30p');
  await page.clock.fastForward('08:05:00'); // 5:05pm
  await expect(stamp).toHaveText('Starts in 25 min');
  await page.clock.runFor('01:00'); // the stamp ticks between slide changes
  await expect(stamp).toHaveText('Starts in 24 min');
  await page.clock.fastForward('00:30:00'); // 5:36pm
  await expect(stamp).toHaveText('Happening now');
  await expect(stamp).toHaveCSS('background-color', 'rgb(224, 96, 159)'); // pink, like the rotation and home

  await page.clock.fastForward('02:00:00'); // 7:36pm, over
  await expect(slide.getByRole('heading', { name: 'Thanks for coming' })).toBeVisible();
  await expect(stamp).toHaveCount(0);
  await expect(upNext.first()).toHaveText('Test Conf 2026');
  await expect(upNext.filter({ hasText: 'Joint night' })).toHaveCount(0);

  // Three hours after the end, the hourly reload finds the event gone and
  // hands the screen back to the regular rotation.
  // The reload waits for the last slide to finish, so start the jump from
  // the first: the jump moves it on one, and two steps on is the last.
  const onSlide = async (kind) => {
    for (let i = 0; i < 3 && !(await page.locator('.slide.is-on').getAttribute('class')).includes(kind); i++) await page.keyboard.press('ArrowRight');
    await expect(page.locator('.slide.is-on')).toHaveClass(new RegExp(kind));
  };
  await onSlide('ev-event');
  await page.clock.fastForward('03:00:00'); // 10:36pm
  await onSlide('ev-next-all');
  await reloadDuring(page, () => page.clock.runFor(13_000));
  await expect(page.locator('.slide.is-on').getByRole('heading', { name: "This event isn't on the calendar anymore" })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.slide.is-on').getByRole('heading', { name: 'Coming up' })).toBeVisible();
});
