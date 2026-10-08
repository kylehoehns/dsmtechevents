// Events page behavior: list/calendar views, the group filter, relative
// labels ("Tomorrow", "8 days out"), squashing repeated dates and addresses,
// the month calendar and the mini calendar in the side rail.
// State lives in the URL (?view=calendar&group=cijug&day=2026-10-15) so any
// view can be shared or bookmarked.
import { dayKey, fullDate } from '../lib/format.mjs';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const { events, groups } = JSON.parse($('#calendar-data').textContent);
const listView = $('#list-view');
const calView = $('#calendar-view');
const dayPanel = $('#day-panel');
const minical = $('#minical');
const recent = $('#recent');
const status = $('#status');
const siteTitle = document.title;
const now = Date.now();
const today = dayKey(new Date().toISOString());
const DAY = 86_400_000;
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

// ---- cards: every event has one, in the list or in the hidden pool ----
const cards = new Map();
for (const el of $$('.show', listView)) cards.set(el.dataset.id, el);
for (const el of $$('.show', $('#card-pool').content)) cards.set(el.dataset.id, el);

// The page is built ahead of time; drop anything that has ended since.
for (const el of $$('[data-end]', listView)) if (Date.parse(el.dataset.end) <= now) el.remove();
for (const el of $$('.poster[data-end]')) if (Date.parse(el.dataset.end) <= now) el.remove();

// ---- relative labels ----
function relLabel(startIso, endIso) {
  const start = dayKey(startIso), end = dayKey(endIso);
  if (start <= today && today <= end) return Date.parse(startIso) <= now ? 'Happening now' : 'Tonight';
  const n = daysBetween(today, start);
  return n === 1 ? 'Tomorrow' : '';
}
// The build already printed these for the day it ran (see EventCard.astro);
// they only change for a page opened on a later day, or once an event starts.
for (const el of $$('.show', listView)) {
  const label = relLabel(el.dataset.start, el.dataset.end);
  const tag = $('.when-tag', el);
  if (!tag) continue;
  if (tag.textContent !== label) tag.textContent = label;
  tag.hidden = !label;
}
for (const el of $$('.countdown[data-start]')) {
  const n = daysBetween(today, dayKey(el.dataset.start));
  el.textContent = Date.parse(el.dataset.start) <= now ? 'Happening now' : n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${n} days out`;
}

// ---- state ----
const state = {};
function readUrl() {
  const params = new URLSearchParams(location.search);
  state.view = params.get('view') === 'calendar' ? 'calendar' : 'list';
  state.group = groups[params.get('group')] ? params.get('group') : '';
  state.day = /^\d{4}-\d{2}-\d{2}$/.test(params.get('day') ?? '') ? params.get('day') : null;
  state.month = (state.day ?? today).slice(0, 7);
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
  const url = p.size ? `?${p}` : location.pathname;
  const key = `${state.view}|${state.group}`;
  if (synced != null && synced !== key) history.pushState(null, '', url);
  else history.replaceState(null, '', url);
  synced = key;
}
const matches = (groupsAttr) => !state.group || (groupsAttr ?? '').split(' ').includes(state.group);

// ---- list ----
function renderList() {
  let anyVisible = false;
  for (const sec of $$('[data-sec]', listView)) {
    const items = $$('.show, .far > li', sec);
    let n = 0;
    for (const el of items) { el.hidden = !matches(el.dataset.groups); if (!el.hidden) n++; }
    sec.hidden = n === 0;
    anyVisible ||= n > 0;
    const count = $('[data-count]', sec);
    count.textContent = $('.far', sec) ? `${n} on the books` : `${n} ${n === 1 ? 'event' : 'events'}`;
  }
  const empty = $('#list-empty');
  empty.hidden = anyVisible;
  if (!anyVisible && state.group) {
    const g = groups[state.group];
    empty.innerHTML = `Nothing on the books for this group right now. ${g.url
      ? `Check <a href="${escapeHtml(g.url)}" target="_blank" rel="noopener">their page<span class="sr-only"> (opens in new tab)</span></a> for what's next.`
      : 'Check their page for what\'s next.'}`;
  }
  squashRepeats();
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

// ---- side rail: filter, recent, headliners ----
function renderSide() {
  for (const c of $$('.chip')) c.setAttribute('aria-pressed', String(c.dataset.chip === state.group));
  const note = $('#filter-note');
  note.hidden = !state.group;
  if (state.group) note.innerHTML = `Showing only <b>${escapeHtml(groups[state.group].name)}</b>. <button type="button" data-chip="">Show all groups</button>`;

  for (const p of $$('.poster')) p.hidden = !!state.group && !matches(p.dataset.groups);
  // The calendar already shows conference days in pink; skip the posters there.
  const headliners = $('#headliners');
  if (headliners) headliners.hidden = state.view === 'calendar' || $$('.poster', headliners).every((p) => p.hidden);

  const list = $('#recent-list');
  let shown = 0;
  for (const li of $$('li', list)) {
    li.hidden = !matches(li.dataset.groups);
    if (!li.hidden) li.classList.toggle('extra', ++shown > 8);
  }
  const all = $('#recent-all');
  if (all) all.hidden = shown <= 8;
  recent.hidden = state.view === 'calendar' || shown === 0;
  minical.hidden = state.view === 'calendar';
  dayPanel.hidden = state.view !== 'calendar';
}

// ---- calendar ----
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const addDays = (key, n) => new Date(Date.parse(key) + n * DAY).toISOString().slice(0, 10);
const addMonths = (ym, n) => { const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const monthLabel = (ym) => new Date(`${ym}-15T12:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
const timeShort = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })
  .format(new Date(iso)).replace(':00', '').replace(/\s?AM$/, 'a').replace(/\s?PM$/, 'p');
