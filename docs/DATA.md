# Live data

Noctis has three modes. The toggle is in the header.

| | Simulation | **Live mainnet** |
|---|---|---|
| prices | synthetic, seeded, reproducible | real, from public endpoints |
| clock | scrubbable weekend | actual wall clock |
| the model | Nyx | **the same Nyx** |
| the premium math | `pricing.ts` | **the same `pricing.ts`** |
| can you settle? | yes — the auction is simulated | no — Monday hasn't happened |

Nothing about the model is special-cased for live mode. Only the inputs change.
That is the point of having it.

## Sources

All public, all keyless, all fetched straight from the browser. No server, no
proxy, nothing you cannot `curl` yourself.

| source | endpoint | gives us |
|---|---|---|
| Jupiter | `lite-api.jup.ag/price/v3` | on-chain price + the last official reference price of the underlying, per xStock |
| DexScreener | `api.dexscreener.com` | real 24h volume, pool liquidity, and every venue's print |
| Coinbase | `api.exchange.coinbase.com` | hourly BTC/ETH candles |

The **Data sources** panel in live mode shows each one with a status light and its
round-trip latency. If a feed is down it says so on screen rather than quietly
substituting a stale number.

### Why hourly candles rather than a 24h change

Every price API will hand you `priceChange24h` for free. It is the wrong window.
At 10:00 ET on a Sunday, a rolling 24h return spans half of Saturday — a period
the equity market was already closed through, and which is therefore already in
the last official price. Noctis needs the return measured **from the actual last
ET close**, so it pulls hourly candles and picks the bar nearest that instant.

## Two things live data forced into the model

Both of these came out of pointing the code at mainnet and looking at what it
did. Neither was in the synthetic version.

### 1. The weekend basis is not a forecast

On a live Sunday, *every* xStock trades below its reference at once:

```
AAPLx  −0.75%    NVDAx  −1.52%    TSLAx  −1.41%    MSTRx  −1.77%
SPYx   −0.75%    METAx  −1.36%    GOOGLx −0.55%
```

Read naively, that says the whole US equity market is about to gap down 1.3%. It
says nothing of the sort. It is the discount holders accept for wanting out before
anyone can hedge against the cash equity — the price of liquidity on a Sunday, and
it disappears at the opening bell.

So Nyx computes the **complex-wide basis** as the median dislocation and strips it
out, reading only the cross-section:

```
basis     = median_i( ln(onchain_i / reference_i) )
signal_i  = ln(onchain_i / reference_i) − basis
```

This is also why the live mark sits *above* every venue print, which looks wrong
until you know why. The venue panel says so on screen.

### 2. Factors are built leave-one-out

`MKT` is read off SPYx's de-based dislocation and `SECT` off the median of the
tech names. If a name is allowed to contribute to the factor that then explains
it, the model reads its own input back as independent evidence and understates σ.
SPYx was the worst offender, because it *is* the market proxy — it was getting a
0.44% σ off one observation counted twice.

So when marking asset *i*, the factors are rebuilt excluding *i*. Costs nothing,
removes the circularity for every name at once. `factorsFor()` in `feeds.ts`.

## Missing data widens σ, it does not read as zero

There is no free, always-on source for a dollar index or a tokenised-bill yield.
Coinbase's `EURC-USD` book is dead — its most recent candle is from August 2024.

The wrong response is to set those factors to 0, because 0 is a *confident*
statement that the dollar hasn't moved. The right response is to admit we cannot
see them and widen σ by the full standalone uncertainty of the move they would
have explained. `FX` and `RATES` are marked **no source** in the UI and carry
noise of 40 and 50 bps respectively.

Missing data should make the model less confident, not accidentally more.

## What live mode cannot do

**It cannot verify itself.** Scoring a mark requires an opening print, and Monday
09:30 ET hasn't happened. Every calibration number quoted anywhere in this repo —
RMSE, coverage, loss ratio — comes from the synthetic backtest, where the latent
truth is known and hidden from the model.

That split is deliberate and it is the honest arrangement available in a week:
**live data proves the inputs are real; the synthetic backtest proves the model is
calibrated.** Neither claim is made with the other's evidence.

**It is not wallet-connected.** The ticket in live mode is a quote — what the
program would charge at the σ shown, computed by the same fixed-point formula the
chain runs. The executable path is exercised by `scripts/localnet-test.sh`
instead, which is the more checkable of the two.

## The number that needs no model

The most persuasive thing in live mode is not a Noctis output. It is this, on
mainnet, on a Sunday night:

```
raydium  AAPLx/USDC   331.67    $331k liquidity
raydium  AAPLx/USDC   331.56    $249k
orca     AAPLx/SOL    297.92     $80k        ← −10.9%
orca     AAPLx/USDC   331.22     $76k
raydium  AAPLx/SOL    330.02     $14k
meteora  AAPLx/SOL    331.55      $9k
meteora  AAPLx/SOL    328.89      $5k
meteora  AAPLx/SPYx   331.16      $4k
```

Eight live pools. The same token. **1019 basis points between the highest and
lowest print**, at the same instant, with real money in each pool.

Nobody can arbitrage that away, because the thing you would hedge against is shut.
"The on-chain price" is not one number, and on a weekend it is not really a price.
