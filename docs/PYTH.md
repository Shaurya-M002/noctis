# Pyth

Noctis does not compete with Pyth. It reads Pyth's schedule as its clock, Pyth's
on-chain price as its weekend anchor, and Pyth's confidence as the measurement
error on that anchor. The one thing it adds is a forecast σ for an event Pyth does
not claim to forecast.

Everything on this page was measured against mainnet, not read off a doc.

## Why we read the chain and not Hermes

The Pyth Core upgrade completed 26 Aug 2026. `hermes.pyth.network/v2/updates/*` now
returns `401 unauthorized` without a key, and there is no free tier that issues one
— Free is view-only, Starter is $500/mo and crypto-only, and **equities start at
Pro, from $2,500/mo**.

The same prices are on Solana mainnet, free, readable by anyone:

```bash
curl -s -X POST https://solana-rpc.publicnode.com \
  -H 'Content-Type: text/plain;charset=UTF-8' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getMultipleAccounts","params":[[
      "D9uk39pqZMcnmtPP9WeC8cREUpKZmyXLga9mSQ79SphW"],{"encoding":"base64"}]}'
```

So we read the chain. `hermes.../v2/price_feeds` — the *metadata* endpoint — is
still keyless, and that is where the schedule comes from.

## Three things that changed the code

**`api.mainnet-beta.solana.com` is not usable from a browser.** It rejects requests
carrying an `Origin` header. The RPC ladder leads with `solana-rpc.publicnode.com`
(`access-control-allow-origin: *`, held 60 concurrent requests in testing), then
mainnet-beta, then Tatum.

**`Content-Type: text/plain;charset=UTF-8` skips the CORS preflight.** It is a
safelisted value, so the browser sends one request instead of two, and Solana RPCs
ignore the content type entirely. Roughly halves latency. Tatum is the exception
and demands `application/json`, so the flag is per-endpoint. This also rules out
`@solana/web3.js`'s `Connection`, which hardcodes the JSON content type — we
hand-roll `fetch`, which incidentally keeps ~180 KB out of the bundle.

**The price offset is not a constant.** `verification_level` at byte 40 is a
variable-length Borsh enum: `Full` is one byte, `Partial{u8}` is two. Every equity
feed is `Full` today, so hardcoding offset 73 works — until one isn't, and then
every field shifts by one and you render garbage at full confidence. `pyth.ts`
branches on `buf[40]`.

```
0..8    discriminator 22f123639d7ef4cd
8..40   write_authority
40      verification_level tag   0x01 Full (1 byte) | 0x00 Partial (2 bytes)
41..73  feed_id                  (when Full)
73      price i64 · conf u64 · expo i32 · publish_time i64 · prev_publish_time i64
        · ema i64 · ema_conf u64 · posted_slot u64        all little-endian
```

## The stale-account trap

Each of these feeds has a **shard 0** account as well as the live shard 1. Shard 0
is abandoned, and nothing about reading it throws an error:

| feed | live (shard 1) | shard 0 | stale by | error if used |
|---|---|---|---|---|
| AAPL | $334.12 | $305.92 | 32.7 days | **−8.4%** |
| NVDA | live | $211.02 | 21 days | −1.4% |
| SPY | live | $765.48 | 21 days | +0.8% |
| TSLA | live | $365.28 | **4.5 days** | **+2.2%** |

TSLA is the dangerous one. Four days stale and 2.2% off is entirely plausible as a
real price — it would pass a smell test and quietly corrupt every premium quoted
against it.

Two guards, both cheap and both total:

1. **The decoded `feed_id` must equal the feed we asked for.** This makes a
   copy-paste slip impossible rather than merely unlikely.
2. **Anything older than 76 hours is refused.** The ceiling is 48h over a weekend
   and 72h over a holiday weekend, so 76 leaves margin without admitting shard 0.

`npm run pyth:verify` re-derives the account set from the chain, so the table above
is a checked claim rather than a magic constant.

## Pyth as the market clock

`market.ts` used to carry a `HOLIDAYS_2026` set typed by hand and the literals
`570`/`960`. Pyth publishes the real schedule on every equity feed:

```
America/New_York;0930-1600,0930-1600,0930-1600,0930-1600,0930-1600,C,C;
0907/C,1126/C,1127/0930-1300,1224/0930-1300,1225/C,0101/C,0118/C,0215/C,
0326/C,0531/C,0618/C,0705/C
```

Grammar: timezone; seven day rules Mon–Sun; then dated `MMDD/rule` overrides.
`C` closed, `O` open all day, `HHMM-HHMM`, several ranges joined by `&`, and `2400`
meaning midnight. The parser handles all of it and rejects a non-ET timezone rather
than mis-reasoning about one. Validated against the live AAPL, NVDA, TSLA and SPY
feeds — all four strings are byte-identical — plus 12 unit checks.

