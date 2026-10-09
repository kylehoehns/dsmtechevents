// Events page behavior: list/calendar views, the group filter, relative
// labels ("Tomorrow", "8 days out"), squashing repeated dates and addresses,
// the month calendar and the mini calendar in the side rail.
// State lives in the URL (?view=calendar&group=cijug&day=2026-10-15, ?q=java)
// so any view can be shared or bookmarked.
import { fold, queryTerms, matchesAll, matchSpans, excerpt } from '../lib/search.mjs';
import { dayKey, lastDay, isDayKey, dayName, monthName, addDays, daysBetween, plural, shortTime, escapeHtml, whenLabel, countdown, recentSummary, plainText } from '../lib/format.mjs';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const { events, groups } = JSON.parse($('#calendar-data').textContent);
const listView = $('#list-view');
const calView = $('#calendar-view');
const dayPanel = $('#day-panel');
const minical = $('#minical');
const recent = $('#recent');
const status = $('#status');
const pastResults = $('#past-results');
// A filtered view's title builds on the short name, not the long search title.
const siteTitle = document.title;
const siteName = document.querySelector('meta[property="og:site_name"]')?.content ?? siteTitle;
const now = Date.now();
const today = dayKey(now);

// ---- cards: every event has one, in the list or in the card pool ----
// The pool (/cards/, built from the same EventCard) holds the cards the list
// doesn't print: past events, repeat dates, far-off ones. It's fetched the
// first time the calendar or a search needs it, not with the page. It also
// has a one-line row for every past event (archive included), which a search
// shows in its Past section.
const cards = new Map();
for (const el of $$('.show', listView)) cards.set(el.dataset.id, el);
let pool = null;
let poolFailed = false;
let poolReady = false;
function loadPool() {
  pool ??= fetch('/cards/')
    .then((res) => { if (!res.ok) throw new Error(`card pool: ${res.status}`); return res.text(); })
    .then((html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      for (const el of $$('.show', doc)) {
        if (!cards.has(el.dataset.id)) cards.set(el.dataset.id, document.adoptNode(el));
      }
      const rows = $$('#past > li', doc);
      for (const li of rows) li.hidden = true;
      $('ol', pastResults).replaceChildren(...rows.map((li) => document.adoptNode(li)));
      poolFailed = false;
      poolReady = true;
      searchIndex = null; // rebuild with the new cards
      // Redraw only what was waiting on it (a redraw would close an open About).
      if (state.view === 'calendar' && $('[aria-busy], .show:not([data-id])', dayPanel)) renderDayPanel();
      else if (state.q || state.group) { listShown = renderList(); renderSide(); }
    }, () => {
      poolFailed = true;
      pool = null; // try again next time
      if (state.view === 'calendar') renderDayPanel();
    });
  return pool;
}

// ---- relative labels ----
// The build already printed these for the day it ran (see EventCard.astro);
// they only change for a page opened on a later day, or once an event starts
// or ends. The page is built ahead of time, so it also drops anything that
// has ended since. Returns whether it dropped anything.
function freshen(t) {
  let dropped = false;
  for (const el of $$('#list-view [data-end], .poster[data-end]')) if (Date.parse(el.dataset.end) <= t) { el.remove(); dropped = true; }
  for (const el of $$('.show', listView)) {
    const tag = $('.when-tag', el);
    if (!tag) continue;
    const label = whenLabel(el.dataset.start, el.dataset.end, t, { multiDay: 'days' in el.dataset });
    if (tag.textContent !== label) tag.textContent = label;
    tag.hidden = !label;
  }
  for (const el of $$('.countdown[data-start]')) el.textContent = countdown(el.dataset.start, el.dataset.end, t, { multiDay: 'days' in el.dataset });
  return dropped;
}
freshen(now);

// Venue links open Google Maps; on iPhones and iPads, Apple Maps instead.
if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)) {
  for (const a of $$('a.map[data-q]')) a.href = `https://maps.apple.com/?q=${encodeURIComponent(a.dataset.q)}`;
}

// The months the data covers: the cache keeps about 90 days of past events
// (plus the archive), so earlier months would look quiet when they're just
// not on file. Paging and ?day= stay inside these, and this month always counts.
const firstMonth = events.reduce((m, e) => { const k = dayKey(e.start).slice(0, 7); return k < m ? k : m; }, today.slice(0, 7));
const lastMonth = events.reduce((m, e) => { const k = lastDay(e.start, e.end).slice(0, 7); return k > m ? k : m; }, today.slice(0, 7));
const inRange = (key) => key.slice(0, 7) >= firstMonth && key.slice(0, 7) <= lastMonth;