const eventsOn = (key) => events
  .filter((e) => dayKey(e.start) <= key && key <= dayKey(e.end) && matches(e.groups.join(' ')))
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

function renderCalendar() {
  if (!state.day || !state.day.startsWith(state.month)) state.day = pickDay(state.month);
  const cells = monthCells(state.month).map((key) => {
    const list = eventsOn(key);
    const conf = list.some((e) => e.featured);
    const cls = ['day', key.startsWith(state.month) ? '' : 'outside', key < today ? 'past' : '', key === today ? 'today' : '', list.length ? 'has' : '', conf ? 'conf' : ''].filter(Boolean).join(' ');
    const pills = list.slice(0, 3).map((e) => {
      const ended = Date.parse(e.end) < now ? ' ended' : '';
      return e.featured
        ? `<span class="pill c${ended}" title="${escapeHtml(e.title)}">${escapeHtml(label(e))}</span>`
        : `<span class="pill${ended}" title="${escapeHtml(e.title)}"><i>${e.allDay ? 'All day' : timeShort(e.start)}</i> ${escapeHtml(label(e))}</span>`;
    }).join('') + (list.length > 3 ? `<span class="more-n">+${list.length - 3} more</span>` : '');
    const dots = list.filter((e) => !e.featured).map(() => '<i class="dot"></i>').join('');
    const name = `${fullDate(`${key}T17:00:00Z`)}${list.length ? `, ${list.length} event${list.length > 1 ? 's' : ''}` : ', nothing scheduled'}`;
    // Only the selected day is in the tab order; arrow keys move between days.
    return `<button type="button" class="${cls}" data-day="${key}" aria-pressed="${key === state.day}" tabindex="${key === state.day ? 0 : -1}">
      <span class="sr-only">${name}</span><span class="n" aria-hidden="true">${Number(key.slice(8))}</span><span class="pills" aria-hidden="true">${pills}</span><span class="dots" aria-hidden="true">${dots}</span>
    </button>`;
  });
  const [y] = state.month.split('-');
  // Rebuilding the grid drops focus. Remember what had it and put it back.
  const had = calView.contains(document.activeElement) ? document.activeElement : null;
  calView.innerHTML = `
    <div class="cal-head">
      <h2>${monthLabel(state.month)}<span> ${y}</span></h2>
      <div class="cal-nav">
        <button type="button" data-month="-1" aria-label="Previous month">←</button>
        <button type="button" data-month="0">Today</button>
        <button type="button" data-month="1" aria-label="Next month">→</button>
      </div>
    </div>
    <div class="grid" role="group" aria-label="${monthLabel(state.month)} ${y}">
      ${WEEKDAYS.map((d) => `<span class="wd" aria-hidden="true">${d}</span>`).join('')}
      ${cells.join('')}
    </div>
    <div class="cal-key"><span><i class="k1"></i>Meetup</span><span><i class="k2"></i>Conference</span><span>Tap a day to see its events</span></div>`;
  if (had?.dataset.month != null) $(`[data-month="${had.dataset.month}"]`, calView)?.focus({ preventScroll: true });
  else if (had?.dataset.day) $(`.day[data-day="${state.day}"]`, calView)?.focus({ preventScroll: true });
  renderDayPanel();
}

