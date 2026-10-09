// The home page search's matching rules (app.js), here so they can be tested.
// Every word typed must be found in what a card says:
// - A short word (under 4 characters) or one with ".", "#" or "+" must start
//   a word: "ai" finds "AI" but not "said", ".net" finds ".NET" but not
//   "networking", "net" finds ".NET".
// - A longer plain word may sit inside a word ("telemetry" finds
//   "OpenTelemetry"), and a trailing "s" is dropped ("agents" finds "agent").
// - A word in SYNONYMS (synonyms.mjs) also matches its synonyms, by the same
//   rules, except that a short one must be a whole word (or plural), so "ml"
//   from "ai" doesn't find "MLH" any more than "html". A synonym of several
//   words ("machine learning", "ci/cd") matches them in a row, with any
//   spaces or punctuation between.
import { SYNONYMS } from './synonyms.mjs';

export const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').toLowerCase();
const queryWords = (q) => fold(q).split(/[^\p{L}\p{N}.#+]+/u).map((w) => w.replace(/\.+$/, '')).filter((w) => /[\p{L}\p{N}]/u.test(w));
const loose = (w) => /^[\p{L}\p{N}]{4,}$/u.test(w);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One word or phrase as a regular expression source, for folded text.
function pattern(text, synonym = false) {
  const ws = queryWords(text);
  if (ws.length > 1) return `(?<![\\p{L}\\p{N}])${ws.map(esc).join('[^\\p{L}\\p{N}]+')}`;
  const [w] = ws;
  if (loose(w)) return `${esc(w.replace(/s$/, ''))}s?`; // "s?" only so a highlight covers the plural
  const start = `(?<![\\p{L}\\p{N}${/[.#+]/.test(w) ? '.#+' : ''}])${esc(w)}`;
  return synonym ? `${start}s?(?![\\p{L}\\p{N}])` : start;
}

// The query as terms, each of which must match: { test(hay), re }, where re
// finds every place the term matches (for highlighting).
export function queryTerms(q) {
  const ws = queryWords(q);
  const terms = [];
  for (let i = 0; i < ws.length; i++) {
    // A phrase in the table ("machine learning") is one term.
    const two = `${ws[i]} ${ws[i + 1]}`;
    const phrase = i + 1 < ws.length && Object.hasOwn(SYNONYMS, two);
    const own = phrase ? [ws[i], ws[i + 1]] : [ws[i]];
    if (phrase) i++;
    const key = own.join(' ');
    const syn = Object.hasOwn(SYNONYMS, key) ? SYNONYMS[key] : Object.hasOwn(SYNONYMS, key.replace(/s$/, '')) ? SYNONYMS[key.replace(/s$/, '')] : [];
    // The words typed (all of them, anywhere, as before), or any one synonym.
    const mine = own.map((w) => new RegExp(pattern(w), 'u'));
    const others = syn.map((s) => new RegExp(pattern(s, true), 'u'));
    terms.push({
      test: (hay) => mine.every((re) => re.test(hay)) || others.some((re) => re.test(hay)),
      re: new RegExp([...mine, ...others].map((re) => re.source).join('|'), 'gu'),
    });
  }
  return terms;
}

// Does folded text match every term? A query of only emoji or punctuation
// has no terms, and matches nothing.
export const matchesAll = (hay, terms) => terms.length > 0 && terms.every((t) => t.test(hay));

// Where the terms match in some (unfolded) text: [start, end, term index]
// spans, in order, not overlapping.
export function matchSpans(text, terms) {
  // Fold one character at a time, remembering where each folded one came from.
  let folded = '';
  const from = [];
  let i = 0;
  for (const ch of text) {
    const f = fold(ch);
    folded += f;
    for (let k = 0; k < f.length; k++) from.push([i, i + ch.length]);
    i += ch.length;
  }
  from.push([i, i]);
  const spans = [];
  terms.forEach((t, n) => {
    for (const m of folded.matchAll(t.re)) if (m[0]) spans.push([from[m.index][0], from[m.index + m[0].length - 1][1], n]);
  });
  spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  return spans.filter((s, k) => !spans.slice(0, k).some((p) => p[1] > s[0]));
}

// About a dozen words of text showing why an event matched, when the match
// is only in its About text. With several search words, the stretch where the
// most of them appear together wins ("partnerships with" quotes "Strategic
// Partnerships with AWS", not a stray "with" earlier on), earliest first on a
// tie. { parts: [{ text, mark }] }, with "…" where it was cut. Null when
// nothing matches.
export function excerpt(text, terms, around = 12) {
  const spans = matchSpans(text, terms);
  if (!spans.length) return null;
  const tokens = [...text.matchAll(/\S+/g)].map((m) => [m.index, m.index + m[0].length]);
  const tokenAt = (pos) => { let t = 0; while (t + 1 < tokens.length && tokens[t + 1][0] <= pos) t++; return t; };
  // A window of `around` words, with the anchor match about five words in.
  const windowFor = ([a]) => {
    const w0 = Math.max(0, Math.min(tokenAt(a) - 5, tokens.length - around));
    return [w0, Math.min(tokens.length, w0 + around)];
  };
  let best = null;
  for (const span of spans) {
    const [w0, w1] = windowFor(span);
    const [from, to] = [tokens[w0][0], tokens[w1 - 1][1]];
    const inside = spans.filter(([a, b]) => a >= from && b <= to);
    const score = new Set(inside.map(([, , n]) => n)).size;
    if (!best || score > best.score) best = { score, w0, w1, from, to, inside };
  }
  const { w0, w1, from, to, inside } = best;
  const flat = (s) => s.replace(/\s+/g, ' ');
  const parts = [];
  let at = from;
  for (const [a, b] of inside) {
    if (a > at) parts.push({ text: flat(text.slice(at, a)), mark: false });
    parts.push({ text: flat(text.slice(a, b)), mark: true });
    at = b;
  }
  if (to > at) parts.push({ text: flat(text.slice(at, to)), mark: false });
  if (w0 > 0) parts.unshift({ text: '…', mark: false });
  if (w1 < tokens.length) parts.push({ text: '…', mark: false });
  return { parts };
}
