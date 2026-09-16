# The walkthrough

Video: [`media/noctis-demo.mp4`](../media/noctis-demo.mp4) (2:05, no audio needed)

Live: `cd app && npm run dev` → http://localhost:5273

Everything is deterministic. Same seed, same numbers, every run.

---

## 0 · The frame (15s)

> A week has 168 hours. US equities discover a price in 32.5 of them. Held in
> self-custody, xStocks trade all 168 — the DEXs never close.

Point at **THE HOLE** in the left rail. Regular session 32.5h, extended 40h,
overnight 30h — Pyth Pro covers that far, 24/5. **Weekend and holidays: 65.5h.**
Nobody covers it, and it is 39% of the week.

## 1 · Four answers, none of them a price (25s)

Saturday 10:00 ET, AAPLx.

- Pyth: live all week — but its schedule marks the weekend closed, and the feed stops.
- Last official close: 231.04, frozen since Friday.
- The 24/7 book: a last trade and 26 bps to cross.
- **Noctis: 230.84 ± 2.39.**

> Not a last trade. A conditional expectation of Monday's opening print, published
> with a σ that is a forecast error for that auction — not, as with Pyth's
> confidence interval, a snapshot of how much publishers disagree right now. And
> published across the weekend, when Pyth's own schedule says the venue is shut.

## 2 · σ breathes (20s)

Drag the slider across the weekend.

The band is **widest in the middle** — far from the last real price and still far
from the next one — and narrows as Monday approaches.

> Most models only count the time that has elapsed. The bell is what you are
> actually predicting. Leaving out the remaining path was a real bug in this repo
> and it cost 6 points of coverage — see MODEL.md §3.

Scroll to **WHY THE MARK IS THE MARK**: every factor, its loading, its
contribution, and the five terms σ is made of. Nothing is a black box.

Click **NVDAx** — σ jumps to ~8% because it reports tonight. Pin cover costs
~330 bps. That price is the discipline, not a bug.

## 3 · The price (35s)

Switch to **Sunday risk-off**, select **SPYx**.

```
Fill price (Noctis mark)     623.55
Spread & commission           $0.00
```

> The fill costs nothing. The only thing you can buy is certainty about the
> reopening print.

| | | |
|---|---|---|
| **Raw** | free | you eat the whole gap |
| **Band** | $8.43 | you absorb the first 1σ, the vault pays past it |
| **Pin** | $40.35 | you are filled at the official opening print |

Open **HOW THAT PREMIUM WAS BUILT**: `N × σ × E[(Z−k)⁺]`, plus a quadratic capital
scarcity load, plus a concentration load. Itemised, in dollars.

> 100% goes to the vault. Noctis takes 10% of the vault's **net profit** and
> nothing on your volume. We are paid for being calibrated, not for being used.

## 4 · The bell (35s)

Buy the same 50 SPYx three times — Pin, Band, Raw. Then **run the opening auction**.

SPYx prints **623.83** — 2.7% below the mark, three sigma out.

| | premium | vault paid | net |
|---|---|---|---|
| Raw | — | $0.00 | **−$862.40** |
| Band | $24.78 | $585.52 | **−$301.66** |
| Pin | $118.63 | $862.40 | **−$118.63** |

> The Pin holder's entire loss is the premium.

The scorecard grades every answer as it stood **at +18h, when you had to act** —
not at the bell, when everything has already converged. On this particular night
the thin book landed marginally closer than Noctis, and the panel says so out
loud. One draw is one draw.

Then **UNDERWRITING VAULT**: someone was short that gap, they paid, and the demo
shows the loss.

## 5 · The receipts (20s)

Click **Run 200-night backtest**.

- 58% better than the last close, and better than the 24/7 book.
- 76.1% coverage at 1σ, 95.8% at 2σ. A normal predicts 68.3% / 95.4%; a
  standardised t(4) predicts 77.0% / 95.3%. That pair identifies the shape, and the
  premium is priced off t(4) — which made it **cheaper**, not dearer.
- The z-histogram, the loss ratio, and the **worst single night** — the number an
  LP actually needs.

> Nyx never sees the latent path it is scored against.

## 6 · The chain (20s)

```bash
./scripts/localnet-test.sh
```

15 tests, 0 failing, on a real validator: register → publish mark → LP
underwrites → free RAW fill → Pin fill whose premium is asserted against the
on-chain fixed-point math → auction → settle → payout → capital released.

Including the two regressions we actually hit: a receipt-PDA collision on
consecutive fee-free trades, and a config PDA that was deserialised but never
seed-checked.

---

## If you only have 60 seconds

1. THE HOLE — 65.5 hours a week with no price. (10s)
2. Four answers, one of which has an error bar. (15s)
3. The ticket: $0.00 commission, three tiers of certainty. (15s)
4. Run the auction. Three identical trades, three outcomes; Pin's loss is exactly
   the premium. (20s)
