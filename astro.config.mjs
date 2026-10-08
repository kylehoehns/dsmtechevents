import { defineConfig, fontProviders } from 'astro/config';
import swPrecache from './scripts/sw-precache.mjs';

// Fonts are self-hosted from the @fontsource packages: latin subset, woff2,
// only the weights global.css uses. Astro copies them into /_astro/fonts/ and
// Layout.astro renders them with <Font />.
//
// Each face is limited to the latin range, the same range Google Fonts gave
// them. Characters outside it (→ ↗ ✕) skip down the stack to a system font,
// as they always have.
//
// optimizedFallbacks is off because Astro's generated fallback faces have no
// unicode-range: they would catch those arrows and draw them in Arial or
// Courier. global.css has hand-made metric-matched fallbacks instead
// ("DSM … fallback"), limited to the same range.
const LATIN = ['U+0000-00FF', 'U+0131', 'U+0152-0153', 'U+02BB-02BC', 'U+02C6', 'U+02DA', 'U+02DC', 'U+0304', 'U+0308', 'U+0329',
  'U+2000-206F', 'U+20AC', 'U+2122', 'U+2191', 'U+2193', 'U+2212', 'U+2215', 'U+FEFF', 'U+FFFD'];
const fontsource = (pkg, weights) => ({
  provider: fontProviders.local(),
  optimizedFallbacks: false,
  options: {
    variants: weights.map((weight) => ({
      weight,
      style: 'normal',
      unicodeRange: LATIN,
      src: [`@fontsource/${pkg}/files/${pkg}-latin-${weight}-normal.woff2`],
    })),
  },
});

export default defineConfig({
  site: 'https://dsmtechevents.com',
  // Lists every built CSS/JS/font file in dist/sw.js for offline use.
  integrations: [swPrecache()],
  fonts: [
    { name: 'Big Shoulders Display', cssVariable: '--display', fallbacks: ['DSM Display fallback', 'Arial Narrow', 'Impact', 'sans-serif'], ...fontsource('big-shoulders-display', [800, 900]) },
    { name: 'IBM Plex Mono', cssVariable: '--mono', fallbacks: ['DSM Mono fallback', 'ui-monospace', 'Menlo', 'monospace'], ...fontsource('ibm-plex-mono', [400, 500, 600, 700]) },
    { name: 'IBM Plex Sans', cssVariable: '--sans', fallbacks: ['DSM Sans fallback', 'ui-sans-serif', 'system-ui', 'sans-serif'], ...fontsource('ibm-plex-sans', [400, 500, 600, 700]) },
    // Only small stamps use it; swapping in late is fine.
    { name: 'Permanent Marker', cssVariable: '--marker', fallbacks: ['Comic Sans MS', 'cursive'], ...fontsource('permanent-marker', [400]) },
  ],
});
