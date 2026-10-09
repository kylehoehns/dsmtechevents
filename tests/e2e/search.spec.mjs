// Search: the magnifier in the nav, what it matches, the URL, the status line.
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.mjs';

const list = (page) => page.getByRole('region', { name: 'Upcoming events' });
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const event = (page, title) => list(page).getByRole('heading', { name: new RegExp(`^${escape(title)}`) });
const card = (page, title) => list(page).locator('.show').filter({ has: page.getByRole('heading', { name: new RegExp(`^${escape(title)}`) }) });
const pastSec = (page) => page.getByRole('region', { name: 'Past' });
const past = (page, title) => pastSec(page).getByRole('listitem').filter({ hasText: title });
const box = (page) => page.getByRole('searchbox', { name: 'Search events' });

async function search(page, q) {
  await page.getByRole('button', { name: 'Search events' }).click();
  await expect(box(page)).toBeFocused();
  await box(page).fill(q);
}

test('the search box stays closed until the magnifier opens it', async ({ page }) => {
  await page.goto('/');
  const btn = page.getByRole('button', { name: 'Search events' });
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await expect(box(page)).toBeHidden();
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  await expect(box(page)).toBeFocused();
  // Closing an empty box hands focus back to the button.
  await btn.click();
  await expect(box(page)).toBeHidden();
  await expect(btn).toBeFocused();
});

test('a word only in a group\'s full name finds its events', async ({ page }) => {
  await page.goto('/');
  // "Java" is only in "Central Iowa Java Users Group"; the rows say CIJUG.
  await search(page, 'java');
  await expect(page).toHaveURL(/\?q=java$/);
  await expect(event(page, 'Joint night - JVM vs. CLR')).toBeVisible();
  await expect(event(page, 'Coding Dojo')).toBeHidden();
  await expect(event(page, 'Python Office Hours')).toBeHidden();
  // Past events are searched too, back through the archive, newest first.
  await expect(pastSec(page).getByRole('listitem')).toHaveText([/Records and sealed types/, /Virtual threads in practice/]);
  await expect(past(page, 'Pyowa September')).toBeHidden();
  // Counts follow what's left.
  await expect(list(page).locator('[data-sec]:not([hidden]) [data-count]')).toHaveText(['1 event']);
});

test('the About text is searched', async ({ page }) => {
  await page.goto('/');
  await search(page, 'Kata');
  await expect(event(page, 'Coding Dojo')).toBeVisible();
  await expect(event(page, 'Joint night - JVM vs. CLR')).toBeHidden();
  await expect(event(page, 'Python Office Hours')).toBeHidden();
});

test('words match from their start: "ai" finds AI, not "said"', async ({ page }) => {
  await page.goto('/');
  await search(page, 'ai');
  await expect(list(page).getByRole('heading', { name: /^AI Study Group/ }).first()).toBeVisible();
  // Coding Dojo's About text says "said".
  await expect(event(page, 'Coding Dojo')).toBeHidden();
  await expect(past(page, 'Hiring in the Age of AI')).toBeVisible();
});

test('a longer word also finds its singular and the middle of a word', async ({ page }) => {
  await page.goto('/');
  // Remote DevOps Chat's About text says "agent" and "OpenTelemetry".
  await search(page, 'agents');
  await expect(event(page, 'Remote DevOps Chat')).toBeVisible();
  await expect(event(page, 'Coding Dojo')).toBeHidden();
  await box(page).fill('telemetry');
  await expect(event(page, 'Remote DevOps Chat')).toBeVisible();
  await expect(event(page, 'Python Office Hours')).toBeHidden();
  await box(page).fill('dojos');
  await expect(event(page, 'Coding Dojo')).toBeVisible();
  await expect(event(page, 'Remote DevOps Chat')).toBeHidden();
  // Short words still have to start a word: "ops" isn't the end of "DevOps".
  await box(page).fill('ops');
  await expect(event(page, 'Remote DevOps Chat')).toBeHidden();
});

test('the address is searched, so a town name works', async ({ page }) => {
  await page.goto('/');
  await search(page, 'urbandale');
  await expect(event(page, 'Coding Dojo')).toBeVisible();
  await expect(event(page, 'Python Office Hours')).toBeVisible();
  await expect(event(page, 'Joint night - JVM vs. CLR')).toBeHidden();
  await expect(page.getByRole('status')).toHaveText("Showing 2 events matching 'urbandale', plus 1 past event");
});

