#!/bin/sh
# Claude Code Stop hook: before an agent says it's done, run what the required
# test-and-build check runs first (about 10s), so it hears red now, not from CI.
input=$(cat)
# A failure already blocked one stop; let the next through so it can report.
printf '%s' "$input" | grep -Eq '"stop_hook_active": *true' && exit 0
# Nothing changed against main (an answer, not a change): nothing to check.
base=$(git merge-base HEAD origin/main 2>/dev/null) || exit 0
git diff --quiet "$base" -- && [ -z "$(git ls-files --others --exclude-standard)" ] && exit 0
out=$( { npm run check && npm test; } 2>&1) && exit 0
printf 'npm run check / npm test failed. Fix it before finishing:\n%s\n' "$(printf '%s\n' "$out" | tail -40)" >&2
exit 2
