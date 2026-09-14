<h1>Noctis</h1>

**The fair-value layer for the 135 hours a week US equities aren't priced — published with an error bar you can buy insurance against.**

Stocklana hackathon submission · Solana Foundation · September 2026

**▶ [Watch the 3-minute demo](https://github.com/Shaurya-M002/noctis/releases/download/v0.1.0/noctis-demo.mp4)** · captioned, no audio needed

![Noctis](media/02-hero.png)

---

## The hole

A week has 168 hours. US equities discover a price in **32.5** of them.

Held in self-custody, xStocks trade **all 168** — Raydium, Orca and Meteora do not
close. (Kraken's own book is 24/5, with weekends still "in development", which
sharpens the point: the venue that could manage weekend risk is shut, and the one
that stays open is the one with no risk desk.) So for four fifths of the week, an
asset changes hands at a price that no venue anywhere on earth is producing. Ask the infrastructure what AAPLx is worth at 03:00 on a
Sunday and you get one of three bad answers:

| | answer | why it's bad |
|---|---|---|
| Pyth / Chainlink equity feed | `MARKET_CLOSED` | honest, and useless — there is no executable price |
| Last official close | Friday's number | ignores everything that has happened since |
| The 24/7 order book | last trade | one $40k order, 26–60 bps to cross, no arb available to pull it back |

Pyth Pro now covers pre-market through overnight — **24/5**. That is real progress
and it closes most of the weekday hole. It does not cover the **65.5-hour weekend**,
which is 39% of the week, and it does not cover holidays.

That gap is what Noctis is for.

## Live, on mainnet, right now

The demo has two modes and the toggle is in the header. **Live** points the same
model at real data — Jupiter for on-chain and reference prices, DexScreener for
volume and per-venue prints, Coinbase for crypto returns measured from the actual
last ET close. Public endpoints, no API key, no server, fetched straight from the
browser.

Here is what it found on a Sunday night. Eight live AAPLx pools, same token, same
instant, real money in each:

![Venue dispersion](media/09-venues.png)

**1019 basis points** between the highest and lowest *quoted* pool price. During
Monday's session the same measurement reads **82 bps** — arbitrage tightens the
pools when there is something to arbitrage against, and they scatter when there
is not. That contrast is the thesis in one number.

Two honest qualifications, both on screen in the app:

- **Quoted is not executable.** A stale pool sitting 10% away is not free money;
  Jupiter's router walks straight past it because there is no size behind it. The
  panel now shows what the router will *actually* fill: a **0.42% round trip at
  $1k, 2.40% at $100k**. That gap is where most tokenised-equity arbitrage
  headlines die.
- Note the scale, though — assurance on AAPLx costs *tens of basis points* against
  a round trip that already costs 42. The friction Noctis prices is small next to
  the friction already there.

Pointing the code at mainnet also changed the model twice — see
[docs/DATA.md](docs/DATA.md):

- **The weekend basis is not a forecast.** Every xStock trades below its reference
  at once on a Sunday. Read naively that says the market is about to gap down 1.3%;
  really it is the price of liquidity when nobody can hedge. Nyx strips the median
  dislocation out and reads only the cross-section.
- **Factors are built leave-one-out.** SPYx *is* the market proxy, so letting it
  help build the factor that then explains it was counting one observation twice
  and giving it a 0.44% σ it had not earned.

And where a factor has no free always-on source — a dollar index, a tokenised-bill
yield — it is reported as **no source** and σ widens by the full uncertainty of the
move it would have explained. Setting it to zero would be a confident claim that
the dollar has not moved. Missing data should make the model less confident, not
accidentally more.

![Data sources](media/10-sources.png)

Live mode **cannot verify itself** — scoring a mark needs an opening print, and
Monday hasn't happened. So: live data proves the inputs are real, and the
synthetic backtest below proves the model is calibrated. Neither claim borrows the
other's evidence.

## What Noctis does

**1. It publishes a mark for hours when the incumbents publish nothing.**

Nyx — the fair-value engine — fuses two independent, noisy witnesses to the
latent value of a tokenized equity:

- a **factor model** over signals that never sleep (broad market, sector, crypto
  risk appetite, the dollar, rates), and
- the **on-chain tape** itself, weighted by how much money actually stood behind it.

It combines them by precision, which is why it beats both of its own inputs, and
it publishes the posterior standard deviation **σ** alongside the mid.

To be precise about the incumbent, because it matters: **Pyth already publishes a
confidence interval** — it is the one oracle that does, and it deserves the credit.
But two things differ. Pyth's `conf` is a *snapshot of disagreement between
publishers right now*; Noctis's σ is a *forecast error for a specific future
event*, the reopening auction. And Pyth's equity feeds are marked `MARKET_CLOSED`
during exactly the window Noctis exists for — there is no price to attach a
confidence to. Noctis is not "the oracle with error bars." It is an error bar for
the hours the other oracles are dark.

**2. It sells certainty about the reopening print, and nothing else.**

Noctis is **not a venue**. It never touches your trade. Execute on Jupiter,
Raydium, a CEX, wherever — there is no order flow here to tax, which is exactly
why the revenue model below is possible.

What it sells is **parametric** cover struck at the published mark. The payout is a
function of two published numbers — the mark, and the official opening print — and
of nothing about your actual fill. No claims adjuster, no proof of loss, no oracle
for your P&L: settlement is one permissionless instruction. The cost of that
simplicity is basis risk, and we name it: if you executed materially away from the
mark, you are covered relative to the mark, not to what you paid.

| tier | deductible | you get |
|---|---|---|
| **Raw** | everything | nothing, forever free |
| **Band** | first 1σ | the vault pays every basis point beyond it |
| **Pin** | none | you are made whole to the official opening print |

Three identical 50-share longs into the same Sunday sell-off, from the live demo:

| | premium | vault paid | net |
|---|---|---|---|
| Raw | — | $0.00 | **−$862.40** |
| Band | $24.78 | $585.52 | **−$301.66** |
| Pin | $118.63 | $862.40 | **−$118.63** |

The Pin holder's entire loss is the premium. That is what the product is.

![Receipts](media/06-receipts.png)

**3. It gets paid only when it is right.**

Every dollar of premium goes to the underwriting vault. The protocol takes **10%
of the vault's net profit** and nothing at all on your volume — there is no volume
to take, because Noctis is not in the trade. Mis-estimate σ and the vault loses
money and Noctis earns zero. There is no order-flow revenue to hide behind. The
incentive to be calibrated *is* the business model.

## Does it work?

Every hackathon demo asserts this. `engine/backtest.ts` measures it — 800
independent synthetic weekends and overnights across 8 names, with Nyx blind to
the latent path it is scored against.

```
$ npx tsx engine/backtest.ts 800 BAND

  Predicting the official opening print (RMSE, lower is better)
    Noctis mark                   4.018%  ██████████████
    Last official close           9.428%  ██████████████████████████████████
    Thin 24/7 book last trade     5.151%  ███████████████████
                                          → Noctis is 57.4% better than doing nothing

  Is sigma honest?
    target depends on the SHAPE of the gap distribution, not just its width:
    inside ±1σ     76.1%    normal 68.3%  ·  standardised t(4) 77.0%
    inside ±2σ     95.8%    normal 95.4%  ·  standardised t(4) 95.3%
    → the gap is peaked and fat-tailed. Premiums are priced off t(4),
      which at these strikes is CHEAPER than the Gaussian, not dearer.

  Underwriting book
    premiums written       $582,035
    claims paid            $386,429   (11.2% of trades claimed)
    LP net                 $195,606
    worst single night      $-5,859
    loss ratio                0.664
```

Read honestly. The point estimate beats both baselines. σ is not merely the right
*width* — the coverage pins down the distribution's *shape*, and it is a
standardised Student-t with 4 degrees of freedom, not a normal. So that is what the
premium is priced off.

That correction went the direction nobody expects. Fat tails sound like they should
make insurance dearer; at a deductible of 0 or 1σ the taller peak dominates instead,
and the honest price came out **11% cheaper for Pin and 7% cheaper for Band** than
the Gaussian formula we started with. The book still runs at a 0.66 loss ratio
(0.74 on Pin) — real insurance-book margin, all of it LP compensation for variance.

Every number here is one click away in the UI, and `engine/backtest.ts` reproduces
it on your machine.

![Backtest](media/07-backtest.png)

## A forecast, in git, before the outcome existed

A backtest is a claim about a model on data the author picked. So here is the other
kind of evidence.

```bash
npm run forecast:record    # snapshot live marks -> forecasts/marks.jsonl, commit it
npm run forecast:score     # after the bell, fetch what actually happened
npm run forecast           # the running scorecard
```

[`forecasts/`](forecasts/) holds timestamped marks with their bands and every input
that produced them, written before the auction they predict. Check the commit date
against the print. You do not have to trust us, run our code, or accept our
synthetic world — the line was in the repo before the answer existed.

It fills itself, and pushes. A LaunchAgent runs `scripts/forecast-cron.sh` hourly;
the script takes a mark whenever US equities are dark and the last one is stale,
scores whenever a forecast's bell has rung, commits, and pushes here. Nothing is
recorded during the session, when there is a real price and nothing to forecast —
so `marks.jsonl` appears at the next close and grows from there. A weekend leaves
about 20 marks per name behind for Monday to grade.

## Run it

```bash
# the demo — both modes, toggle in the header
cd app && npm install && npm run dev        # http://localhost:5273

# a timestamped forecast you can check later
npm run forecast:record

# the numbers
npx tsx engine/backtest.ts 800 BAND

# the program: fixed-point premium math
cargo test -p noctis --lib

# the program: full lifecycle on a real validator
./scripts/localnet-test.sh
```

`./scripts/localnet-test.sh` boots a throwaway validator, deploys the SBF binary
and runs the whole lifecycle — register → publish mark → LP underwrites → RAW fill
(free) → Pin fill (premium charged, matched against the on-chain fixed-point math)
→ opening auction → settle → payout → capital released.

```
  ✓ initialises with a profit-share, not a volume fee
  ✓ registers an asset at its Friday close
  ✓ refuses to quote when uncertainty is absurd
  ✓ publishes a weekend mark with its uncertainty attached
  ✓ lets an LP underwrite the gap
  ✓ charges nothing for a RAW fill
  ✓ two fee-free trades do not collide on the receipt PDA
  ✓ prices Pin cover as an option on the gap, and charges exactly that
  ✓ honours the caller premium limit
  ✓ will not settle before the auction has printed
  ✓ makes a Pin holder whole when Monday gaps against them
  ✓ will not settle the same receipt twice
  ✓ leaves the LP down exactly premiums minus claims
  ✓ refuses to let an LP withdraw capital that is backing live receipts
  ✓ refuses to trade against a stale mark

  15 passing, 0 failing
```

## Layout

```
programs/noctis/       Anchor program  ·  program id NoCTajFqJn1QScfX3KozwSitGzcVf6muHLKXoKQhbhE
  src/math.rs          fixed-point premium & settlement, 12 unit tests, no floats
  src/lib.rs           marks, vault, receipts, permissionless settlement crank
                       17 unit tests: premium math + the vault reserve's monotonicity
app/                   the demo (Vite + React, hand-rolled SVG charts)
  src/lib/nyx.ts       the fair-value engine
  src/lib/feeds.ts     live mainnet data — Jupiter, DexScreener, Coinbase
  src/lib/useLive.ts   live mode: same model, real inputs
  src/lib/pricing.ts   the premium math, mirrored by math.rs
  src/lib/world.ts     deterministic synthetic world with a latent truth Nyx cannot see
  src/lib/backtest.ts  scoring
engine/backtest.ts     the same backtest as a CLI
engine/forecast.ts     record a timestamped mark, score it once the bell rings
forecasts/            committed predictions, written before their outcomes
tests/noctis.ts        on-chain lifecycle suite
scripts/               localnet runner, screenshots, demo recorder
docs/                  MODEL · PRICING · WHY_SOLANA · DEMO · SUBMISSION
```

## Docs

- [CONTRIBUTING.md](CONTRIBUTING.md) — running it from a clean clone, and three toolchain traps that cost us an hour each

- [docs/COMPETITION.md](docs/COMPETITION.md) — who else is doing this, what we did not invent, and what is actually new
- [docs/SECURITY.md](docs/SECURITY.md) — threat model, and the critical bug we found in our own settlement path
- [docs/DATA.md](docs/DATA.md) — the live feeds, and the two things real data forced into the model
- [docs/MODEL.md](docs/MODEL.md) — how the mark and σ are built, and what σ is made of
- [docs/PRICING.md](docs/PRICING.md) — the premium as an option on the gap, and a load we tested and deleted
- [docs/WHY_SOLANA.md](docs/WHY_SOLANA.md) — why this is not a web2 API with a token bolted on
- [docs/DEMO.md](docs/DEMO.md) — the three-minute walkthrough
- [docs/LIMITS.md](docs/LIMITS.md) — what is synthetic, what is unsolved, what would break first

## Honesty

**Live mode** is real mainnet data from public keyless endpoints, listed with
status and latency in the UI so you can check every one.

**Simulation mode** is synthetic and deterministic — one seed, reproducible, and
documented in [docs/LIMITS.md](docs/LIMITS.md). Betas, vols and the latent path
are calibrated to plausible values, not fetched. Every calibration number in this
README comes from there, because scoring a mark requires an opening print that
live mode does not have yet.

Also real: the program compiles to SBF and passes a full lifecycle on a validator,
and the fixed-point premium math is the same formula in Rust and TypeScript, with
the on-chain test asserting the client's number against the chain's.

Nothing here is investment advice, and Reopen Assurance is a mechanism prototype,
not a regulated insurance product.