test('synonyms: "ai" finds an event that only says Copilot, and marks what matched', async ({ page }) => {
  await page.goto('/');
  // Each row's HTML, and how many text nodes it has (marks split them up).
  const html = () => list(page).locator('.show, .far > li').evaluateAll((els) => els.map((el) => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n = 0;
    while (walk.nextNode()) n++;
    return [el.innerHTML, n];
  }));
  const before = await html();
  await search(page, 'ai');
  // re:Invent Recap (a Further out row) never says "AI": its About text says "Copilot".
  const recap = list(page).locator('.far > li').filter({ hasText: 're:Invent Recap' });
  await expect(recap).toBeVisible();
  // Nothing on the row matches, so a line quotes the About text, match marked.
  await expect(recap.locator('a mark')).toHaveCount(0);
  await expect(recap.locator('.excerpt')).toHaveText('…and a demo of the Copilot workflow our team built on Bedrock.');
  await expect(recap.locator('.excerpt mark')).toHaveText('Copilot');
  // A title that says it: the word is marked there, and no extra line.
  const study = card(page, 'AI Study Group').first();
  await expect(study.locator('.title mark')).toHaveText('AI');
  await expect(study.locator('.excerpt')).toHaveCount(0);
  await expect(past(page, 'Hiring in the Age of AI').locator('.row-title mark')).toHaveText('AI');
  // One-way: "copilot" doesn't find the AI Study Group.
  await box(page).fill('copilot');
  await expect(recap).toBeVisible();
  await expect(study).toBeHidden();

  // Clearing the search leaves every card as it was built.
  await box(page).press('Escape');
  await expect(page.locator('mark, .excerpt')).toHaveCount(0);
  expect(await html()).toEqual(before);
});

