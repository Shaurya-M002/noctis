# Stocklana submission

Paste-ready answers. Fill the bracketed bits before submitting.

---

**Project name**

Noctis

**One line**

Fair value — and a price for being wrong about it — for the 135 hours a week
nobody is printing US equities.

**Links**

- Repo: `[github url]`
- Demo video: `media/noctis-demo.mp4` → `[youtube/loom url]`
- Live demo: `[vercel url]` (or `cd app && npm i && npm run dev`)
- Program: `NoCTajFqJn1QScfX3KozwSitGzcVf6muHLKXoKQhbhE`

**Team**

`[names + handles]`

---

## What it is

A week has 168 hours. US equities discover a price in 32.5 of them. Held in
self-custody, xStocks trade all 168 — Raydium, Orca and Meteora do not close.
Kraken's own book is 24/5 with weekends still in development, which sharpens the
point rather than softening it: the venue that could manage weekend risk is shut,
and the one that stays open has no risk desk.

So for four fifths of the week the asset changes hands at a price no venue on
earth is producing. Pyth and Chainlink return `MARKET_CLOSED`. The last official
close ignores everything since Friday. The 24/7 book is one $40k order and tens of
basis points wide, with no cash-equity arbitrage available to pull it back. Pyth
Pro's overnight feeds close most of the weekday hole — 24/**5** — and leave the
65.5-hour weekend, which is 39% of the week.

Noctis does two things.

**It publishes a mark with its own uncertainty attached.** A factor model over
always-on signals and the token's own on-chain tape, fused by precision, produces
a mid *and* a posterior σ. σ is the product, not the decoration.

**It sells certainty about the reopening print, and nothing else.** You are filled
at the mark with zero spread and zero commission. You may then buy a guarantee: at
**Band** you absorb the first 1σ and an underwriting vault pays every basis point
beyond it; at **Pin** you are made whole to the official opening print. Priced as
what it is — a one-sided option on the overnight gap — and quoted in dollars,
itemised.

## Who actually uses this

- Anyone holding a tokenized equity across a weekend who does not want to discover
  the gap on Monday. Pin turns an unknown into a line item.
- Market makers quoting xStocks overnight, who currently widen to cover a risk they
  cannot measure. A published σ lets them widen the right amount.
- Lending protocols that today freeze xStock collateral at the 16:00 bell. `mid`
  plus a σ-haircut is a margin policy; a stale close is not.
- LPs who want to be short weekend gap risk as an asset class and get paid a
  measured premium for it.

## Why Solana

The problem is *created* by tokenization — an equity that only trades 09:30–16:00
has no weekend pricing problem. Solana carries ~82% of tokenized equity volume, so
this is where the hole is.

And a quote nobody can settle against is a research note. On-chain, σ is frozen
into the receipt at fill time so we cannot re-mark you afterwards; the vault's
obligation is a real USDC balance under a PDA; settlement is a permissionless
crank that can only ever pay the receipt owner. Marks are also public accounts, so
a lender, an AMM or a perp venue can consume σ without asking us. Full argument:
`docs/WHY_SOLANA.md`.

## Why the pricing is different

Every venue in this problem space charges basis points on your notional. That toll
pays the same whether the venue's price was any good.

Noctis charges nothing for the trade. It charges a premium on σ — which means
tightening the model, the thing that makes the product better, is also the thing
that shrinks per-trade revenue. The protocol takes **10% of the underwriting
vault's net profit** and nothing on volume, so a badly calibrated σ earns us
exactly zero. The incentive to be right is the business model, and the demo shows
a weekend where the vault loses and we earn nothing.

## What is built

- **Anchor program**, compiles to SBF, `386 KB`. Marks with staleness and σ
  ceilings, an underwriting vault with share accounting and a utilisation cap,
  assurance receipts, permissionless settlement. Integer fixed-point premium math
  with checked downcasts, mirrored by the client so a validator reproduces the
  number the user was shown.
- **15 on-chain lifecycle tests** on a real validator, 0 failing —
  `./scripts/localnet-test.sh`.
- **12 Rust unit tests** on the premium and settlement math.
- **The demo app**, in two modes. *Simulation*: the four answers side by side, a
  scrubbable weekend, full return attribution and variance budget, the ticket,
  receipts, the vault, and the backtest. *Live mainnet*: the same model on real
  Jupiter / DexScreener / Coinbase data, keyless and fetched from the browser,
  with every source's status and latency on screen.
- **A backtest that can embarrass us**, in the UI and as a CLI.

## What live data changed

Pointing the code at mainnet was not a cosmetic step — it found two real defects.
The whole xStocks complex trades below reference on a Sunday, and reading that
naively made Nyx bearish on every name at once; it is a liquidity premium, not a
forecast, so the median is now stripped out. And SPYx, which *is* the market
proxy, was contributing to the factor that then explained it — one observation
counted twice, and a 0.44% σ it had not earned. Factors are now built
leave-one-out.

Live mode also shows the number that needs no model at all: eight AAPLx pools on
mainnet, same instant, **1019 bps between the highest and lowest print**. Nobody
can close that, because the thing you would hedge against is shut.

## The numbers

800 independent synthetic weekends and overnights, 8 names, model blind to the
latent path:

| | |
|---|---|
| RMSE vs opening print | **3.58%** (last close 8.47%, thin book 5.01%) |
| Improvement over doing nothing | **57.7%** |
| Coverage at 1σ | 73.5% (target 68.3% — we run wide) |
| Coverage at 2σ | 94.2% (target 95.4%) |
| Underwriting loss ratio | 0.69 |
| Worst single night | −$5,020 |

## What is not built

Stated up front, in full, in `docs/LIMITS.md`. In short: live mode cannot score
itself, so every calibration number comes from the synthetic backtest; betas and
vols are hand-set in both modes; the app is not wallet-connected (the chain is
exercised by the test suite instead); the devnet deploy did not happen because the
faucet rate-limited us and the binary needs ~2.7 SOL of rent; and the oracle is a
single permissioned signer, which is the first thing we would fix.

## What we did not invent

Written up in full in `docs/COMPETITION.md`, including a claim we had to correct.

**AfterHours** (Arbitrum Open House Singapore 2026) built weekend-gap puts on
Robinhood Chain rTokens with an ERC-4626 writer vault, priced on-chain in Rust,
with volatility split across open and closed seconds — the same insight as our
information-time weighting. The insurance leg of Noctis is not novel and we are
not going to pretend it is. What they do not have is a fair-value engine: they
price off Chainlink's last print, which during the dark window is Friday's close.

**Pyth already publishes confidence intervals** — the only major oracle that does.
An earlier draft of ours said σ was "the number every other oracle omits," which
was simply wrong. The surviving distinction: Pyth's `conf` is publisher
disagreement *right now*; ours is forecast error for a *specific future auction*.
And Pyth's equity feeds read `MARKET_CLOSED` during the window we exist for.

What we believe is new: publishing a forecast σ for the reopening print and
pricing a product off it, so model calibration and protocol revenue are the same
number — and getting paid on vault net profit rather than volume.

## Next

1. Replace synthetic factors with live feeds; replay real Friday-close →
   Monday-open gaps instead of a synthetic vol-of-vol process.
2. Oracle committee: stake-weighted, ed25519 aggregation, slashable when the
   auction proves a mark was outside its own published band.
3. Portfolio VaR for vault sizing — weekend gaps across 8 names are heavily
   correlated and the current reserve model treats receipts as independent.
4. Make the Assurance Receipt transferable. It is already a claim on the vault;
   a secondary market in weekend gap risk falls out of the design.
