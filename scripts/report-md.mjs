// Markdown pieces shared by the weekly site report's sections
// (site-report.mjs, search-report.mjs). A run's summary page renders GitHub
// Markdown but strips styles, scripts and inline images, so the charts here
// are made of text.

export const num = (n) => n.toLocaleString('en-US');

export const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map((_, i) => (i ? '---:' : '---')).join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

// "████░░░░░░": n as a share of max, 10 blocks wide. Anything above 0 gets
// at least one block, so a small number doesn't look like none.
export const bar = (n, max, width = 10) => {
  const full = n > 0 ? Math.max(1, Math.round((n / max) * width)) : 0;
  return '█'.repeat(full) + '░'.repeat(width - full);
};

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
