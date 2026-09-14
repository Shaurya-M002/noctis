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

npm run test:math       # 17 unit tests: premium math + the vault reserve
npm run build:program   # SBF binary (--features no-idl) + IDL
npm run test:program    # throwaway validator, deploy, 18 lifecycle tests
```

`npm run test:all` runs all three.

## Why the binary is 292 KB

Mostly `anchor-lang` itself. We assumed it was Token-2022 support and built it both
ways to check: dropping `token_interface` for classic `anchor_spl::token` saves
**10 KB**, about 0.05 SOL of rent. Not the third we expected.

Worth knowing what the 10 KB buys, though. This program never moves an xStock — the
cover is parametric, so the payout depends only on the published mark and the
opening print. The one mint it transfers is the quote asset, today USDC, which is
classic SPL. `token_interface` is there so the quote asset *could* be PYUSD, which
is Token-2022. That is the whole reason, and it is cheap enough to keep.

The rest is squeezed: `opt-level = "z"`, fat LTO, one codegen unit, `panic = abort`,
symbols stripped, and `--features no-idl` (the IDL is still emitted to
`target/idl/noctis.json`, which is what clients consume — only the on-chain copy is
dropped). That took 386 KB → 292 KB, which is ~0.5 SOL off the rent.

## Deploying to devnet

Rent is ~1.48 SOL for a 292 KB program (`solana rent 291712` to check).

```bash
solana-keygen new -o .keys/deployer.json          # gitignored
solana airdrop 2 --url devnet                     # heavily rate-limited per IP
./scripts/devnet-deploy.sh                        # airdrop, check, deploy, verify
```

`scripts/devnet-deploy.sh` is idempotent and safe to run on a timer — it asks for an
airdrop, deploys only once the balance clears rent, verifies, and then disables
itself via `.keys/.devnet-deployed`. There is a LaunchAgent
(`com.noctis.devnet`) that runs it hourly, because the faucet rate-limits far more
aggressively than it refuses outright.

If the CLI faucet is stuck, [faucet.solana.com](https://faucet.solana.com) gives
more per day but requires a GitHub sign-in in a browser.

Program id `NoCTajFqJn1QScfX3KozwSitGzcVf6muHLKXoKQhbhE` — the keypair for it is in
`target/deploy/`, which is gitignored, so a fresh clone will generate its own.

## Regenerating the media

```bash
npm run shots      # simulation screenshots
node scripts/shots-live.mjs
npm run record     # the demo video (needs ffmpeg)
```