// ---- state ----
const state = {};
function readUrl() {
  const params = new URLSearchParams(location.search);
  state.view = params.get('view') === 'calendar' ? 'calendar' : 'list';
  // Ignore unknown groups (and inherited names like ?group=constructor) and
  // dates that don't exist, rather than rendering an empty or broken page.
  state.group = Object.hasOwn(groups, params.get('group') ?? '') ? params.get('group') : '';
  state.day = isDayKey(params.get('day')) && inRange(params.get('day')) ? params.get('day') : null;
  state.month = (state.day ?? today).slice(0, 7);
  // A search looks through every group, and shows its results in the list.
  state.q = (params.get('q') ?? '').trim().slice(0, 100);
  if (state.q) { state.group = ''; state.view = 'list'; }
}
readUrl();

// Tell screen readers what a click changed. Never called on first load.
function announce(text) { status.textContent = text; }

// Switching view or group is a new history entry, so Back undoes it. Picking
// a day or month just updates the current entry; paging through a calendar
// shouldn't fill up the Back button.
let synced = null;
function syncUrl() {
  const p = new URLSearchParams();
  if (state.view === 'calendar') p.set('view', 'calendar');
  if (state.group) p.set('group', state.group);
  if (state.view === 'calendar' && state.day) p.set('day', state.day);
  if (state.q) p.set('q', state.q);
  const url = p.size ? `?${p}` : location.pathname;
  const key = `${state.view}|${state.group}`;
  if (synced != null && synced !== key) history.pushState(null, '', url);
  else history.replaceState(null, '', url);
  synced = key;
}
// Does an event hosted by these groups pass the group filter?
const matches = (ids) => !state.group || ids.includes(state.group);
const hostsOf = (el) => (el.dataset.groups ?? '').split(' ');

// ---- search ----
// Matches what a card says (title, hosts, venue, address, About text) plus
// each host's short and full name, built from the page on first use. The
// rules, synonyms included, are in src/lib/search.mjs.
// A past event's row is indexed only when it has no card: the cache's past
// events have one (with their About text), older archived ones don't.
let searchIndex = null;
function haystack(id) {
  if (!searchIndex) {
    searchIndex = new Map();
    const index = (el, sel) => {
      const names = hostsOf(el).flatMap((g) => groups[g] ? [groups[g].short, groups[g].name] : []);
      const text = $$(sel, el).map((t) => t.textContent);
      searchIndex.set(el.dataset.id, fold([...names, ...text].join(' ')));
    };
    for (const card of cards.values()) index(card, '.band, .series, .title, .venue, .addr, .tag-online, .desc');
    for (const li of $$('li', pastResults)) if (!searchIndex.has(li.dataset.id)) index(li, '.row-group, .row-title, .row-where, .desc');
  }
  return searchIndex.get(id) ?? '';
}
// The query's terms, worked out once per query.
let terms = [];
let termsFor = '';
const queryNow = () => { if (termsFor !== state.q) { terms = queryTerms(state.q); termsFor = state.q; } return terms; };
const found = (el) => !state.q || matchesAll(haystack(el.dataset.id), queryNow());
const shows = (el) => matches(hostsOf(el)) && found(el);

