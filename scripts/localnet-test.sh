#!/usr/bin/env bash
# One command, from nothing to a settled receipt on a real validator.
#
#   ./scripts/localnet-test.sh
#
# Boots a throwaway validator on 8917 (8899 is usually taken), deploys the SBF
# program, runs the lifecycle suite, tears everything down.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"

RPC_PORT=8917
FAUCET_PORT=9918          # NOT rpc+1: solana derives the websocket port as rpc+1
LEDGER=/tmp/noctis-ledger
RPC="http://127.0.0.1:$RPC_PORT"
WALLET="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"

cleanup() { [[ -n "${VPID:-}" ]] && kill "$VPID" 2>/dev/null || true; }
trap cleanup EXIT

echo "→ resetting ledger"
rm -rf "$LEDGER"

echo "→ booting validator on $RPC"
solana-test-validator --ledger "$LEDGER" --rpc-port "$RPC_PORT" \
  --faucet-port "$FAUCET_PORT" --reset --quiet &
VPID=$!

for _ in $(seq 1 60); do
  solana -u "$RPC" cluster-version >/dev/null 2>&1 && break
  sleep 1
done
solana -u "$RPC" cluster-version >/dev/null 2>&1 || { echo "validator never came up"; exit 1; }

[[ -f "$WALLET" ]] || solana-keygen new --no-bip39-passphrase -s -o "$WALLET"
solana -u "$RPC" airdrop 100 "$WALLET" >/dev/null

echo "→ deploying $(solana-keygen pubkey target/deploy/noctis-keypair.json)"
solana -u "$RPC" program deploy \
  --keypair "$WALLET" \
  --program-id target/deploy/noctis-keypair.json \
  target/deploy/noctis.so | tail -2

echo "→ running the lifecycle suite"
ANCHOR_PROVIDER_URL="$RPC" ANCHOR_WALLET="$WALLET" npx tsx tests/noctis.ts
