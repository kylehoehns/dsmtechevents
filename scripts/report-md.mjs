// Markdown pieces shared by the weekly site report's sections
// (site-report.mjs, search-report.mjs). A run's summary page renders GitHub
// Markdown but strips styles, scripts and inline images, so the charts here
// are made of text.

export const num = (n) => n.toLocaleString('en-US');

// The first column and the bar columns (empty header) are left-aligned so
// the bars all start at the same edge; the numbers are right-aligned.
export const table = (head, rows) =>
  [`| ${head.join(' | ')} |`, `|${head.map((h, i) => (i && h ? '---:' : '---')).join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

// "████": n as a share of max, out of 10 blocks. Anything above 0 gets at
// least one block, so a small number doesn't look like none. No "░" padding:
// GitHub's font draws it narrower than "█", so padded bars come out ragged.
export const bar = (n, max, width = 10) => '█'.repeat(n > 0 ? Math.max(1, Math.round((n / max) * width)) : 0);

// "▁▃█▅": one block per value, scaled to the biggest.
export const spark = (values) => {
  const max = Math.max(...values, 0);
  return values.map((v) => '▁▂▃▄▅▆▇█'[max > 0 ? Math.round((v / max) * 7) : 0]).join('');
};

// "▲ 18%" or "▼ 4%" against the week before; '' with nothing to compare to.
export const trend = (now, before) => {
  if (!before) return '';
  const p = Math.round(((now - before) / before) * 100);
  return p > 0 ? `▲ ${p}%` : p < 0 ? `▼ ${-p}%` : '± 0%';
};

// A section that stays closed until clicked. The blank line after <summary>
// lets GitHub render the Markdown inside.
export const fold = (summary, body) => `<details><summary>${summary}</summary>\n\n${body}\n\n</details>`;