// ---- list ----
// Returns how many upcoming events are showing; pastShown counts the Past section.
let pastShown = 0;
function renderList() {
  let total = 0;
  for (const sec of $$('[data-sec]', listView)) {
    const items = $$('.show, .far > li', sec);
    let n = 0;
    for (const el of items) { el.hidden = !shows(el); if (!el.hidden) n++; }
    sec.hidden = n === 0;
    total += n;
    const count = $('[data-count]', sec);
    count.textContent = $('.far', sec) ? `${n} on the books` : plural(n, 'event');
  }
  // A search or one group's view looks back too: past events, newest first,
  // under the upcoming ones (the archive's rows come with the card pool).
  pastShown = 0;
  // data-after: an event that was still on when the pool was built shows once it's over.
  const over = (li) => !(Date.parse(li.dataset.after) > Date.now());
  const pastShows = (li) => over(li) && (state.q ? found(li) : !!state.group && matches(hostsOf(li)));
  for (const li of $$('li', pastResults)) { li.hidden = !pastShows(li); if (!li.hidden) pastShown++; }
  // Past belongs to the list; the calendar shows past days itself.
  pastResults.hidden = pastShown === 0 || state.view !== 'list';
  $('[data-count]', pastResults).textContent = plural(pastShown, 'event');
  const empty = $('#list-empty');
  empty.hidden = total > 0;
  if (!total && state.q) {
    // Until the pool (and its past rows) is in, only upcoming events were searched.
    const none = poolReady && !pastShown ? `Nothing matches '${escapeHtml(state.q)}', coming up or past.` : `Nothing coming up matches '${escapeHtml(state.q)}'.`;
    empty.innerHTML = `${none} <button type="button" class="btn btn-outline btn-small" data-clear-search>Clear search</button>`;
  } else if (!total && state.group) {
    const g = groups[state.group];
    empty.innerHTML = `Nothing on the books for this group right now. ${g.url
      ? `Check <a href="${escapeHtml(g.url)}" target="_blank" rel="noopener">their page<span class="sr-only"> (opens in new tab)</span></a> for what's next.`
      : 'Check their page for what\'s next.'}`;
  }
  squashRepeats();
  highlight();
  return total;
}

// Don't print what the row above just said: the date for a second event on
// the same day, the street address for a venue already shown.
function squashRepeats() {
  const seenVenues = new Set();
  let prevDay = null;
  for (const el of $$('.show', listView)) {
    if (el.hidden || el.closest('[hidden]')) continue;
    el.classList.toggle('same-day', el.dataset.day === prevDay && el.previousElementSibling != null);
    prevDay = el.dataset.day;
    const v = el.dataset.venue;
    el.classList.toggle('addr-seen', !!v && seenVenues.has(v));
    if (v) seenVenues.add(v);
  }
}

// ---- what matched ----
// While a search is on, each result marks what matched in the text it shows:
// a card's title, group, venue and address; a row's group, title and place.
// A word that matched only in the hidden About text gets a line under the
// result quoting it. Each search undoes the last one's marks first, so
// clearing it leaves the page as it was built (and the calendar's day panel,
// which copies the cards, never gets them).
const marked = new Set();
const aboutText = new WeakMap();
function unmark() {
  for (const el of marked) {
    for (const m of $$('mark', el)) { const parent = m.parentNode; m.replaceWith(...m.childNodes); parent.normalize(); }
    $('.excerpt', el)?.remove();
  }
  marked.clear();
}
function highlight() {
  unmark();
  if (!state.q || state.view !== 'list') return;
  queryNow();
  const results = [...$$('.show, .far > li', listView), ...$$('li', pastResults)].filter((el) => !el.hidden && !el.closest('[hidden]'));
  for (const el of results) {
    const card = el.classList.contains('show');
    // squashRepeats may have hidden the address: it isn't showing to mark.
    const fields = card ? `.band, .title, .venue${el.classList.contains('addr-seen') ? '' : ', .addr'}` : '.row-group, .row-title, .row-where';
    const hit = new Set();
    for (const f of $$(fields, el)) markText(f, hit);
    if (hit.size) marked.add(el);
    if (hit.size === terms.length) continue;
    // A row with no card carries its short description itself (an archived one).
    const desc = $('.desc', cards.get(el.dataset.id) ?? el);
    const x = desc && excerpt(plainAbout(desc), terms.filter((_, n) => !hit.has(n)));
    if (!x) continue;
    const line = document.createElement(card ? 'p' : 'span');
    line.className = 'excerpt';
    line.append(...x.parts.map((part) => {
      if (!part.mark) return part.text;
      const m = document.createElement('mark');
      m.textContent = part.text;
      return m;
    }));
    if (card) $('.body', el).append(line); else el.append(line);
    marked.add(el);
  }
}
// Wrap each match in this element's text (not its screen-reader-only words) in <mark>.
function markText(root, hit) {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walk.nextNode()) if (!walk.currentNode.parentElement.closest('.sr-only')) nodes.push(walk.currentNode);
  for (const node of nodes) {
    const spans = matchSpans(node.data, terms);
    if (!spans.length) continue;
    const parts = [];
    let at = 0;
    for (const [a, b, n] of spans) {
      if (a > at) parts.push(node.data.slice(at, a));
      const m = document.createElement('mark');
      m.textContent = node.data.slice(a, b);
      parts.push(m);
      at = b;
      hit.add(n);
    }
    if (at < node.data.length) parts.push(node.data.slice(at));
    node.replaceWith(...parts);
  }
}
// A card's About text as plain words: no photo, links' "(opens in new tab)"
// or leftover Markdown marks.
function plainAbout(desc) {
  if (!aboutText.has(desc)) {
    const copy = desc.cloneNode(true);
    for (const el of $$('.sr-only, img', copy)) el.remove();
    for (const br of $$('br', copy)) br.replaceWith('\n');
    // A card's About is paragraphs; an archived row's is one plain line.
    aboutText.set(desc, plainText(copy.children.length ? [...copy.children].map((b) => b.textContent).join('\n') : copy.textContent));
  }
  return aboutText.get(desc);
}

// ---- side rail: filter, recent, headliners ----
function renderSide() {
  // Filtered to one group: say which, with a way to the group and a way out.
  $('#filter').hidden = !state.group;
  if (state.group) $('#filter-note').innerHTML = `Showing only <b>${escapeHtml(groups[state.group].name)}</b>. <a href="/groups/#${encodeURIComponent(state.group)}">About the group</a> · <button type="button" data-show-all>Show all groups</button>`;

  for (const p of $$('.poster')) p.hidden = !shows(p);
  // The calendar already shows conference days in pink; skip the posters there.
  const headliners = $('#headliners');
  if (headliners) headliners.hidden = state.view === 'calendar' || $$('.poster', headliners).every((p) => p.hidden);

  const list = $('#recent-list');
  const limit = Number(list.dataset.shown);
  let shown = 0;
  for (const li of $$('li', list)) {
    // data-after: an event that was still on when the page was built.
    li.hidden = !matches(hostsOf(li)) || Date.parse(li.dataset.after) > Date.now();
    if (!li.hidden) li.classList.toggle('extra', ++shown > limit);
  }
  // The summary and the "All N" button count what the filter left.
  const visible = $$('li:not([hidden])', list);
  $('#recent-sub').textContent = recentSummary(visible.length, visible.reduce((n, li) => n + Number(li.dataset.going), 0));
  const all = $('#recent-all');
  if (all) {
    all.hidden = shown <= limit;
    if (all.getAttribute('aria-expanded') !== 'true') all.textContent = `+ All ${shown}`;
  }
  // A search or one group's view shows past events in the Past section instead.
  recent.hidden = state.view === 'calendar' || shown === 0 || !!state.q || !!state.group;
  minical.hidden = state.view === 'calendar';
  dayPanel.hidden = state.view !== 'calendar';
}

// ---- calendar ----
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// The key's "Pick a day" hint goes once a day has been picked (or a ?day=
// link opened on one): its events are showing, so the hint has done its job.
let dayPicked = !!state.day;
const addMonths = (ym, n) => { const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const eventsOn = (key) => events
  .filter((e) => dayKey(e.start) <= key && key <= lastDay(e.start, e.end) && matches(e.groups))
  .sort((a, b) => a.start.localeCompare(b.start));
const label = (e) => e.groups.length ? e.groups.map((id) => groups[id]?.short).join(' + ') : e.title.replace(/\s+20\d\d$/, '');

function monthCells(ym) {
  const first = `${ym}-01`;
  const start = addDays(first, -new Date(first).getUTCDay());
  const next = `${addMonths(ym, 1)}-01`;
  const weeks = Math.ceil(daysBetween(start, next) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

function pickDay(ym) {
  const keys = monthCells(ym).filter((k) => k.startsWith(ym));
  if (today.startsWith(ym) && eventsOn(today).length) return today;
  const pastMonth = ym < today.slice(0, 7);
  return keys.find((k) => (pastMonth || k >= today) && eventsOn(k).length) ?? (today.startsWith(ym) ? today : keys[0]);
}

// One day of the month grid: a button with the date, up to three event pills
// (dots on a phone) and a spoken summary.
function dayCell(key) {
  const list = eventsOn(key);
  const cls = ['day', key.startsWith(state.month) ? '' : 'outside', key < today ? 'past' : '', key === today ? 'today' : '', list.length ? 'has' : '', list.some((e) => e.headliner) ? 'headliner' : ''].filter(Boolean).join(' ');
  const pills = list.slice(0, 3).map((e) => {
    const ended = Date.parse(e.end) < now ? ' ended' : '';
    return e.headliner
      ? `<span class="pill headliner${ended}" title="${escapeHtml(e.title)}">${escapeHtml(label(e))}</span>`
      : `<span class="pill${ended}" title="${escapeHtml(e.title)}"><i>${e.allDay ? 'All day' : shortTime(e.start)}</i> ${escapeHtml(label(e))}</span>`;
  }).join('') + (list.length > 3 ? `<span class="more-n">+${list.length - 3} more</span>` : '');
  const dots = list.filter((e) => !e.headliner).map(() => '<i class="dot"></i>').join('');
  const name = `${dayName(key)}, ${list.length ? plural(list.length, 'event') : 'nothing scheduled'}`;
  // Only the selected day is in the tab order; arrow keys move between days.
  return `<button type="button" class="${cls}" data-day="${key}" aria-pressed="${key === state.day}" tabindex="${key === state.day ? 0 : -1}"${inRange(key) ? '' : ' disabled'}>
    <span class="sr-only">${name}</span><span class="day-num" aria-hidden="true">${Number(key.slice(8))}</span><span class="pills" aria-hidden="true">${pills}</span><span class="dots" aria-hidden="true">${dots}</span>
  </button>`;
}

function renderCalendar() {
  if (!state.day || !state.day.startsWith(state.month)) state.day = pickDay(state.month);
  const cells = monthCells(state.month).map(dayCell);
  const [y] = state.month.split('-');
  // At either end of the data the arrow stays in place (focus stays put) but says why it does nothing.
  const edge = (step) => {
    if (step < 0 ? state.month > firstMonth : state.month < lastMonth) return `aria-label="${step < 0 ? 'Previous' : 'Next'} month"`;
    const name = monthName(step < 0 ? firstMonth : lastMonth, true);
    return `aria-disabled="true" aria-label="${step < 0 ? `No listings before ${name}` : `Nothing listed after ${name}`}" title="${step < 0 ? `No listings before ${name}` : `Nothing listed after ${name}`}"`;
  };
  // Rebuilding the grid drops focus. Remember what had it and put it back.
  const had = calView.contains(document.activeElement) ? document.activeElement : null;
  calView.innerHTML = `
    <div class="cal-head">
      <h2>${monthName(state.month)}<span> ${y}</span></h2>
      <div class="cal-nav">
        <button type="button" class="btn btn-outline" data-month="-1" ${edge(-1)}>←</button>
        <button type="button" class="btn btn-outline" data-month="0">Today</button>
        <button type="button" class="btn btn-outline" data-month="1" ${edge(1)}>→</button>
      </div>
    </div>
    <div class="grid" role="group" aria-label="${monthName(state.month, true)}">
      ${WEEKDAYS.map((d) => `<span class="weekday" aria-hidden="true">${d}</span>`).join('')}
      ${cells.join('')}
    </div>
    <div class="cal-key"><span><i class="key-event"></i>Event</span><span><i class="key-headliner"></i>Conference</span>${dayPicked ? '' : '<span>Pick a day to see its events</span>'}</div>`;
  if (had?.dataset.month != null) $(`[data-month="${had.dataset.month}"]`, calView)?.focus({ preventScroll: true });
  else if (had?.dataset.day) $(`.day[data-day="${state.day}"]`, calView)?.focus({ preventScroll: true });
  renderDayPanel();
}

function renderDayPanel() {
  const list = eventsOn(state.day);
  const n = daysBetween(today, state.day);
  const rel = n === 0 ? ' · today' : n === 1 ? ' · tomorrow' : '';
  dayPanel.innerHTML = `<h2>${dayName(state.day)}</h2>
    <p class="sub">${list.length ? plural(list.length, 'event') : 'A quiet day'}${rel}</p>`;
  if (!list.length) {
    dayPanel.insertAdjacentHTML('beforeend', '<p class="none">Nothing on the books. Pick a day with a mark.</p>');
    return;
  }
  // A card still on its way: say so for the moment it takes.
  if (!poolFailed && list.some((e) => !cards.has(e.id))) {
    loadPool();
    dayPanel.insertAdjacentHTML('beforeend', '<p class="none" aria-busy="true">Loading events…</p>');
    return;
  }
  const ul = document.createElement('ul');
  ul.className = 'shows';
  for (const e of list) {
    const card = cards.get(e.id)?.cloneNode(true);
    if (!card) {
      // The pool didn't load (offline before it was ever saved): the title,
      // linked to the event's page, still says what was on.
      const href = e.url ?? groups[e.groups[0]]?.url;
      ul.insertAdjacentHTML('beforeend', `<li class="show"><div class="body"><h3 class="title">${href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(e.title)}<span class="sr-only"> (opens in new tab)</span></a>`
        : escapeHtml(e.title)}</h3></div></li>`);
      continue;
    }
    card.hidden = false;
    card.classList.remove('same-day', 'addr-seen');
    const tag = $('.when-tag', card);
    if (tag) tag.hidden = true;
    // The panel hides the card's date block, so a conference's time line
    // gives its whole range here ("Thu–Fri Oct 15–16", not "through Fri").
    const time = $('.time[data-full]', card);
    if (time) time.textContent = time.dataset.full;
    const desc = $('.desc', card);
    if (desc) { desc.id += '-day'; desc.hidden = true; $('.more', card)?.setAttribute('aria-controls', desc.id); }
    // Over (a past day, or earlier today): read it like Recent events does.
    // "went", not "going", and no RSVP button; the title still links to it.
    if (Date.parse(e.end) <= now) {
      const going = $('.going', card);
      if (going) going.lastChild.textContent = ' went';
      $('.rsvp', card)?.remove();
      const acts = $('.acts', card);
      if (acts && !acts.children.length) acts.remove();
    }
    ul.append(card);
  }
  dayPanel.append(ul);
}

