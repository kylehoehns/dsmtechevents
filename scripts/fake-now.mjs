// Dev helper: build the site as if it were another moment, to check
// date-dependent views (headliner countdowns, Today/Tonight labels, the TV
// page) without waiting for the date. Shifts Date by a fixed offset.
//
//   FAKE_NOW=2026-10-15T15:00:00Z node --import ./scripts/fake-now.mjs \
//     node_modules/.bin/astro build --outDir /tmp/dist-oct15
//
// Then serve that folder and set the browser's clock to match (Playwright:
// page.clock.install({ time: new Date('2026-10-15T15:00:00Z') })).
const Real = Date;
const offset = Real.parse(process.env.FAKE_NOW) - Real.now();
if (Number.isNaN(offset)) throw new Error('set FAKE_NOW to an ISO time, e.g. 2026-10-15T15:00:00Z');
class FakeDate extends Real {
  constructor(...args) { if (args.length === 0) super(Real.now() + offset); else super(...args); }
  static now() { return Real.now() + offset; }
}
globalThis.Date = FakeDate;
