# Nyx — the fair-value engine

> The job is not "estimate the price." The job is **estimate the price the opening
> auction will print, and say how wrong that estimate is allowed to be.**
>
> Those are different questions and the second one is the product.

## Inputs

While the NYSE is shut, these keep printing:

| factor | what it is | where it comes from off-hours |
|---|---|---|
| `MKT` | broad market | SPYx on-chain tape blended with CME e-mini basis |
| `SECT` | sector | tokenized sector basket, volume-weighted |
| `CRYPTO` | global risk appetite | BTC/ETH return since the ET close |
| `FX` | the dollar | DXY, or the USDC–EURC cross |
| `RATES` | rates | tokenized T-bill yield drift |

Plus one more witness that is not a factor: the token's **own on-chain tape** —
signed order flow since the close, with the USDC volume that stood behind it.

## The point estimate

Factor leg, for asset *i*:

```
r_model = Σ_k  β_ik · f_k
```

Tape leg: the implied return from the token's own prints.

The two are independent, noisy estimates of the same latent quantity, so combine
them **by precision** rather than by a hand-tuned weight:

```
w   = var_model / (var_model + var_tape)          capped at 0.95
r̂   = r_model + w · (r_tape − r_model)
mid = close · exp(r̂)
```

This is why Noctis beats *both* of its own inputs in the backtest rather than
tracking whichever one happens to be better. `var_tape` is estimated from
thinness — how much depth stood behind the volume that traded:

```
sd_tape = 0.0072 · sqrt(depth / max(volume, 0.002·depth)) · (idioVol / 0.25)
```

A book that traded $2k against $240k of depth is not evidence. A book that
traded $200k is.

## σ — the variance budget

Five terms, all published, all visible in the UI:

```
σ²  =  fused_estimation_error          (idio + factor-reading noise, combined by precision)
    +  future_path_variance            (the world keeps moving until the bell)
    +  disagreement²                   (the two witnesses telling different stories)
    +  event                           (scheduled discontinuities)
```

### 1–2. Fused estimation error

```
var_model = idioVol² · t_days/252  +  Σ_k (β_ik · noise_k)²
var_fused = var_model · var_tape / (var_model + var_tape)
```

### 3. Future path variance — the term everyone forgets

```
future = totalVol² · informationHours(hoursToOpen) / 6.5 / 252
```

We are not estimating the value **now**. We are estimating the print at an auction
that has not happened. Even a perfect read of the present leaves the entire
remaining path unaccounted for.

Leaving this out was a real bug in an earlier version of this repo: 1σ coverage
came out at 65.6% and weekend gaps blew straight through the band, because the
model was confidently answering the wrong question.

It had a second, subtler form. `informationHours` was applied as a *flat* weight
taken from whichever session happened to be current — so at Monday noon, with the
next bell 21 hours away, the `regular` weight of 1.0 counted 21 calendar hours as
21 trading hours and σ came out at 3% for AAPL while Nasdaq was actively printing
it. The live forecast tool surfaced that within a minute of being pointed at a
weekday. Both windows, elapsed and remaining, are now **integrated** hour by hour
via `informationHoursAhead` — and `world.ts` generates its latent paths on the same
integrated clock, so the backtest is not scoring the model against a straw man.

It also gives σ the right *shape*: widest in the middle of the weekend — far from
the last real price and still far from the next one — narrowing as Monday
approaches. Scrub the slider in the demo and watch the band close.

### 4. Disagreement

```
disagreement = (0.45 · (r_tape − r_model))²
```

Two witnesses contradicting each other is itself information — about how little
anyone knows right now.

### 5. Event risk

A factor model cannot see a scheduled discontinuity coming. Earnings tonight adds
7.5% of standalone σ, which is why NVDAx sits at σ ≈ 8% in the demo and Pin cover
on it costs ~330 bps. That price is not a bug. Refusing to quote a tight band the
night a company reports is the entire discipline.

Above `MAX_SIGMA_PPM` (12%) the program refuses to quote at all. If we do not know
the price to better than 12%, the correct product is silence.

## Information time

Calendar hours are the wrong clock. 65.5 hours of weekend is not ten trading days
of news; it is about one and a quarter.

```
informationHours(h, session) = h · weight[session]

regular 1.00 · pre-market 0.55 · after-hours 0.45
overnight 0.30 · weekend 0.12 · holiday 0.12
```

The synthetic world in `world.ts` generates its latent paths on the *same* clock,
so the model and the world it is scored against agree on what "time" means. That
is a fairness property of the backtest, not a convenience.

## Live inputs

In live mode the same engine runs on real mainnet data, with two additions the
synthetic world never needed — the weekend basis and leave-one-out factor
construction. Both are in [DATA.md](DATA.md).

## What the model does not do

- No news / NLP. A headline-driven jump is uncovered and shows up as event risk.
- No cross-listing arbitrage (an ADR still trading in Frankfurt is a real signal
  we do not use).
- No microstructure model of the auction itself — the opening print has its own
  imbalance dynamics we treat as noise.
- Betas are static. They should be rolling and shrunk toward a sector prior.

Each of these is a term that would *reduce* σ, which under this business model
directly increases revenue. See [PRICING.md](PRICING.md).
