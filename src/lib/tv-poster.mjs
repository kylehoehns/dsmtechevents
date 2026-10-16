// What the /tv/ posters share, whether the build draws them (tv.astro) or the
// browser does (event mode, src/scripts/tv-event.ts): how a QR code is drawn,
// what its label says, and how a poster looks once its event is on.

// The qrcode library's options for every code on the TV: ink on clear.
/** @type {import('qrcode').QRCodeToStringOptions} */
export const QR_OPTIONS = { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1d1b2b', light: '#0000' } };

// Under a poster's QR code. A Meetup page is where people RSVP; anywhere
// else, or once the event is on and there's nothing left to RSVP to, the code
// is for details.
export const scanLabel = (url, live = false) => (url?.includes('meetup.com') && !live ? 'Scan to RSVP' : 'Scan for details');

// Mark a poster as on now or not: its live styling, and its QR code's label.
// The label is a `.scan` element carrying the event's link in data-url.
/** @param {HTMLElement} poster @param {boolean} live */
export function setLive(poster, live) {
  poster.classList.toggle('is-live', live);
  const scan = /** @type {HTMLElement | null} */ (poster.querySelector('.scan'));
  if (scan) scan.textContent = scanLabel(scan.dataset.url, live);
}
