# Why this is on Solana

A fair-value model is software. You could sell it as a REST endpoint. The parts
below are the ones that stop working the moment you do.

## 1. The problem only exists because the asset is on-chain

An equity that only trades 09:30–16:00 has no weekend pricing problem, nobody can
transact. The hole is created *by* tokenization: xStocks, Kraken's 700+
tokenized names, and every AMM holding them are open all weekend. Solana is where
~82% of tokenized equity volume actually is. This is not a problem we brought to
the chain; it is one the chain created and has to solve.

## 2. A quote nobody can settle against is a research note

The premium is only worth anything if the payout is enforceable without trusting
us. On-chain:

- the mark and its σ are a signed account with a publish timestamp, and the
  program refuses to trade against one older than 120 seconds;
- σ is **frozen into the receipt** at fill time, so the band you were quoted is
  the band that settles, we cannot re-mark you after the fact;
- the vault's obligation is a real USDC balance under a PDA, not a promise;
- settlement is a **permissionless crank**, anyone can trigger a payout, and it
  can only ever pay the receipt owner.

Off-chain, every one of those is "trust the issuer." An insurance product whose
issuer can quietly restate the strike is not a product.

## 3. Composability is the roadmap, and it is the part a database cannot do

The mark and σ are public accounts. Once they exist:

- a lending protocol can margin xStock collateral overnight against `mid` and
  haircut by `σ` instead of freezing the market at 16:00 ET;
- an AMM can widen its curve with σ instead of a hardcoded fee tier;
- a perp venue can use `mid` as its weekend index and `σ` to size funding bands;
- the Assurance Receipt is itself a transferable claim on the vault, secondary
  markets in weekend gap risk fall out of the design rather than being built.

None of that needs our permission or a business-development call. That is the
whole argument for a public ledger, and it is the reason σ is published as data
rather than kept as a private risk parameter.

## 4. The economics need cheap, frequent, small writes

A mark per asset every ~30 seconds across a universe of hundreds of names, plus a
settlement crank on every receipt at every reopen. On Solana that is rounding
error. On an L1 with dollar-scale fees the oracle cadence collapses, σ goes stale,
and stale σ is exactly the failure this project exists to prevent.

Premiums are also small, the Band tier in the demo is **$24.78**. A product whose
median ticket is tens of dollars cannot live somewhere a transaction costs more
than the premium.

## 5. Honest limits

- **The oracle is a permissioned signer today.** One authority publishes marks and
  the official opening print. That is a real centralisation and the first thing to
  fix: a committee with ed25519 signature aggregation, stake-weighted, slashable
  on a mark that the auction later proves was outside its own band.
- **The opening print is posted by that same authority.** It should be a
  multi-source attestation, and it is the highest-value thing to attack.
- **Nothing about the legal wrapper is solved.** Reopen Assurance pays out like
  insurance and would be regulated as something, somewhere. This is a mechanism
  prototype.
