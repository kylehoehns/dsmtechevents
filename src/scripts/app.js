// Events page behavior: list/calendar toggle, group filter,
// relative "Today" labels, and the calendar grid. State lives in the URL
// (?view=calendar&group=cijug&month=2026-11) so views can be shared.
import { dayKey, fullDate } from '../lib/format.mjs';

const { events, groups } = JSON.parse(document.getElementById('calendar-data').textContent);
const listView = document.getElementById('list-view');
const calView = document.getElementById('calendar-view');
const now = Date.now();
const today = dayKey(new Date().toISOString());

// Every event has one card in the list (upcoming or past). The calendar's day
// panel shows copies of those same cards, so keep a handle on each one.
const cards = new Map([...listView.querySelectorAll('.event')].map((c) => [c.dataset.id, c]));

// The list's upcoming section is built nightly, so drop cards that have ended
// since the build. The calendar can still show them, marked as past.
document.querySelectorAll('[data-end]').forEach((el) => {
  if (new Date(el.dataset.end).getTime() <= now) {
    el.remove();
    el.classList.add('is-past');
  }
});

const params = new URLSearchParams(location.search);
const storage = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
const state = {
  view: params.get('view') ?? storage.get('view') ?? (matchMedia('(min-width: 900px)').matches ? 'calendar' : 'list'),
  group: groups[params.get('group')] ? params.get('group') : '',
  month: params.get('month') ?? today.slice(0, 7),
  day: null,
};

const matches = (groupIds) => !state.group || groupIds.includes(state.group);

function syncUrl() {
  const p = new URLSearchParams();
  p.set('view', state.view);
  if (state.group) p.set('group', state.group);
  if (state.view === 'calendar' && state.month !== today.slice(0, 7)) p.set('month', state.month);
  history.replaceState(null, '', p.size ? `?${p}` : location.pathname);
}

function render() {
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === state.view)));

  const banner = document.getElementById('active-group');
  banner.hidden = !state.group;
  if (state.group) banner.querySelector('strong').textContent = groups[state.group].name;

  listView.hidden = state.view !== 'list';
  calView.hidden = state.view !== 'calendar';
  state.view === 'list' ? renderList() : renderCalendar();
  syncUrl();
}

// ---- List ---------------------------------------------------------------

function renderList() {
  let any = false;
  document.querySelectorAll('.feature').forEach((el) => {
    el.hidden = !matches(el.dataset.groups.split(' '));
  });
  const past = listView.querySelector('.past-events');
  if (past) {
    let visible = 0;
    past.querySelectorAll('.event').forEach((card) => {
      card.hidden = !matches(card.dataset.groups.split(' '));
      if (!card.hidden) visible++;
    });
    past.hidden = visible === 0;
  }
  listView.querySelectorAll('.month').forEach((month) => {
    let visible = 0;
    month.querySelectorAll('.event').forEach((card) => {
      const show = matches(card.dataset.groups.split(' '));
      card.hidden = !show;
      if (show) visible++;
    });
    month.hidden = visible === 0;
    any ||= visible > 0;
  });
  listView.querySelector('.empty').hidden = any;
}

function relativeLabel(startIso, endIso) {
  const start = dayKey(startIso);
  const end = dayKey(endIso);
  if (start <= today && today <= end) return new Date(startIso).getTime() <= now ? 'Happening now' : 'Today';
  const days = Math.round((Date.parse(start) - Date.parse(today)) / 86_400_000);
  if (days === 1) return 'Tomorrow';
  if (days < 7) return 'This week';
  return '';
}

listView.querySelectorAll('.event:not(.is-past)').forEach((card) => {
  const label = relativeLabel(card.dataset.start, card.dataset.end);
  const el = card.querySelector('.when');
  if (label) { el.textContent = label; el.classList.add('on'); }
});

