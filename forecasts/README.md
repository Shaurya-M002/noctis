# Committed forecasts

`marks.jsonl` — one JSON object per line, appended by `npm run forecast:record`.

Each line is a Noctis mark taken at a stated instant, with the band, the session,
hours to the next bell, the complex-wide basis, the crypto factor, and the raw
on-chain and reference prices that produced it. `scored` is `null` until
`npm run forecast:score` fills it in from what the market actually did.

**Why this file exists.** A backtest is a claim about a model evaluated on data its
author selected, in a world its author built. Everything in `engine/backtest.ts` is
that. This is the other kind of evidence: a prediction with a git commit timestamp
that predates the outcome. Anyone can check it against the print without running
our code or believing our synthetic world.

It is also the only artefact here that can make us look bad later, which is rather
the point of including it.

## Reading a line

```
recordedAt    ISO instant the snapshot was taken
etClock       the same instant in New York wall time
session       weekend / overnight / regular / …
hoursToOpen   hours until the next regular-session bell
basis         complex-wide median xStock dislocation, stripped before signal
marks[]       per asset: mid, sigma, lo, hi, reference, onChain, dislocation
scored        null, or { scoredAt, results[] } with actual, errors, and z
```

`z = (actual − mid) / (sigma × mid)`. Across enough lines, those z values should
look like a standardised Student-t with about 4 degrees of freedom — that is the
distribution the premium is priced off, and this file is where the claim gets
tested against reality rather than against our own generator.

## Caveat, stated plainly

`score` uses Jupiter's reference price once it has moved past the snapshot
timestamp — the underlying's price after the market reopened, from the same feed
that produced the input. It is not the auction print to the tick. It is
independently checkable and apples-to-apples, which for this purpose matters more.