**We merge with the builtin holiday set rather than replacing it, and that is not
caution for its own sake.** Pyth's override list is a rolling ~12 months with *no
year on the dates*. Today it carries `01-18, 02-15, 03-26, 05-31, 06-18, 07-05` —
all 2027 — and carries none of 2026's `01-19, 02-16, 04-03, 05-25, 06-19, 07-03`.
Replacing would have silently deleted six holidays we know about. The union's cost
is a handful of spurious closures from next year's dates, which only ever widen σ:
the error runs in the conservative direction.

Failure is a no-op. A parse error, a 404, a timeout and a hostile response all
return the builtin calendar, and the app behaves exactly as it did before Pyth.

### The calendar never reaches the backtest

Every session function takes a trailing `cal` argument defaulting to
`BUILTIN_CALENDAR`. There is no global mutable calendar, deliberately: `world.ts`
generates the backtest's latent paths through `informationHoursAhead`, so a
calendar that could change underneath it would move the *truth* and silently
invalidate every calibration figure quoted in the README. Both the 800-night and
200-night runs are verified byte-identical across this change.

## What we measured, and the number we had to correct

We claimed a 65.5-hour hole — Friday's 16:00 bell to Monday's 09:30 open. Then we
walked 24,000 on-chain writes to the AAPL feed and found exactly one gap in five
days:

```
48.00h   Fri 2026-09-11 19:59:53 ET   ->   Sun 2026-09-13 20:00:03 ET
```

Normal cadence is a **median 11 seconds**, p90 13s, max 34s. So Pyth's equity feeds
run **Sunday 20:00 ET to Friday 20:00 ET, continuously** — right through every
weeknight — and then stop for exactly 48 hours.

That means Pyth covers 17.5 hours of the window we were claiming as ours: the
16:00–20:00 stretch after the bell, and Sunday evening through Monday's open. **The
window where neither the exchange nor the oracle says anything is 48 hours, not
65.5.** Smaller than we claimed, and now a measured number instead of a calendar
subtraction.

## Two questions the UI must never conflate

At 09:27 ET on a Wednesday, `market_hours.is_open` is `false` and the feed is
publishing every 12 seconds. Both are correct. The exchange session and the feed's
liveness are different questions, and rendering "MARKET CLOSED" beside a
19-second-old price would read as a bug — particularly for a project whose whole
subject is the hours the market is shut.

So the panel shows both, always, from different sources: **exchange session** from
the schedule, **feed liveness** from `publish_time`. They disagree most weeknights,
and that disagreement is the product.

## conf is not σ

Pyth publishes a confidence interval and it is a genuinely good number — it is the
only major oracle that does. An earlier draft of this repo said σ was "the number
every other oracle omits", which was simply wrong and is corrected.

The surviving distinction is narrower and real:

- **Pyth's `conf`** is cross-venue disagreement *right now*. AAPL sits around
  1–3 bps while the market is open.
- **Noctis's σ** is forecast error for a *specific future event*, the reopening
  auction. It runs around 100–300 bps across a weekend.

Two orders of magnitude apart, because they answer different questions. Both are
honest. Neither substitutes for the other.

## Known limitations

- **Shard 1 is pushed by a single unnamed wallet**, not a formally sponsored feed.
  It has run continuously for the 14 days we sampled, but it is one hot wallet that
  must be topped up. Unmitigable upstream; the staleness indicator is designed so
  that a frozen feed reads as correct behaviour rather than breakage.
- **Unplanned outages happen** — three gaps of 1.5–3.0 hours in 14 days, all in the
  00:00–09:00 ET window. The same age display covers them.
- **Holiday matching ignores the year.** See above; the error is conservative.
- **`Equity.Index.*` 24/7 feeds have no on-chain accounts** — Hermes-pull only, so
  they cannot rescue the weekend panel even with a key.

## Next, and honestly not before the deadline

The most central possible integration is a **three-way precision-weighted fusion**:
Pyth as a third witness alongside the factor model and the on-chain tape, with
`varPyth` derived from `conf` and staleness. That is the right long-term design.
It also modifies the fusion in `nyx.ts`, which means re-validating σ calibration
against the 800-night backtest — and the backtest has no Pyth series to fuse, so
one would have to be synthesised in `world.ts` too. That puts the single number the
whole submission rests on at risk for a day and a half of work. Named here rather
than rushed.

## Run it yourself

```bash
npm run pyth:verify     # re-derive the account set, assert ours is freshest
```

Or open the [live demo](https://shaurya-m002.github.io/noctis/), switch to **Live
mainnet**, and read the Pyth panel. Append `?pyth=off` to disable every Pyth code
path if an RPC is having a bad afternoon.