function renderMinical() {
  const ym = today.slice(0, 7);
  const cells = monthCells(ym).map((key) => {
    if (!key.startsWith(ym)) return '<span class="blank" aria-hidden="true"></span>';
    const list = eventsOn(key);
    const cls = [list.length ? 'has' : '', list.some((e) => e.headliner) ? 'headliner' : '', key === today ? 'today' : '', key < today ? 'past' : ''].filter(Boolean).join(' ');
    // One tab stop (today); arrow keys move between days, as in the big calendar.
    return `<button type="button" class="${cls}" data-goto="${key}" tabindex="${key === today ? 0 : -1}" aria-label="${dayName(key)}, ${list.length ? plural(list.length, 'event') : 'nothing scheduled'}">${Number(key.slice(8))}</button>`;
  });
  minical.innerHTML = `<h2>${monthName(ym)} <a href="?view=calendar" data-nav="calendar">Full calendar</a></h2>
    <div class="mini-grid" role="group" aria-label="${monthName(ym, true)}">${WEEKDAYS.map((d) => `<span class="weekday" aria-hidden="true">${d[0]}</span>`).join('')}${cells.join('')}</div>`;
}

// ---- render ----
let listShown = 0;
function render() {
  const viewName = state.view === 'calendar' ? 'Calendar' : '';
  const groupName = state.group ? groups[state.group].short : state.q ? `'${state.q}'` : '';
  document.title = groupName || viewName ? [groupName, viewName, siteName].filter(Boolean).join(' · ') : siteTitle;
  for (const a of $$('.nav a[data-nav]')) {
    if (a.dataset.nav === state.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  listView.hidden = state.view !== 'list';
  calView.hidden = state.view !== 'calendar';
  // Layout.astro sets this before first paint for ?view=calendar links; the
  // CSS that reads it must agree with the hidden flags above.
  if (state.view === 'calendar') document.documentElement.dataset.view = 'calendar';
  else delete document.documentElement.dataset.view;
  // The calendar, a search and one group's past all read the card pool.
  if (state.view === 'calendar' || state.q || state.group) loadPool();
  if (state.view === 'list') { listShown = renderList(); renderMinical(); } else { pastResults.hidden = true; highlight(); renderCalendar(); }
  renderSide();
  syncSearchBox();
  syncUrl();
}

const monthCount = () => events.filter((e) => dayKey(e.start).startsWith(state.month) && matches(e.groups)).length;
function announceFilter() {
  const who = state.group ? ` from ${groups[state.group].short}` : '';
  if (state.q) announce(searchSummary());
  else if (state.view === 'list') announce(`Showing ${plural(listShown, 'event')}${who}`);
  else announce(`Calendar showing ${plural(monthCount(), 'event')}${who} in ${monthName(state.month)}`);
}
function searchSummary() {
  const q = `'${state.q}'`;
  if (listShown) return `Showing ${plural(listShown, 'event')} matching ${q}${pastShown ? `, plus ${plural(pastShown, 'past event')}` : ''}`;
  if (pastShown) return `Nothing coming up matches ${q}. Showing ${plural(pastShown, 'past event')}`;
  return poolReady ? `Nothing matches ${q}, coming up or past` : `Nothing coming up matches ${q}`;
}
const dayStatus = () => { const n = eventsOn(state.day).length; return `${dayName(state.day)}: ${n ? plural(n, 'event') : 'nothing scheduled'}`; };

// ---- search box ----
// The magnifier opens a box under the nav. Typing filters the list at once and
// keeps ?q= in the URL (replacing it, so Back isn't a keystroke at a time);
// the status line waits for a pause. Closing it (×, Escape, the magnifier
// again) always clears the search, so a closed box never hides events.
const searchBtn = $('#search-btn');
const searchForm = $('#search');
const searchInput = $('#q');
let announceTimer;
function showSearchBox(open) {
  searchForm.hidden = !open;
  searchBtn.setAttribute('aria-expanded', String(open));
}
function setQuery(q) {
  state.q = q.trim().slice(0, 100);
  // Leaving a group or the calendar for a search is one Back step (syncUrl
  // pushes when view or group change); each keystroke after that is not.
  if (state.q) { state.group = ''; state.view = 'list'; }
  render();
  clearTimeout(announceTimer);
  announceTimer = setTimeout(announceFilter, 600);
}
function closeSearch() {
  if (state.q) { searchInput.value = ''; setQuery(''); }
  showSearchBox(false);
  searchBtn.focus();
}
searchBtn.addEventListener('click', () => {
  if (searchForm.hidden) { showSearchBox(true); searchInput.focus(); } else closeSearch();
});
searchInput.addEventListener('input', () => setQuery(searchInput.value));
searchInput.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); closeSearch(); } });
// Enter puts the phone keyboard away so the results show.
searchForm.addEventListener('submit', (ev) => { ev.preventDefault(); searchInput.blur(); });
$('#search-clear').addEventListener('click', closeSearch);
// A shared ?q= link opens with the box showing what was searched.
function syncSearchBox() {
  if (searchInput.value.trim() !== state.q) searchInput.value = state.q;
  if (state.q) showSearchBox(true);
  else if (document.activeElement !== searchInput) showSearchBox(false);
}

