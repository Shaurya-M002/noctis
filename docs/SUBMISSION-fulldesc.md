## The 48 hours nobody prices

US equities are priced for 32.5 of a week's 168 hours. Tokenised stocks trade all 168.

We didn't assume the size of that gap. We measured it. Walking **24,000 on-chain writes** to Pyth's AAPL feed found exactly one interruption in five days: **48.00 hours, Friday 19:59:53 ET to Sunday 20:00:03 ET**. That moved our own headline down from a claimed 65.5.

So for 48 hours a week, an asset changes hands at a price no exchange and no oracle is producing.

## What Noctis does

**1. Publishes a mark with an error bar.** A factor model over always-on signals, fused by precision with the token's own on-chain tape. The output is a mid *and* a σ, where σ is forecast error for one specific future event: Monday's opening auction.

**2. Sells certainty about that auction, and nothing else.** No trading fee. You pay one premium, priced as a one-sided option on the gap, and an underwriting vault makes you whole if the print lands beyond your band.

Three identical $11.5k longs into the same Sunday sell-off, from the live demo:

| | premium | vault paid | net |
|---|---|---|---|
| Raw | none | $0.00 | **−$862.40** |
| Band | $24.78 | $585.52 | **−$301.66** |
| Pin | $118.63 | $862.40 | **−$118.63** |

The Pin holder's entire loss *is* the premium.

**3. Gets paid only when it's right.** The protocol takes 10% of the vault's **net profit** and nothing on volume. Mis-estimate σ and the vault loses money while we earn zero. The incentive to be calibrated is the business model, and the demo shows a weekend where the vault loses and we earn nothing.

## Three modes, one engine

- **Simulation.** A scrubbable synthetic weekend with a known latent truth, so the model can be scored.
- **Live mainnet.** Real xStocks from Jupiter and DexScreener, Pyth equity prices decoded from `PriceUpdateV2` accounts in the browser, real router quotes. No API key, no server.
- **Pre-IPO.** Eight PreStocks names where the weekend never ends, with Tessera as a second witness. The two issuers disagree by **21% on OpenAI, 56% on Kalshi, 59% on SpaceX**.

## Does it work?

800 synthetic weekends, model blind to the latent path:

```
RMSE vs the opening print   4.02%   (last close 9.43%, thin book 5.15%)
coverage at 1σ              76.1%   normal 68.3% · standardised t(4) 77.0%
coverage at 2σ              95.8%   normal 95.4% · t(4) 95.3%
underwriting loss ratio     0.66 Band / 0.74 Pin
```

That coverage pair identified the gap distribution as a **Student-t with 4 degrees of freedom**, not a normal. Repricing on it made the product **11% cheaper**, because at these deductibles the taller peak beats the fatter tail. We could have kept the Gaussian and called the difference prudence.

## Proof, not assertion

- **Live on devnet.** Program `NoCTajFqJn1QScfX3KozwSitGzcVf6muHLKXoKQhbhE`, with the full lifecycle settled on-chain and every step a clickable transaction.
- **17 Rust unit tests, 18 on-chain lifecycle tests**, all green. One of them runs an attack.
- **A critical settlement-replay exploit we found in our own code.** The opening print persisted on the account forever, so the following weekend a Pin position could be settled instantly against last week's print. Fixed with epochs. There is a test that runs the exploit and asserts it fails.
- **Timestamped forecasts committed to git before their outcomes existed**, recorded automatically. You can check the commit date against the print.

## Things we got wrong, and corrected

This is the part we'd most like read.

- We claimed Pyth's equity feeds return `MARKET_CLOSED` during our window. They don't. They publish 24/5, and we watched one tick every 15 seconds pre-market. Corrected everywhere.
- We claimed a 65.5-hour hole. Measured, it's 48.
- We shipped a 1.35× "model risk" load, measured it, found it unjustified, and deleted it.
- `docs/COMPETITION.md` names the closest existing project and says plainly that the insurance leg is not novel.

## Why Solana

The problem is *created* by tokenisation. An equity that only trades 09:30 to 16:00 has no weekend pricing problem. On-chain, σ is frozen into the receipt at fill time so we can't re-mark you, the vault's obligation is a real USDC balance under a PDA, and settlement is a permissionless crank that can only ever pay the receipt owner. Off-chain, every one of those is "trust the issuer."

## Links

- **Live demo:** https://shaurya-m002.github.io/noctis/
- **Repo:** https://github.com/Shaurya-M002/noctis
- **On-chain lifecycle:** [docs/DEVNET.md](https://github.com/Shaurya-M002/noctis/blob/main/docs/DEVNET.md)
- **Threat model:** [docs/SECURITY.md](https://github.com/Shaurya-M002/noctis/blob/main/docs/SECURITY.md)

Not investment advice. Reopen Assurance is a mechanism prototype, not a regulated insurance product.
