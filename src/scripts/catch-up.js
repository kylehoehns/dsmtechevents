// Groups and Status are built ahead of time, so an event can end while the
// page is up (or before it's opened). The build prints what each card says
// now and what it will say once each of the next few events ends; this shows
// the one that's current. Anything with data-end goes once that time passes;
// anything with data-after shows from that time on. Re-checked when the page
// comes back into view and once a minute, like the home page (app.js).
// On the home page it only touches the Groups view: app.js looks after the rest.
const root = document.getElementById('groups-view') ?? document;
function catchUp() {
  if (document.hidden) return;
  const t = Date.now();
  for (const el of root.querySelectorAll('[data-end]')) if (Date.parse(el.dataset.end) <= t) el.remove();
  for (const el of root.querySelectorAll('[data-after]')) el.hidden = Date.parse(el.dataset.after) > t;
}
catchUp();
document.addEventListener('visibilitychange', catchUp);
addEventListener('pageshow', (e) => { if (e.persisted) catchUp(); });
setInterval(catchUp, 60_000);
