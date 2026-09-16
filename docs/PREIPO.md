# Pre-IPO: the weekend that never ends

An xStock is unpriced for 48 hours a week. A pre-IPO token has no exchange at all —
no bell, no auction, no reopening print, ever. The only reference is a mark its
issuer publishes from off-chain secondary-market data, and the token trades against
it around the clock.

Same structure as our weekend, permanently, and an order of magnitude wider.

## What is measurably true right now

Eight PreStocks names on Solana mainnet, all Token-2022:

| | xStocks, weekend | Pre-IPO, always |
|---|---|---|
| widest cross-sectional gap | ~1.3 points | **~37 points** |
| reference updates | resumes Monday 09:30 | never resolves |
| a rival issuer's mark to check against | none | Tessera, on 3 names |

The cross-issuer disagreement is the part that stops this being a curiosity. Two
issuers, both holding real exposure, both publishing on-chain, on the same
companies:

| company | PreStocks | Tessera | disagreement |
|---|---|---|---|
| OpenAI | $1,197B | $950B | **−21%** |
| Kalshi | $32B | $14B | **−56%** |
| SpaceX | $1,965B | $800B | **−59%** |

Nobody agrees what Kalshi is worth to within a factor of two. That is not noise to
be smoothed away. It is the honest width of the answer, which is exactly what a σ
is for.

## Two different pathologies, same symptom

Recording every five minutes surfaced something a single snapshot cannot. For most
names the issuer mark is nearly static while the token moves **~100× faster** — so
the gap is almost entirely the token's own movement against a slow reference.

SpaceX is the opposite. Its mark moved 3% in ninety minutes while the token printed
**two distinct prices in the same window**. There the token is the stale side.

Both read as "the reference and the price disagree." The cause is reversed, and any
model that treats them the same is wrong about one of them. The app labels which
case each name is in, from the measured velocities.

## Where the history comes from

Neither PreStocks nor Tessera exposes a price-history endpoint — I checked every
plausible path on both. So a calibration series could only exist if we had been
recording, and `scripts/prestocks-cron.sh` has been sampling every five minutes
since we decided to look. It commits to `forecasts/prestocks.jsonl` and pushes.

That log then does a second job nobody planned. **Tessera's API sends no CORS
headers**, so a browser cannot read it and this app has no server to proxy through.
The recorder runs in node, which has no such restriction, so the committed log is
the only route cross-issuer data has into a static page. The app reads it back from
`raw.githubusercontent.com`, which is CORS-open and always current.

## Sigma, and a mistake worth recording

The obvious estimator is the per-sample step deviation scaled by √t. The first
version of `gapSigma` did that and quoted **25% σ on a seven-day cover**, which
produced a premium of over 200 bps and was plainly nonsense.

Two things are wrong with it. Five-minute samples of a thin AMM are dominated by
bid-ask bounce rather than information, so √t compounds a microstructure artefact
into a number with no meaning. And the gap is not a random walk — it oscillates
inside a band, because the token is tethered to a mark that barely moves. A
mean-reverting series converges on its stationary width instead of spreading.

So the estimate is **bounded by that stationary width**, taken from the dispersion
of observed gap *levels* rather than steps, widened 3× because a few hours cannot
have seen the full range, floored at 2% and capped at 35%. Short horizons still get
the diffusion reading where it is tighter. The panel names which bound is binding
and shows what the naive reading would have said.

This is a bound, not a fit. With days of log we would fit an Ornstein–Uhlenbeck and
use its actual reversion speed. Until then the UI shows the sample count next to
the number and says, in as many words, that it is not calibrated.

## The product

**NAV-gap cover.** Not "reopen assurance" — there is no reopening. You insure the
gap between the token and the issuer's mark over a horizon, and it settles against
the mark the issuer publishes at T+N.

The program needs **no changes at all**. `publish_mark` / `post_open_print` /
`settle_receipt` never knew what an equity was; `post_open_print` simply receives
the T+N mark instead of an auction print. The premium is the same fixed-point
formula, priced off a different σ.

## What we are not claiming

- **No backtest exists for this universe.** Every coverage and RMSE figure in this
  repo comes from the synthetic equity backtest. We do not reuse them here and the
  σ panel says so.
- **No factor model for a private company.** There are no betas to fit and we have
  not invented any. The cross-section gives a basis and residuals; that is all.
- **The mark is an estimator, not a clearing price.** If the issuer smooths it,
  some of what we measure as gap volatility is their smoother's lag. We cannot
  separate those without much more history.
- **Forecasting an estimator is a smaller claim** than forecasting an auction. It
  is also the only honest one available when no auction exists.

## Not pursued: Tessera's bounty

Tessera's own bounty asks for bonding-curve products. T-Tokens do not use one —
they trade on Meteora DLMM pools — and more decisively they have **no settlement
event**: redemption requires an IPO or a change of control, possibly years out. The
nearest recurring alternative is a roughly monthly NAV attestation, which yields
zero settlements inside any reasonable horizon, and one-month σ on a private
company exceeds the program's own `MAX_SIGMA_PPM` ceiling of 12%. Noctis would
correctly refuse to quote. Elegant, and a useless product.

Tessera is in here as the second witness, which is the role the data supports.
