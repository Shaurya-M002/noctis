#!/usr/bin/env bash
# Take a Noctis mark on a timer and commit it, so the forecast log accumulates
# without anyone remembering to run anything.
#
# Driven by a dumb hourly cron; `forecast auto` decides whether to record (market
# dark, last mark stale) or score (market open). Both are no-ops when there is
# nothing to do, and neither ever exits non-zero, so a bad feed cannot kill the
# schedule.
#
# Install:   crontab -e   ->   0 * * * * /path/to/scripts/forecast-cron.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 0

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
LOG="$ROOT/forecasts/cron.log"

{
  echo "=== $(date -u '+%Y-%m-%dT%H:%M:%SZ') ==="
  npx tsx engine/forecast.ts auto 2>&1

  # Commit only the log, only if it moved. Never touches anything else in the tree.
  if ! git diff --quiet -- forecasts/marks.jsonl 2>/dev/null; then
    git add forecasts/marks.jsonl
    git -c user.email="madukuri.shaurya@skan.ai" -c user.name="Shaurya Madukuri" \
      commit -q -m "forecast: $(date -u '+%Y-%m-%d %H:%MZ')" -- forecasts/marks.jsonl \
      && echo "  committed"
  fi
} >> "$LOG" 2>&1
