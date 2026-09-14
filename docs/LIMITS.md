# What is real, what is synthetic, what is unsolved

Written before anyone asks.

## Real

- The Anchor program compiles to SBF (`target/deploy/noctis.so`, 386 KB) and
  deploys. Program id `NoCTajFqJn1QScfX3KozwSitGzcVf6muHLKXoKQhbhE`.
- `./scripts/localnet-test.sh` runs the whole lifecycle against a validator:
  15 tests, 0 failing, including two regressions we actually hit (receipt PDA
  collision on fee-free trades; config PDA not being seed-checked).
- `cargo test -p noctis --lib`: 12 tests on the fixed-point premium and
  settlement math.
- The premium formula in `math.rs` (integer PPM) and `pricing.ts` (float) are the
  same formula, and the on-chain test asserts the client-side number against the
  chain's.
- The backtest genuinely hides the latent path from the model.

## Synthetic

- **All prices, betas, vols and depths.** Calibrated to plausible values, not
  fetched. `app/src/data/universe.ts` says so at the top. The xStocks mint
  addresses are the real public ones.
- **The world.** `app/src/lib/world.ts` generates a latent truth from seeded
  factor paths; the model sees noisy readings of it and never the truth itself.
  One seed per scenario, so every number in the demo is reproducible.
- **Transaction signatures in the UI** are deterministic base58 strings, not
  chain writes. The app is not wallet-connected. The chain side is exercised by
  the test suite instead, which is the more checkable of the two.
- **Devnet deployment did not happen** — the faucet was rate-limited from this
  machine and 386 KB of program needs ~2.7 SOL of rent. The build artefact and
  the deploy command are both in the repo; `scripts/localnet-test.sh` proves the
  same binary deploys and runs.

## Where the model would break first

1. **A headline.** No news signal at all. An 03:00 announcement moves the truth and
   Nyx sees nothing until the tape reacts. σ does not widen for it.
2. **A correlation break.** Betas are static. In a regime change every loading is
   wrong at once, which is exactly when the vault is maximally exposed.
3. **A manipulated tape.** The tape leg is weighted by volume against depth. An
   attacker willing to trade real size into a thin book overnight can drag the
   mark, then trade against it. Mitigations not built: TWAP over the window,
   trimming, a cap on how far the tape may pull the mark from the factor leg.
4. **A correlated weekend.** The vault writes across 8 names whose gaps are highly
   correlated. Utilisation is capped at 85% and premiums load quadratically, but
   the exposure model treats receipts as independent, which they are not. Real
   capital sizing needs a portfolio VaR, not a sum of per-receipt reserves.
5. **The oracle.** A single permissioned signer for both the mark and the official
   opening print. See [WHY_SOLANA.md](WHY_SOLANA.md) §5.

## Known imperfections we chose to leave visible

- σ runs **wide** at 1σ (73.5% coverage vs a 68.3% target). Band buyers pay a
  little more than fair. We would rather ship that and say so than tune the
  coverage number until the screenshot looks perfect.
- The backtest's scenario jitter is our invention. It is a reasonable
  vol-of-vol process, but it is not a historical gap distribution. The honest
  next step is replaying real Friday-close → Monday-open gaps.
- `informationHours` weights (0.12 for a weekend hour) are judgement, calibrated by
  eye to make weekend σ look sane. They should be fitted.
