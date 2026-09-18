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
- **Live mode is real mainnet data.** Jupiter, DexScreener and Coinbase, public
  and keyless, fetched from the browser with status and latency shown on screen.
  The venue dispersion panel is not a model output, it is what the chain says.

## Synthetic

- **Simulation mode: all prices, betas, vols and depths.** Calibrated to plausible
  values, not fetched. `app/src/data/universe.ts` says so at the top. The xStocks
  mint addresses are the real public ones and live mode overrides close and depth
  from the feeds. But `idioVol`, `totalVol` and every beta stay hand-set in both
  modes. They should be fitted from history.
- **The world.** `app/src/lib/world.ts` generates a latent truth from seeded
  factor paths; the model sees noisy readings of it and never the truth itself.
  One seed per scenario, so every number in the demo is reproducible.
- **Transaction signatures in the UI** are deterministic base58 strings, not
  chain writes. The app is not wallet-connected. The chain side is exercised by
  the test suite instead, which is the more checkable of the two.
- **Live mode cannot verify itself.** Scoring a mark needs an opening print and
  Monday has not happened. Every RMSE, coverage and loss-ratio number in this repo
  comes from the synthetic backtest. Live data proves the inputs are real; the
  backtest proves the model is calibrated. Neither borrows the other's evidence.
- ~~Devnet deployment did not happen~~, **it did.** Program
  `NoCTajFqJn1QScfX3KozwSitGzcVf6muHLKXoKQhbhE` is live with a settled lifecycle;
  see [DEVNET.md](DEVNET.md). This line is kept struck through rather than deleted
  because the rest of the file is a record of what was true when written, and
  quietly editing away a limitation once it is fixed is how a limitations doc stops
  being trustworthy. Originally blocked because, the faucet was rate-limited from this
  machine and 386 KB of program needs ~2.7 SOL of rent. The build artefact and
  the deploy command are both in the repo; `scripts/localnet-test.sh` proves the
  same binary deploys and runs.

## Where the model would break first

1. **A headline.** No news signal at all. An 03:00 announcement moves the truth and
   Nyx sees nothing until the tape reacts. σ does not widen for it.
2. **A correlation break.** Betas are static. In a regime change every loading is
   wrong at once, which is exactly when the vault is maximally exposed.
3. **The basis assumption.** Live mode treats the median xStock dislocation as a
   pure liquidity premium that vanishes at the bell. Most of the time it is. On a
   weekend where genuinely bad news breaks, part of that common move is real
   information and stripping it out makes Nyx systematically too bullish, on
   every name at once, which is exactly when the vault is most exposed. The fix is
   to decompose the basis against the crypto factor rather than assuming it away.
4. **A manipulated tape.** The tape leg is weighted by volume against depth. An
   attacker willing to trade real size into a thin book overnight can drag the
   mark, then trade against it. Mitigations not built: TWAP over the window,
   trimming, a cap on how far the tape may pull the mark from the factor leg.
5. **A correlated weekend.** The vault reserves `max(long, short) + 0.5·min` across
   directions rather than summing every receipt's tail, one gap cannot pay both
   sides of the same name, and across different names only part of the smaller leg
   can land at once. That is a single-factor haircut, not a covariance matrix: it
   uses one correlation number for all pairs, when AAPLx/GOOGLx and MSTRx/COINx
   plainly do not co-move alike. A real book fits the matrix.
6. **The oracle.** A single permissioned signer for both the mark and the official
   opening print. See [WHY_SOLANA.md](WHY_SOLANA.md) §5.

## Known imperfections we chose to leave visible

- **The t(4) fit is an inference from two numbers, not a proof.** 76.1% / 95.8%
  coverage matches a standardised t(4) (77.0% / 95.3%) far better than a normal,
  and we reprice on that, which lowered premiums. But two coverage points do not
  identify a distribution, and the degrees of freedom are almost certainly not
  constant across names or regimes. A real version fits ν per asset, rolling, and
  probably finds NVDA on an earnings night is nothing like SPY on a quiet Sunday.
- **The synthetic world's tails are our own construction.** We measured t(4)
  against gaps produced by our scenario jitter. That the fit is this clean is
  partly a statement about our generator. Replaying real Friday→Monday gaps is the
  only way to know, and it is the top of the next-steps list.
- The backtest's scenario jitter is our invention. It is a reasonable
  vol-of-vol process, but it is not a historical gap distribution. The honest
  next step is replaying real Friday-close → Monday-open gaps.
- `informationHours` weights (0.12 for a weekend hour) are judgement, calibrated by
  eye to make weekend σ look sane. They should be fitted.