// ---- Calendar -----------------------------------------------------------

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Plain calendar-date math in UTC, so the viewer's time zone never shifts a day.
const addDays = (key, n) => new Date(Date.parse(key) + n * 86_400_000).toISOString().slice(0, 10);
const addMonths = (ym, n) => {
  const d = new Date(`${ym}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const monthName = (ym) => new Date(`${ym}-15T12:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function eventsOn(key) {
  return events.filter((e) => dayKey(e.start) <= key && key <= dayKey(e.end) && matches(e.groups));
}

function renderCalendar() {
  const first = `${state.month}-01`;
  const gridStart = addDays(first, -new Date(first).getUTCDay());
  const nextMonth = `${addMonths(state.month, 1)}-01`;
  const weeks = Math.ceil((Date.parse(nextMonth) - Date.parse(gridStart)) / (7 * 86_400_000));

  if (!state.day || !state.day.startsWith(state.month)) {
    // Select today if it's in view, otherwise the next day with something on
    // (or, for a past month, its first day with something on).
    const pastMonth = state.month < today.slice(0, 7);
    let pick = null;
    for (let d = first; d < nextMonth; d = addDays(d, 1)) {
      if ((pastMonth || d >= today) && eventsOn(d).length) { pick = d; break; }
    }
    state.day = today.startsWith(state.month) && eventsOn(today).length ? today : pick;
  }

  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const key = addDays(gridStart, i);
    const list = eventsOn(key);
    const classes = ['day'];
    if (!key.startsWith(state.month)) classes.push('outside');
    if (key === today) classes.push('today');
    if (key < today) classes.push('past');
    if (key === state.day) classes.push('selected');
    if (list.length) classes.push('has-events');
    const pills = list.slice(0, 3).map((e) => {
      const g = groups[e.groups[0]];
      const label = g ? `${g.short}: ${e.title}` : e.title;
      const ended = Date.parse(e.end) < now;
      return `<span class="pill${e.featured ? ' featured' : ''}${ended ? ' ended' : ''}" style="--c:${g?.color ?? 'var(--accent)'}" title="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
    }).join('');
    const more = list.length > 3 ? `<span class="more">+${list.length - 3} more</span>` : '';
    const dots = list.map((e) => `<i style="--c:${groups[e.groups[0]]?.color ?? 'var(--accent)'}"></i>`).join('');
    const label = `${fullDate(`${key}T12:00:00Z`)}${list.length ? `, ${list.length} event${list.length > 1 ? 's' : ''}` : ''}`;
    cells.push(`<button type="button" class="${classes.join(' ')}" data-key="${key}" aria-label="${label}">
      <span class="n">${Number(key.slice(8))}</span>
      <span class="pills">${pills}${more}</span>
      <span class="dots">${dots}</span>
    </button>`);
  }

  calView.innerHTML = `
    <div class="cal-head">
      <h2>${monthName(state.month)}</h2>
      <div class="cal-nav">
        <button type="button" data-nav="-1" aria-label="Previous month">‹</button>
        <button type="button" data-nav="0">Today</button>
        <button type="button" data-nav="1" aria-label="Next month">›</button>
      </div>
    </div>
    <div class="cal-grid" role="grid">
      ${WEEKDAYS.map((d) => `<span class="wd">${d}</span>`).join('')}
      ${cells.join('')}
    </div>
    <div class="day-panel" aria-live="polite"></div>`;
  fillDayPanel(calView.querySelector('.day-panel'), state.day);
}

function fillDayPanel(panel, key) {
  if (!key) {
    panel.innerHTML = `<p class="muted">Nothing on the calendar this month${state.group ? ' for this group' : ''}.</p>`;
    return;
  }
  const list = eventsOn(key);
  panel.innerHTML = `<h3>${fullDate(`${key}T12:00:00Z`)}</h3>`;
  if (!list.length) {
    panel.insertAdjacentHTML('beforeend', '<p class="muted">No events this day.</p>');
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'events';
  for (const e of list) {
    const card = cards.get(e.id)?.cloneNode(true);
    if (!card) continue;
    card.hidden = false;
    wrap.append(card);
  }
  panel.append(wrap);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---- Events -------------------------------------------------------------

document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
  state.view = b.dataset.view;
  storage.set('view', state.view);
  render();
}));

document.querySelector('#active-group button').addEventListener('click', () => {
  state.group = '';
  render();
});

calView.addEventListener('click', (ev) => {
  const nav = ev.target.closest('[data-nav]');
  if (nav) {
    const n = Number(nav.dataset.nav);
    state.month = n === 0 ? today.slice(0, 7) : addMonths(state.month, n);
    state.day = n === 0 ? today : null;
    return render();
  }
  const cell = ev.target.closest('.day');
  if (cell) {
    if (!cell.dataset.key.startsWith(state.month)) state.month = cell.dataset.key.slice(0, 7);
    state.day = cell.dataset.key;
    render();
    if (matchMedia('(max-width: 640px)').matches) calView.querySelector('.day-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

render();