function renderDayPanel() {
  const list = eventsOn(state.day);
  const n = daysBetween(today, state.day);
  const rel = n === 0 ? ' · today' : n === 1 ? ' · tomorrow' : '';
  dayPanel.innerHTML = `<h2>${fullDate(`${state.day}T17:00:00Z`)}</h2>
    <p class="sub">${list.length ? `${list.length} ${list.length === 1 ? 'event' : 'events'}` : 'A quiet day'}${rel}</p>`;
  if (!list.length) {
    dayPanel.insertAdjacentHTML('beforeend', '<p class="none">Nothing on the books. Pick a day with a mark.</p>');
    return;
  }
  const ul = document.createElement('ul');
  ul.className = 'shows';
  for (const e of list) {
    const card = cards.get(e.id)?.cloneNode(true);
    if (!card) continue;
    card.hidden = false;
    card.classList.remove('same-day', 'addr-seen');
    const tag = $('.when-tag', card);
    if (tag) tag.hidden = true;
    const desc = $('.desc', card);
    if (desc) { desc.id += '-day'; desc.hidden = true; $('.more', card)?.setAttribute('aria-controls', desc.id); }
    ul.append(card);
  }
  dayPanel.append(ul);
}

function renderMinical() {
  const ym = today.slice(0, 7);
  const cells = monthCells(ym).map((key) => {
    if (!key.startsWith(ym)) return '<span class="blank" aria-hidden="true"></span>';
    const list = eventsOn(key);
    const cls = [list.length ? 'has' : '', list.some((e) => e.featured) ? 'conf' : '', key === today ? 'today' : '', key < today ? 'past' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" data-goto="${key}" aria-label="${fullDate(`${key}T17:00:00Z`)}, ${list.length || 'no'} event${list.length === 1 ? '' : 's'}">${Number(key.slice(8))}</button>`;
  });
  minical.innerHTML = `<h2>${monthLabel(ym)} <a href="?view=calendar" data-nav="calendar">Full calendar</a></h2>
    <div class="mini-grid">${WEEKDAYS.map((d) => `<span class="wd" aria-hidden="true">${d[0]}</span>`).join('')}${cells.join('')}</div>`;
}

// ---- render ----
function render() {
  const viewName = state.view === 'calendar' ? 'Calendar' : '';
  const groupName = state.group ? groups[state.group].short : '';
  document.title = [groupName, viewName, siteTitle].filter(Boolean).join(' · ');
  for (const a of $$('.nav a[data-nav]')) {
    if (a.dataset.nav === state.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  listView.hidden = state.view !== 'list';
  calView.hidden = state.view !== 'calendar';
  // Layout.astro sets this before first paint for ?view=calendar links; the
  // CSS that reads it must agree with the hidden flags above.
  if (state.view === 'calendar') document.documentElement.dataset.view = 'calendar';
  else delete document.documentElement.dataset.view;
  if (state.view === 'list') { renderList(); renderMinical(); } else renderCalendar();
  renderSide();
  syncUrl();
}

const visibleCount = () => $$('.show, .far > li', listView).filter((el) => !el.hidden && !el.closest('[hidden]')).length;
const monthCount = () => events.filter((e) => e.start.startsWith(state.month) && matches(e.groups.join(' '))).length;
function announceFilter() {
  const who = state.group ? ` from ${groups[state.group].short}` : '';
  if (state.view === 'list') { const n = visibleCount(); announce(`Showing ${n} ${n === 1 ? 'event' : 'events'}${who}`); }
  else { const n = monthCount(); announce(`Calendar showing ${n} ${n === 1 ? 'event' : 'events'}${who} in ${monthLabel(state.month)}`); }
}
const dayStatus = () => { const n = eventsOn(state.day).length; return `${fullDate(`${state.day}T17:00:00Z`)}: ${n ? `${n} ${n === 1 ? 'event' : 'events'}` : 'nothing scheduled'}`; };

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---- events ----
document.addEventListener('click', (ev) => {
  const t = ev.target;

  const nav = t.closest('[data-nav="list"], [data-nav="calendar"]');
  if (nav) {
    ev.preventDefault();
    state.view = nav.dataset.nav;
    if (state.view === 'calendar') state.month = (state.day ?? today).slice(0, 7);
    render();
    announce(state.view === 'calendar' ? `Calendar, ${monthLabel(state.month)} ${state.month.slice(0, 4)}` : 'Event list');
    scrollTo({ top: 0 });
    return;
  }

  const chip = t.closest('[data-chip]');
  if (chip) {
    state.group = chip.dataset.chip;
    // "Show all groups" lives in the note that this hides; land on the All chip.
    const fromNote = !!chip.closest('#filter-note');
    render();
    if (fromNote) $('.chip[data-chip=""]').focus();
    announceFilter();
    return;
  }

  const groupLink = t.closest('a[data-group]');
  if (groupLink && !ev.metaKey && !ev.ctrlKey) {
    ev.preventDefault();
    state.group = groupLink.dataset.group;
    state.view = 'list';
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
    all.textContent = open ? 'Fewer ↑' : `All ${$$('#recent-list li:not([hidden])').length} →`;
    return;
  }

  const goto = t.closest('[data-goto]');
  if (goto) {
    state.view = 'calendar';
    state.day = goto.dataset.goto;
    state.month = state.day.slice(0, 7);
    render();
    // The mini calendar is hidden in calendar view; move focus to the same day.
    $(`.day[data-day="${state.day}"]`, calView)?.focus({ preventScroll: true });
    announce(dayStatus());
    scrollTo({ top: 0 });
    return;
  }

  const monthBtn = t.closest('[data-month]');
  if (monthBtn) {
    const step = Number(monthBtn.dataset.month);
    state.month = step === 0 ? today.slice(0, 7) : addMonths(state.month, step);
    state.day = step === 0 ? today : null;
    render();
    announce(`${monthLabel(state.month)} ${state.month.slice(0, 4)}`);
    return;
  }

  const cell = t.closest('.day[data-day]');
  if (cell) {
    state.day = cell.dataset.day;
    if (!state.day.startsWith(state.month)) state.month = state.day.slice(0, 7);
    render();
    announce(dayStatus());
    if (matchMedia('(max-width: 1059px)').matches) dayPanel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
});

// Calendar grid keys: arrows move a day or a week, Home/End go to the ends of
// the week. Enter/Space pick the day (they're buttons). Stops at the grid edge.
calView.addEventListener('keydown', (ev) => {
  const cell = ev.target.closest('.day[data-day]');
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key];
  if (!cell || ev.altKey || ev.ctrlKey || ev.metaKey || (step == null && ev.key !== 'Home' && ev.key !== 'End')) return;
  ev.preventDefault();
  const key = cell.dataset.day;
  const dow = new Date(key).getUTCDay();
  const to = step != null ? addDays(key, step) : addDays(key, ev.key === 'Home' ? -dow : 6 - dow);
  const next = $(`.day[data-day="${to}"]`, calView);
  if (!next) return;
  cell.tabIndex = -1;
  next.tabIndex = 0;
  next.focus();
});

// Back/Forward: the URL changed under us, so read it again. The status line
// says what is showing now, the same as a click would.
addEventListener('popstate', () => {
  const before = `${state.view}|${state.group}|${state.day}`;
  readUrl();
  if (`${state.view}|${state.group}|${state.day}` === before) return; // e.g. Back from the skip link's #main
  synced = null; // the URL is already right; don't push it again
  render();
  announceFilter();
});

render();

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
      if (fly) { big.loading = 'eager'; await big.decode().catch(() => {}); }
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
