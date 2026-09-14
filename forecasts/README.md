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

## It records itself

A LaunchAgent (`~/Library/LaunchAgents/com.noctis.forecast.plist`) pokes
`scripts/forecast-cron.sh` hourly. The script does not decide on a schedule — it
asks the market:

- **US equities dark** and the last mark is more than 2.5h old → take a new mark.
- **Market open** → try to score anything whose bell has rung.
- **Otherwise** → nothing, exit 0.

So a weekend produces roughly 20 marks per name spread across the window, and
Monday resolves them. Nothing accumulates during the session, when there is a real
price and nothing to forecast.

It commits `marks.jsonl`, and only `marks.jsonl`, and pushes it — a forecast nobody
can see proves nothing. A failed push is logged and retried next hour rather than
left to rot locally. It never exits non-zero, so a dead feed cannot kill the
schedule.

`marks.jsonl` does not exist until the first dark window after the scheduler was
installed. That is the intended behaviour, not a missing file.

```bash
launchctl unload -w ~/Library/LaunchAgents/com.noctis.forecast.plist   # stop
tail -f forecasts/cron.log                                            # watch
```

Caveat: it fires on wake, not while asleep. A laptop shut all weekend records
nothing until it opens.

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

A forecast only resolves once `recordedAt + hoursToOpen` has passed — the bell it
was actually aimed at — and the reference feed has printed since. Scoring a
"where will the next auction print" forecast against an intraday tick an hour later
would be measuring the wrong thing, and the first version of the scorer did exactly
that.

`z = (actual − mid) / (sigma × mid)`. Across enough lines, those z values should
look like a standardised Student-t with about 4 degrees of freedom — that is the
distribution the premium is priced off, and this file is where the claim gets
tested against reality rather than against our own generator.

## Caveat, stated plainly

`score` uses Jupiter's reference price once it has moved past the snapshot
timestamp — the underlying's price after the market reopened, from the same feed
that produced the input. It is not the auction print to the tick. It is
independently checkable and apples-to-apples, which for this purpose matters more.
