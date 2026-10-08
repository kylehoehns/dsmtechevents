// Checks the built site for mistakes that only show up in the output HTML.
// Runs after `astro build` (see package.json), so a failure stops the build.
//
// Glued words: Astro drops the line break between text and a tag on another
// source line, so "the\n<a>" renders as "the<a>" and "</a>\nfull" as
// "</a>full". Both have shipped once; this catches the next one.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const pages = fs.readdirSync(dist, { recursive: true }).filter((f) => f.endsWith('.html')).map((f) => path.join(dist, f));
const problems = [];

for (const file of pages) {
  // Glued-word checks look at markup only, not scripts or styles.
  const raw = fs.readFileSync(file, 'utf8');
  const html = raw.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
  const rel = path.relative(dist, file);
  for (const m of html.matchAll(/([A-Za-z0-9.,:;!?])<a\s/g)) {
    problems.push(`${rel}: text runs into a link: "…${html.slice(m.index - 30, m.index + 1).replace(/\s+/g, ' ')}<a"`);
  }
  for (const m of html.matchAll(/<\/a>([A-Za-z0-9])/g)) {
    problems.push(`${rel}: a link runs into text: "</a>${html.slice(m.index + 4, m.index + 34).replace(/\s+/g, ' ')}…"`);
  }
  // Structured data must parse, or search engines drop it silently.
  for (const m of raw.matchAll(/<script type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (err) { problems.push(`${rel}: embedded JSON doesn't parse (${err.message})`); }
  }
}

if (problems.length) {
  console.error(`check-dist: ${problems.length} problem(s) in the built site:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-dist: ${pages.length} pages OK`);
