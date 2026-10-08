// Browser tests (tests/e2e). `npm run test:e2e` runs them.
//
// The live data changes four times a day, so the tests build their own copy
// of the site from tests/e2e/fixtures/data, as if it were the moment in
// NOW (a Wednesday morning in Des Moines), into dist-e2e/. The browser's
// clock is set to the same moment (tests/e2e/fixtures.mjs), so the labels the
// page re-checks ("Tonight", "8 days out") agree with the build.
import net from 'node:net';
import { defineConfig } from '@playwright/test';
import { NOW } from './tests/e2e/fixtures.mjs';

// A free port, picked once. Workers load this file again, but they inherit
// the environment, so they all see the same port.
process.env.E2E_PORT ??= String(await new Promise((resolve) => {
  const srv = net.createServer().listen(0, () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
}));
const port = Number(process.env.E2E_PORT);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    // sw.js caches pages; a test should always see the page it just loaded.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    { name: 'phone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
  ],
  webServer: {
    command: `node --import ./scripts/fake-now.mjs node_modules/astro/bin/astro.mjs build --outDir dist-e2e --silent && node scripts/csp.mjs dist-e2e && node node_modules/astro/bin/astro.mjs preview --outDir dist-e2e --port ${port} --ignore-lock`,
    env: { DSM_DATA_DIR: 'tests/e2e/fixtures/data', FAKE_NOW: NOW },
    url: `http://localhost:${port}/`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'ignore',
  },
});
