# The price

Almost every venue in this hackathon's problem space charges the same way: a few
basis points of your notional, or a spread, or both. It is a toll on flow. It pays
the same whether the venue's price was any good.

Noctis charges nothing for the trade.

```
Fill price (Noctis mark)     230.84
Spread & commission           $0.00
```

You pay for exactly one thing: **a guarantee about the reopening print.**

## The three tiers

| tier | deductible *k* | premium |
|---|---|---|
| **Raw** | ∞ — you eat the whole gap | always $0 |
| **Band** | 1σ | ~9 bps |
| **Pin** | 0 — filled at the official open | ~44 bps |

Bps are shown only so you can compare against a fee you already understand. They
are not a fee: they move with σ, with your size against the book, and with how
much underwriting capital is left.

## Pricing it

An adverse gap beyond the deductible is a one-sided option on the overnight move.
Under a normal gap with standard deviation σ, the expected payout is the standard
partial expectation:

```
E[(Z − k)⁺]  =  φ(k) − k·(1 − Φ(k))

fair = N · σ · E[(Z − k)⁺]
```

Two constants do the whole job, because the tier set is fixed:

```
k = 0  →  φ(0)                    = 0.398942     (Pin — the Bachelier half-straddle)
k = 1  →  φ(1) − (1 − Φ(1))       = 0.083315     (Band)
```

Band is 4.8× cheaper than Pin for a reason you can read off that line: absorbing
the first standard deviation removes most of the expected payout.

Then two loads:

```
premium = fair · ( 1  +  u²  +  min(1.5, 1.2 · N/depth) )
```

- **`u²` — capital scarcity.** `u` is vault utilisation. Quadratic, so the vault's
  last dollar of capacity is never sold at the price of its first. It chokes off
  gracefully instead of getting wiped out by one crowded night.
- **`1.2·N/depth` — concentration.** Writing 40% of an asset's depth is not four
  times the risk of writing 10%.

Floor: 1 cent, so dust trades cannot mint free optionality.

## A load we tested and deleted

The fair price assumes σ is *known*. It is not — it is an estimate, and
`E[(G − kσ)⁺]` is convex in the scale of `G`, so uncertainty about σ should push
real payouts above the Gaussian-with-known-σ price. We shipped a 1.35× "model
risk" multiplier for it.

Then we measured. Once σ itself was properly calibrated — 73.5% coverage at 1σ
against a 68.3% target — the book already ran at a **0.69 loss ratio** on fair
plus the two loads. The extra multiplier took it to **0.57**: LPs earning a
handsome return by overcharging users for a risk that was already priced.

It is gone. The 30% of premium that is not expected claims *is* the LP's
compensation for bearing variance. That is what a loss ratio is for.

We also checked the obvious counter-hypothesis — that gaps are Student-t and the
Gaussian underprices the tails. For a *unit-variance* t(ν=4), `E[(Z−k)⁺]` is
**0.88–0.93×** the Gaussian value at k ∈ {0,1}: fat tails come with a taller peak,
and at these strikes the peak wins. A fat-tail load would have been backwards.

## Settlement

Deliberately asymmetric. This is insurance, not a swap.

```
adverse  = max(0, ±(fill − open))        sign by side
payout   = max(0, adverse − k·σ_abs) · qty
```

A gap in your favour stays yours. Pricing it as a swap would halve the premium and
double the vault's variance, and it would stop being a product anyone wants.

σ is **frozen at trade time** and written into the receipt. The band you were
quoted is the band you get, whatever the oracle does afterwards.

## Who is on the other side

An underwriting vault. LPs deposit USDC, are short every gap the protocol writes,
and are paid in premiums.

- Utilisation is capped at 85%. The vault stops writing before one bad open can
  wipe it out.
- Capital backing live receipts cannot be withdrawn (`CapitalLocked`).
- A vault that cannot pay in full pays what it has and emits the shortfall, rather
  than reverting and stranding every other receipt behind it in the queue.
- Shares are struck against current TVL, so a depositor cannot buy into premiums
  already earned or dodge payouts already owed.

## Why we chose this

Because it makes us honest, and because you can check.

A volume fee pays the same whether the mark was good. A premium on σ pays *less*
when σ is small — so tightening the model, which is the thing that makes the
product better, is also the thing that shrinks our per-trade revenue. The only way
to grow is more volume and a vault that stays profitable, and the vault only stays
profitable if σ is right.

The protocol's cut is **10% of the vault's net profit**. Not of premiums — of
profit. In the demo's worst weekend the vault is down and Noctis earns nothing at
all. That is the correct behaviour and the UI shows it.

## Mirrored, not approximated

`programs/noctis/src/math.rs` and `app/src/lib/pricing.ts` implement the same
formula. The Rust side is integer-only fixed point in PPM and micro-USDC — no
floats, because a validator has to reproduce the number the client displayed, and
floats do not agree across targets. Downcasts are checked; an absurd notional
fails the instruction rather than silently truncating to something cheap.

`cargo test -p noctis --lib` covers the pieces that would actually cost someone
money: the half-straddle constant, Band-vs-Pin ratio, Raw always free, monotonicity
in utilisation and concentration, the dust floor, both settlement directions, a
favourable gap paying nothing, and overflow refusing rather than wrapping.