test('synonyms: "otel" finds OpenTelemetry in the About text', async ({ page }) => {
  await page.goto('/');
  await search(page, 'otel');
  const chat = card(page, 'Remote DevOps Chat');
  await expect(chat).toBeVisible();
  await expect(event(page, 'Coding Dojo')).toBeHidden();
  await expect(chat.locator('.excerpt')).toHaveText('Tracing with OpenTelemetry, and the agent that files our tickets.');
  await expect(chat.locator('.excerpt mark')).toHaveText('OpenTelemetry');
  // About still opens, its text unmarked.
  await chat.getByRole('button', { name: /About/ }).click();
  await expect(chat.locator('.desc')).toBeVisible();
  await expect(chat.locator('.desc mark')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText("Showing 1 event matching 'otel'");
});

test('".net" finds the .NET group', async ({ page }) => {
  await page.goto('/');
  await search(page, '.NET');
  await expect(event(page, 'Joint night - JVM vs. CLR')).toBeVisible();
  await expect(event(page, 'Coding Dojo')).toBeHidden();
});

test('every word has to match', async ({ page }) => {
  await page.goto('/');
  await search(page, 'source python');
  await expect(event(page, 'Python Office Hours')).toBeVisible();
  await expect(event(page, 'Coding Dojo')).toBeHidden();
});

test('no match shows a friendly note that clears the search', async ({ page }) => {
  await page.goto('/');
  await search(page, 'cobol');
  await expect(page.getByText("Nothing matches 'cobol', coming up or past.")).toBeVisible();
  await expect(list(page).locator('[data-sec]:not([hidden])')).toHaveCount(0);
  await expect(pastSec(page)).toBeHidden();
  await expect(page.getByRole('status')).toHaveText("Nothing matches 'cobol', coming up or past");

  await page.locator('#list-empty').getByRole('button', { name: 'Clear search' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(box(page)).toBeFocused();
  await expect(box(page)).toHaveValue('');
  await expect(event(page, 'Coding Dojo')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Showing 9 events');
});

test('an archived event is found by words in its description, with the excerpt to show why', async ({ page }) => {
  await page.goto('/');
  await search(page, 'okafor');
  const old = past(page, 'Pyowa holiday social');
  await expect(old).toBeVisible();
  await expect(old.locator('.excerpt')).toContainText('packaging by Grace Okafor');
  await expect(old.locator('.excerpt mark')).toHaveText('Okafor');
  // The description itself stays hidden.
  await expect(old.locator('.desc')).toBeHidden();
});

test('past matches read as past and link out; Recent events steps aside', async ({ page }) => {
  await page.goto('/');
  await search(page, 'pyowa');
  await expect(event(page, 'Python Office Hours')).toBeVisible();
  // The cache's past event, then the archived one from last year (with its year).
  await expect(pastSec(page).getByRole('listitem')).toHaveText([/Pyowa September/, /Pyowa holiday social/]);
  await expect(pastSec(page).locator('[data-count]')).toHaveText('2 events');
  const old = past(page, 'Pyowa holiday social');
  await expect(old.locator('.row-date')).toHaveText('Dec 9, 2025');
  await expect(old).toContainText('22 went');
  await expect(old.getByRole('link', { name: /Pyowa holiday social/ })).toHaveAttribute('href', 'https://www.meetup.com/pyowa/events/2025/');
  await expect(pastSec(page)).not.toContainText(/going|RSVP|Tonight|Today|Happening/);
  // Said once: the past matches aren't also in the Recent events rail.
  await expect(page.locator('#recent')).toBeHidden();

  await box(page).press('Escape');
  await expect(pastSec(page)).toBeHidden();
  await expect(page.locator('#recent')).toBeVisible();
});

test('only past matches: the note says nothing is coming up and the past ones show', async ({ page }) => {
  await page.goto('/');
  // In the archive and still in the cache: listed once.
  await search(page, 'sealed');
  await expect(page.getByText("Nothing coming up matches 'sealed'.")).toBeVisible();
  await expect(pastSec(page).getByRole('listitem')).toHaveText([/Records and sealed types/]);
  await expect(page.getByRole('status')).toHaveText("Nothing coming up matches 'sealed'. Showing 1 past event");
});

test('Escape and the × empty the search and close it', async ({ page }) => {
  await page.goto('/');
  await search(page, 'java');
  await box(page).press('Escape');
  await expect(box(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Search events' })).toBeFocused();
  await expect(page).toHaveURL(/\/$/);
  await expect(event(page, 'Coding Dojo')).toBeVisible();

  await search(page, 'java');
  await page.locator('#search').getByRole('button', { name: 'Clear search' }).click();
  await expect(box(page)).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await expect(event(page, 'Coding Dojo')).toBeVisible();
});

test('?q= on load opens the box with the search applied', async ({ page }) => {
  await page.goto('/?q=python');
  await expect(box(page)).toBeVisible();
  await expect(box(page)).toHaveValue('python');
  await expect(event(page, 'Python Office Hours')).toBeVisible();
  await expect(event(page, 'Joint night - JVM vs. CLR')).toBeHidden();
  await expect(page).toHaveTitle(/^'python' · /);
});

test('a search covers every group and shows the list, even from the calendar', async ({ page }) => {
  await page.goto('/?group=pyowa');
  await search(page, 'java');
  await expect(page).toHaveURL(/\?q=java$/);
  await expect(event(page, 'Joint night - JVM vs. CLR')).toBeVisible();
  await expect(page.locator('#filter')).toBeHidden(); // the search cleared the group filter
  // Back returns to the group filter in one step, not a keystroke at a time.
  await page.goBack();
  await expect(page).toHaveURL(/\?group=pyowa$/);
  await expect(box(page)).toBeHidden();

  await page.goto('/?view=calendar');
  await search(page, 'java');
  await expect(page.getByRole('region', { name: 'Calendar' })).toBeHidden();
  await expect(event(page, 'Joint night - JVM vs. CLR')).toBeVisible();
});

for (const colorScheme of ['light', 'dark']) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });
    for (const q of ['java', 'cobol', 'ai', 'otel']) {
      test(`an open search for '${q}' has no axe violations`, async ({ page }) => {
        await page.goto('/');
        await search(page, q);
        await expect(page).toHaveURL(new RegExp(`q=${q}$`));
        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
          .analyze();
        expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual([]);
      });
    }
  });
}

test('every page has the search button in the same spot; elsewhere it opens search on the events page', async ({ page }) => {
  const spot = async (path) => { await page.goto(path); return page.getByRole('link', { name: 'Search events' }).or(page.getByRole('button', { name: 'Search events' })).boundingBox(); };
  const home = await spot('/');
  for (const path of ['/groups/', '/about/', '/organizers/']) expect(await spot(path), path).toEqual(home);
  await page.getByRole('link', { name: 'Search events' }).click();
  await expect(page).toHaveURL(/\/(\?search)?$/);
  await expect(page.getByRole('searchbox', { name: 'Search events' })).toBeFocused();
});

test('a click anywhere on the search box lands in it, not on the logo above', async ({ page }) => {
  await page.goto('/?search');
  const input = page.getByRole('searchbox', { name: 'Search events' });
  const box = await input.boundingBox();
  for (const f of [0.05, 0.25, 0.5]) {
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('a, input')?.tagName, [box.x + 30, box.y + box.height * f]);
    expect(hit, `${f} of the way down`).toBe('INPUT');
  }
});
