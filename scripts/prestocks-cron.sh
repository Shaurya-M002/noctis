#!/usr/bin/env bash
# Sample the pre-IPO marks on a timer and commit them.
#
# Unlike everything else in this repo, this history cannot be reconstructed later:
# neither PreStocks nor Tessera exposes a price-history endpoint. Either we were
# recording, or we have nothing to calibrate against.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 0
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
LOG="$ROOT/forecasts/prestocks-cron.log"
{
  npx tsx engine/prestocks-log.ts
  # Commit every ~12th sample so git history stays readable at a 5-min cadence.
  N=$(wc -l < forecasts/prestocks.jsonl 2>/dev/null || echo 0)
  if [ $((N % 12)) -eq 0 ] && ! git diff --quiet HEAD -- forecasts/prestocks.jsonl 2>/dev/null; then
    git add forecasts/prestocks.jsonl
    git -c user.email="madukuri.shaurya@skan.ai" -c user.name="Shaurya Madukuri" \
      commit -q -m "prestocks: $N samples" -- forecasts/prestocks.jsonl \
      && git push -q --no-verify origin HEAD:main && echo "  committed+pushed ($N)"
  fi
} >> "$LOG" 2>&1