// ---- events ----
document.addEventListener('click', (ev) => {
  const t = ev.target;

  if (t.closest('[data-clear-search]')) {
    searchInput.value = '';
    searchInput.focus(); // first, so the box stays open (see syncSearchBox)
    setQuery('');
    return;
  }

  const nav = t.closest('[data-nav="list"], [data-nav="calendar"]');
  if (nav) {
    ev.preventDefault();
    if (nav.dataset.nav === state.view) { scrollTo({ top: 0 }); return; }
    state.view = nav.dataset.nav;
    if (state.view === 'calendar') { state.month = (state.day ?? today).slice(0, 7); state.q = ''; }
    render();
    scrollTo({ top: 0 });
    announce(state.view === 'calendar' ? `Calendar, ${monthName(state.month, true)}` : 'Event list');
    return;
  }

  if (t.closest('[data-show-all]')) {
    state.group = '';
    render();
    // The button just hid itself with the note; land on the full list.
    listView.tabIndex = -1;
    listView.focus();
    announceFilter();
    return;
  }

  const groupLink = t.closest('a[data-group]');
  if (groupLink && !ev.metaKey && !ev.ctrlKey) {
    ev.preventDefault();
    state.group = groupLink.dataset.group;
    state.view = 'list';
    state.q = '';
    render();
    $('#filter').scrollIntoView({ block: 'start' });
    announceFilter();
    return;
  }

  const more = t.closest('.more');
  if (more) {
    toggleAbout(more);
    return;
  }

  const all = t.closest('#recent-all');
  if (all) {
    const open = all.getAttribute('aria-expanded') !== 'true';
    all.setAttribute('aria-expanded', String(open));
    $('#recent-list').classList.toggle('open', open);
    all.textContent = open ? '− Fewer' : `+ All ${$$('#recent-list li:not([hidden])').length}`;
    return;
  }

  const goto = t.closest('[data-goto]');
  if (goto) {
    state.view = 'calendar';
    state.day = goto.dataset.goto;
    dayPicked = true;
    state.month = state.day.slice(0, 7);
    render();
    // The mini calendar is hidden in calendar view; move focus to the same day.
    $(`.day[data-day="${state.day}"]`, calView)?.focus({ preventScroll: true });
    announce(dayStatus());
    scrollTo({ top: 0 });
    return;
  }

  const monthBtn = t.closest('[data-month]');
  if (monthBtn?.getAttribute('aria-disabled') === 'true') return;
  if (monthBtn) {
    const step = Number(monthBtn.dataset.month);
    state.month = step === 0 ? today.slice(0, 7) : addMonths(state.month, step);
    state.day = step === 0 ? today : null;
    render();
    announce(`${monthName(state.month, true)}`);
    return;
  }

  const cell = t.closest('.day[data-day]');
  if (cell) {
    state.day = cell.dataset.day;
    dayPicked = true;
    if (!state.day.startsWith(state.month)) state.month = state.day.slice(0, 7);
    render();
    announce(dayStatus());
    if (matchMedia('(max-width: 1059px)').matches) dayPanel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
});

// Calendar grid keys, for the month and the mini calendar: arrows move a day
// or a week, Home/End go to the ends of the week. Enter/Space pick the day
// (they're buttons). Stops at the grid edge. `attr` holds each day's date.
function gridKeys(root, attr) {
  root.addEventListener('keydown', (ev) => {
    const cell = ev.target.closest(`button[${attr}]`);
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key];
    if (!cell || ev.altKey || ev.ctrlKey || ev.metaKey || (step == null && ev.key !== 'Home' && ev.key !== 'End')) return;
    ev.preventDefault();
    const key = cell.getAttribute(attr);
    const dow = new Date(key).getUTCDay();
    const to = step != null ? addDays(key, step) : addDays(key, ev.key === 'Home' ? -dow : 6 - dow);
    const next = $(`button[${attr}="${to}"]`, root);
    if (!next || next.disabled) return;
    cell.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
  });
}
gridKeys(calView, 'data-day');
gridKeys(minical, 'data-goto');

