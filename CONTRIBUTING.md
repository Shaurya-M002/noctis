# Running this repo

Verified from a clean `git clone` on macOS, Node 24.

## The demo (no toolchain needed)

```bash
npm install            # root: tsx, playwright, anchor client
cd app && npm install && npm run dev
```

http://localhost:5273 — **Simulation** by default, **Live mainnet** via the header
toggle. Live reads three public keyless endpoints from your browser; if any is down
the Data sources panel says which, and Simulation still works offline.

## The numbers

```bash
npx tsx engine/backtest.ts 800 BAND     # or PIN
npx tsx engine/forecast.ts record       # timestamped mark, appended to forecasts/
npx tsx engine/forecast.ts score        # after the bell
```

## The program

Needs the Solana toolchain. Three things bite on a fresh machine and none of them
say so in the error:

1. **`anchor build` fails.** Its bundled SBF cargo (platform-tools v1.43, cargo
   1.79) cannot parse the edition-2024 crates in the `anchor-spl` tree. Use
   `cargo-build-sbf --tools-version v1.52`. v1.50 and v1.51 are still too old.
2. **Port 8899 is often taken.** `scripts/localnet-test.sh` runs the validator on
   8917 instead.
3. **The faucet port must not be `rpc + 1`.** Solana derives the *websocket* port
   that way, so rpc 8917 + faucet 8918 makes every `confirmTransaction` hang for
   30 seconds and time out with only `ws error: Parse Error: Expected HTTP/` to go
   on. The script uses 9918.

```bash
rustup update stable
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.31.1 && avm use 0.31.1

npm run test:math       # 12 unit tests on the fixed-point premium math
npm run build:program   # SBF binary + IDL
npm run test:program    # throwaway validator, deploy, 18 lifecycle tests
```

`npm run test:all` runs all three.

## Deploying to devnet

The binary is 333 KB, so rent is ~2.3 SOL and the deploy needs a funded key.

```bash
solana-keygen new -o .keys/deployer.json          # gitignored
solana airdrop 2 --url devnet                     # or faucet.solana.com if rate-limited
solana -u devnet program deploy \
  --keypair .keys/deployer.json \
  --program-id target/deploy/noctis-keypair.json \
  target/deploy/noctis.so
```

Program id `NoCTajFqJn1QScfX3KozwSitGzcVf6muHLKXoKQhbhE` — the keypair for it is in
`target/deploy/`, which is gitignored, so a fresh clone will generate its own.

## Regenerating the media

```bash
npm run shots      # simulation screenshots
node scripts/shots-live.mjs
npm run record     # the demo video (needs ffmpeg)
```
