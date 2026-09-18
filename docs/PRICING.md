# The price

Almost every venue in this hackathon's problem space charges the same way: a few
basis points of your notional, or a spread, or both. It is a toll on flow. It pays
the same whether the venue's price was any good.

Noctis is not in the trade at all.

```
Cover struck at (Noctis mark)   230.84
Trading fee & spread             $0.00
```

Execute wherever you like. Noctis writes **parametric** cover struck at the mark it
published: the payout is a function of the mark and the official opening print, and
of nothing about your actual fill. That is what makes settlement a single
permissionless instruction with no claims adjuster, and it is why there is no
volume for the protocol to tax even if it wanted to.

The trade-off is basis risk. Cover pays relative to the mark, not relative to your
execution. If you filled 80 bps away from the mark on a thin pool, that 80 bps is
yours. Stated plainly on the ticket.

You pay for exactly one thing: **a guarantee about the reopening print.**

## The three tiers

| tier | deductible *k* | premium |
|---|---|---|
| **Raw** | ∞, you eat the whole gap | always $0 |
| **Band** | 1σ | ~9 bps |
| **Pin** | 0, filled at the official open | ~44 bps |

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

Two constants do the whole job, because the tier set is fixed. But **Z is not
normal**, and we know that because we measured it, see below:

```
                        Gaussian      standardised t(4)   ← what we ship
k = 0  (Pin)            0.398942      0.353549            0.886x
k = 1  (Band)           0.083315      0.077346            0.928x
```

Band is 4.6× cheaper than Pin for a reason you can read off that line: absorbing
the first standard deviation removes most of the expected payout.

Then two loads:

```
premium = fair · ( 1  +  u²  +  min(1.5, 1.2 · N/depth) )
```

- **`u²`, capital scarcity.** `u` is vault utilisation. Quadratic, so the vault's
  last dollar of capacity is never sold at the price of its first. It chokes off
  gracefully instead of getting wiped out by one crowded night.
- **`1.2·N/depth`. Concentration.** Writing 40% of an asset's depth is not four
  times the risk of writing 10%.

Floor: 1 cent, so dust trades cannot mint free optionality.

## Choosing the distribution by measuring it

The Gaussian is the default assumption and it is wrong here. Once σ was correctly
scaled, the backtest reported **76.1%** of opening prints inside ±1σ and **95.8%**
inside ±2σ.

| | 1σ | 2σ |
|---|---|---|
| normal | 68.3% | 95.4% |
| **standardised t(4)** | **77.0%** | **95.3%** |
| **measured** | **76.1%** | **95.8%** |

That pair of numbers is a fingerprint. A distribution can be too wide or too narrow
and still be normal; being *over*-covered at 1σ while landing on target at 2σ is a
statement about shape, peaked in the middle, heavy in the tails. It is a t(4), and
overnight equity gaps having about four degrees of freedom is exactly what the
empirical finance literature would predict.

**The correction goes the way nobody guesses.** "Fat tails" sounds like it should
make insurance dearer. At a far strike it would. At a deductible of 0 or 1σ the
taller peak dominates: more probability mass sits near zero, so the expected payout
is *smaller* than the Gaussian price. Repricing honestly made Pin **11% cheaper**
and Band **7% cheaper**.

We could have left the Gaussian in, called the difference prudence, and pocketed a
0.53 loss ratio. Measuring it and passing the difference on is the whole posture of
this project: **we are paid when the model is right, so the model being right has
to mean the price falls.**

## A load we tested and deleted

The fair price assumes σ is *known*. It is not, it is an estimate, and
`E[(G − kσ)⁺]` is convex in the scale of `G`, so uncertainty about σ should push
real payouts above the Gaussian-with-known-σ price. We shipped a 1.35× "model
risk" multiplier for it.

Then we measured. Once σ itself was properly calibrated the book already ran at a
healthy loss ratio on fair plus the two loads. The extra multiplier pushed it well
below: LPs earning a handsome return by overcharging users for a risk that was
already priced.

It is gone. The 30% of premium that is not expected claims *is* the LP's
compensation for bearing variance. That is what a loss ratio is for.

The counter-hypothesis. That gaps are Student-t and the Gaussian *under*prices the
tails, turned out to be half right and backwards. Gaps are indeed Student-t. But
for a unit-variance t(4), `E[(Z−k)⁺]` is **0.89–0.93×** the Gaussian value at
k ∈ {0,1}. A fat-tail load would have been the wrong sign, which is why we now
price the t(4) directly rather than loading a Gaussian.

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
when σ is small. So tightening the model, which is the thing that makes the
product better, is also the thing that shrinks our per-trade revenue. The only way
to grow is more volume and a vault that stays profitable, and the vault only stays
profitable if σ is right.

The protocol's cut is **10% of the vault's net profit**. Not of premiums, of
profit. In the demo's worst weekend the vault is down and Noctis earns nothing at
all. That is the correct behaviour and the UI shows it.

## Mirrored, not approximated

`programs/noctis/src/math.rs` and `app/src/lib/pricing.ts` implement the same
formula. The Rust side is integer-only fixed point in PPM and micro-USDC, no
floats, because a validator has to reproduce the number the client displayed, and
floats do not agree across targets. Downcasts are checked; an absurd notional
fails the instruction rather than silently truncating to something cheap.

`cargo test -p noctis --lib` covers the pieces that would actually cost someone
money: the half-straddle constant, Band-vs-Pin ratio, Raw always free, monotonicity
in utilisation and concentration, the dust floor, both settlement directions, a
favourable gap paying nothing, and overflow refusing rather than wrapping.