// Back/Forward: the URL changed under us, so read it again. The status line
// says what is showing now, the same as a click would.
addEventListener('popstate', () => {
  const before = `${state.view}|${state.group}|${state.day}|${state.q}`;
  readUrl();
  if (`${state.view}|${state.group}|${state.day}|${state.q}` === before) return; // e.g. Back from the skip link's #main
  synced = null; // the URL is already right; don't push it again
  // Back out of a search: close the box even if it has focus.
  if (!state.q && !searchForm.hidden) {
    const hadFocus = searchForm.contains(document.activeElement);
    showSearchBox(false);
    if (hadFocus) searchBtn.focus();
  }
  render();
  announceFilter();
});

// The search button on other pages links here as /?search: open the box ready
// to type. Read before render(), whose syncUrl tidies ?search out of the URL.
const openSearch = new URLSearchParams(location.search).has('search') && !state.q;
render();
if (openSearch) { showSearchBox(true); searchInput.focus(); }

// A page left open, or an app on a phone's home screen (which iOS resumes
// as it was), keeps its labels current: when it comes back into view and once
// a minute while it's showing. Layout.astro reloads a page over an hour old;
// on a new day the sections and the calendar's today are stale too, so reload.
function keepCurrent() {
  if (document.hidden) return;
  const t = Date.now();
  if (dayKey(t) !== today) {
    // A calendar on this month with a day it picked for itself (not one
    // someone chose) put that day in the address; drop it, so the reload
    // picks again for the new today instead of reopening on yesterday.
    if (state.view === 'calendar' && !dayPicked && state.month === today.slice(0, 7)) {
      const url = new URL(location.href);
      url.searchParams.delete('day');
      history.replaceState(null, '', url);
    }
    location.reload();
    return;
  }
  if (freshen(t)) { listShown = renderList(); renderSide(); }
}
document.addEventListener('visibilitychange', keepCurrent);
addEventListener('pageshow', (e) => { if (e.persisted) keepCurrent(); });
setInterval(keepCurrent, 60_000);

