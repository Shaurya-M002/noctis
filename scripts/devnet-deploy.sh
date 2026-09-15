#!/usr/bin/env bash
# Deploy to devnet the moment the faucet lets us.
#
# The devnet faucet rate-limits this IP hard, and the program needs ~1.5 SOL of
# rent. Rather than have a human sit and retry, this runs on a timer: ask for an
# airdrop, and if the balance has cleared the bar, deploy, verify and disable
# itself. Every step is idempotent, and it never exits non-zero.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 0
export PATH="$HOME/.local/share/solana/install/active_release/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

KEY="$ROOT/.keys/deployer.json"
PROG_KEY="$ROOT/target/deploy/noctis-keypair.json"
SO="$ROOT/target/deploy/noctis.so"
LOG="$ROOT/forecasts/devnet-deploy.log"
DONE="$ROOT/.keys/.devnet-deployed"
RPC="https://api.devnet.solana.com"
# api.devnet.solana.com rate-limits hard per IP. mango.devnet.rpcpool.com fronts the
# same cluster with a separate limit and was the one that actually funded this
# deploy, so ask it too before giving up.
FAUCETS=("https://api.devnet.solana.com" "https://mango.devnet.rpcpool.com" "https://devnet.rpcpool.com")

exec >>"$LOG" 2>&1
echo "=== $(date -u '+%Y-%m-%dT%H:%M:%SZ') ==="

[[ -f "$DONE" ]] && { echo "  already deployed; nothing to do"; exit 0; }
[[ -f "$KEY" && -f "$PROG_KEY" && -f "$SO" ]] || { echo "  missing key or binary"; exit 0; }

PROG_ID=$(solana-keygen pubkey "$PROG_KEY")

# Already live from a previous run?
if solana -u "$RPC" program show "$PROG_ID" >/dev/null 2>&1; then
  echo "  $PROG_ID is already deployed"
  touch "$DONE"; exit 0
fi

NEED=$(solana rent "$(stat -f%z "$SO")" 2>/dev/null | grep -o '[0-9.]*' | head -1)
NEED=${NEED:-1.7}
for f in "${FAUCETS[@]}"; do
  echo "  airdrop via ${f#https://}: $(solana airdrop 2 "$(solana-keygen pubkey "$KEY")" --url "$f" 2>&1 | tail -1 | cut -c1-60)"
done

BAL=$(solana balance "$(solana-keygen pubkey "$KEY")" --url "$RPC" 2>/dev/null | awk '{print $1}')
BAL=${BAL:-0}
echo "  balance ${BAL} SOL, need ~${NEED} + fees"

if ! awk -v b="$BAL" -v n="$NEED" 'BEGIN{exit !(b > n + 0.05)}'; then
  echo "  under the bar; will retry"
  exit 0
fi

echo "  deploying $PROG_ID"
if solana -u "$RPC" program deploy \
     --keypair "$KEY" --program-id "$PROG_KEY" "$SO" 2>&1 | tail -3; then
  if solana -u "$RPC" program show "$PROG_ID" 2>&1 | tail -8; then
    touch "$DONE"
    echo "  DEPLOYED  https://explorer.solana.com/address/$PROG_ID?cluster=devnet"
  fi
else
  echo "  deploy failed; will retry"
fi
