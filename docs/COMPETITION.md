# Who else is doing this

Researched before submitting, written up honestly. Two of the entries below are
close enough that pretending otherwise would be worse than saying so.

**Short version:** nobody is doing the whole thing. The two halves each have a
relative, and the half that has the closest relative is the half we consider less
novel.

---

## The closest thing that exists: AfterHours

[`github.com/bchuazw/afterhours`](https://github.com/bchuazw/afterhours) —
*"Weekend-gap protection for tokenized stocks, priced onchain."* Arbitrum Open
House Singapore 2026.

This is genuinely close, and it is close to the half of Noctis we did not invent.

| | AfterHours | Noctis |
|---|---|---|
| product | European puts at a chosen strike | assurance on a fill at the published mark |
| chain / asset | Robinhood Chain (Arbitrum) / rTokens | Solana / xStocks |
| price source | Chainlink's last print | **its own fair-value mark** |
| premium | Black-Scholes on realized vol | partial expectation on a **published posterior σ** |
| vol handling | σ² · (T_open + m²·T_closed) | information-time weighting — the same idea |
| writers | ERC-4626 vault | PDA vault, utilisation-capped |
| settlement | first Chainlink print at/after expiry | first official opening print |
| revenue | writer spread | 10% of vault **net profit**, zero on volume |

**What this means for us.** The insurance leg of Noctis is not novel. Somebody
built a good version of it on another chain at another hackathon, and their
open/closed second-weighting of volatility is the same insight as our
`informationHours`. Converging on that independently is mild evidence it is right,
not evidence we were first.

**What is still ours.** AfterHours has no fair-value engine. It prices a put off
Chainlink's last print — which, during the window it exists for, is Friday's close.
That is the correct engineering choice for an options product and the wrong one for
the question *"what is this worth right now"*. Noctis's Part 1 — publishing a mark
**and** a forecast σ during the dark window, from a factor model fused with the
on-chain tape — is absent there, and it is the part everything else in Noctis hangs
off. Our premium is priced off our own σ, so the model and the product are the same
artefact. Theirs are separable.

## Pyth — and a claim we had to correct

**Pyth already publishes a confidence interval.** It is the only major oracle that
does, publishers submit `(price, conf)` targeting 95% coverage, and it is a good
piece of design. An earlier draft of this README said σ was "the one number every
other oracle omits." That was wrong, and it is fixed.

The real distinction is narrower and survives:

- Pyth's `conf` is **cross-venue disagreement right now** — a snapshot of how much
  publishers and venues differ at this instant.
- Noctis's σ is **forecast error for a specific future event** — the reopening
  auction, hours or days away. Nothing about publisher agreement tells you that.
  ([arXiv 2608.09188](https://arxiv.org/html/2608.09188) makes this case formally:
  cross-venue agreement is not price discovery.)
- And during the window Noctis exists for, Pyth's US equity feeds are marked
  publishing at all from Friday 16:00 ET — its schedule marks Sat/Sun `C`. There is
  no price for a confidence interval to attach to.

**Pyth Pro** covers pre-market through overnight — 24/**5**, sourced from
institutions active in those sessions. That closes most of the weekday hole
properly and is better than anything we could build. It does not cover the
48-hour weekend gap in its own on-chain feed, or holidays. That 48 hours — measured
by walking 24,000 writes, not inferred — is the hole we are in.

## Ostium / Stork — the incumbent answer, and why we disagree

Ostium runs a custom 24/7 RWA oracle via Stork for equity perps. Off-hours, the
approach across the perp venues is essentially: **let the perp's own price be the
mark.** When the external market is open, use the external price; when it is shut,
the venue's own book is the index.

That is a coherent design and it works when the venue is deep. It is exactly what
Noctis argues against for a thin weekend DEX book — our live mode measures **1019
bps between eight AAPLx pools at the same instant** on a Sunday, against 82 bps
during Monday's session. A mark taken from any one pool is a mark taken from
whichever pool you happened to read.

To be fair to that design: quoted dispersion is not executable dispersion, and a
router aggregating across the pools recovers a far tighter number (0.42% round trip
at $1k). The argument is not that the on-chain price is useless — it is that it is
one noisy witness, which is why Nyx weights it by precision rather than either
trusting it or ignoring it.

## Nightwatch — adjacent, not the same

[`github.com/Ritik200238/nightwatch`](https://github.com/Ritik200238/nightwatch) —
*"Stress-test a tokenized-US-stock trade before you place it."* Historical analogs,
preset stress tests, exit-liquidity checks, a sized verdict. Robinhood Chain
rTokens.

Same diagnosis of the problem — it names "the same gap between token and fair
value" as an analog-matching key — and a completely different response. It is a
decision-support tool for a human. No published mark, no σ, no vault, no premium,
nothing on-chain to settle against. Adjacent, and worth reading.

## Chainlink, Chaos Labs Edge

Chainlink supplies xStocks feeds, Proof of Reserve and CCIP. Edge is Jupiter's
primary oracle, 5 updates/sec, and unifies price with risk data. Both are
infrastructure Noctis would consume rather than compete with — neither publishes a
weekend fair value for a closed equity, which is the specific gap here.

## Academic

- *When Cross-Venue Agreement Is Not Price Discovery* — [arXiv 2608.09188](https://arxiv.org/html/2608.09188)
- *When the Underlying Goes Dark: Oracle Forecast Error and Mechanism Failure in
  Perpetual Futures on Chinese Equities* — [SSRN 7011358](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7011358)

Both describe the failure mode Noctis is built around. Neither proposes pricing the
uncertainty and selling it, which is the part we think is new.

## So what is actually novel

Ranked by how confident we are, most to least:

1. **Publishing a forecast σ for the reopening auction and pricing a product off
   it**, so the model's calibration and the protocol's revenue are the same number.
   We have not found this anywhere.
2. **Getting paid on vault net profit rather than volume.** Every venue in this
   space charges bps on notional. AfterHours takes a writer spread. Neither has the
   property that a badly calibrated model earns zero.
3. **Stripping the complex-wide basis before reading the on-chain tape as signal.**
   Standard practice in cross-sectional equity work, apparently not yet applied to
   xStocks. Fell out of pointing the code at mainnet.
4. **Weekend gap insurance with a writer vault.** Not novel — see AfterHours.
5. **Noticing that the weekend is unpriced.** Not novel at all. Pine Analytics,
   Pyth, xStocks' own marketing and two papers all say it. The gap is well known;
   what is missing is a mark you can transact against.