// About opens and closes smoothly: the panel's height animates, and on
// desktop a copy of the photo flies between the thumbnail on the right and its
// full-size spot in the panel, both ways. The layout itself never jumps: the
// thumbnail keeps its column (just hidden) while the panel is open.
// Reduced motion gets the plain toggle.
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const MS = 380;

async function toggleAbout(more) {
  const card = more.closest('.show');
  if (card.dataset.animating) return;
  const desc = $('.desc', card);
  const open = more.getAttribute('aria-expanded') !== 'true';
  const set = (isOpen) => {
    more.setAttribute('aria-expanded', String(isOpen));
    desc.hidden = !isOpen;
    card.classList.toggle('open', isOpen);
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return set(open);

  const thumb = $('.photo img', card);
  const big = $('.desc-photo', card);
  const fly = thumb?.offsetParent && big;
  card.dataset.animating = '1';
  try {
    if (open) {
      // A photo with no width/height (not from Meetup) has no shape until it
      // loads; wait for it so the panel grows to its real height.
      if (fly || (big && !big.hasAttribute('height'))) { big.loading = 'eager'; await big.decode().catch(() => {}); }
      const from = fly && thumb.getBoundingClientRect();
      set(true);
      // Measure where the photo lands before the panel starts growing: the
      // grow animation begins with no padding or margin, which would aim the
      // photo ~18px high and make it pop down at the end.
      const to = fly && big.getBoundingClientRect();
      const grow = slide(desc, true);
      if (fly) await flyImage(big, from, to, { rotate: [rotation(thumb), 0], hide: [big] });
      await grow;
    } else {
      const from = fly && big.getBoundingClientRect();
      const to = fly && thumb.getBoundingClientRect(); // the thumbnail keeps its spot while hidden
      const shrink = slide(desc, false);
      if (fly) await flyImage(big, from, to, { rotate: [0, rotation(thumb)], hide: [big, thumb] });
      await shrink;
      set(false);
    }
  } finally {
    delete card.dataset.animating;
  }
}

// Animate a panel's height, padding and margin between 0 and its natural size.
function slide(el, opening) {
  const cs = getComputedStyle(el);
  const full = { height: cs.height, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, opacity: 1 };
  const none = { height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', opacity: 0 };
  el.style.overflow = 'hidden';
  const anim = el.animate(opening ? [none, full] : [full, none], { duration: MS, easing: EASE, fill: 'forwards' });
  return anim.finished.then(() => { anim.cancel(); el.style.overflow = ''; });
}

// Fly a copy of `img` from one box to another above the page, hiding the real
// images until it lands.
function flyImage(img, from, to, { rotate, hide }) {
  const ghost = img.cloneNode();
  ghost.removeAttribute('loading');
  ghost.className = 'about-ghost';
  ghost.alt = '';
  Object.assign(ghost.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
  document.body.append(ghost);
  for (const el of hide) el.style.visibility = 'hidden';
  const at = (r, deg) => `translate(${r.left - to.left}px, ${r.top - to.top}px) scale(${r.width / to.width}, ${r.height / to.height}) rotate(${deg}deg)`;
  const anim = ghost.animate([{ transform: at(from, rotate[0]) }, { transform: at(to, rotate[1]) }], { duration: MS, easing: EASE });
  return anim.finished.then(() => {
    for (const el of hide) el.style.visibility = '';
    ghost.remove();
  });
}

// The thumbnail is printed slightly crooked (see .photo .ink in the CSS).
function rotation(thumb) {
  const m = new DOMMatrix(getComputedStyle(thumb.closest('.ink')).transform);
  return Math.round(Math.atan2(m.b, m.a) * (180 / Math.PI) * 10) / 10;
}
