# Threat model

What can go wrong, who can cause it, and which of those we have actually closed.

## Closed, with a test

### Settlement replay across dark windows

**Severity: critical. Found by us, in review, before submitting.**

`AssetMark.open_print` was set by `post_open_print` and never cleared. `settle_receipt`
only checked `open_print > 0`.

So after the first Monday auction, the account permanently carried *a* print. The
following weekend an attacker could:

1. read last Monday's print, and the mark Noctis is publishing now;
2. see which direction pays — say last week printed well below where the mark sits;
3. buy **Pin** cover on a long, whose payout is `(fill − open) × qty` with a zero
   deductible;
4. call the permissionless `settle_receipt` **immediately**, against a week-old
   print, and collect the whole difference.

No waiting, no risk, repeatable until the vault is empty. Premium paid is a
rounding error against the payout, and the attacker chooses only trades where last
week's stale print is favourable.

**Fix.** `AssetMark` gained `epoch`, `open_print_epoch` and `open_receipts`.
Receipts record the window they were written in. Settlement requires
`receipt.epoch == asset.open_print_epoch`. `publish_mark` opens the next window by
incrementing `epoch`, and refuses to do so while receipts from the current one are
outstanding, so nothing is stranded on an epoch boundary.

**Tests.** `closes the settlement-replay hole across dark windows` runs the attack
and asserts `WrongEpoch`. Two more cover the boundary: `will not open a new window
while receipts are still unsettled`, `refuses to insure a window whose auction has
already printed`.

### Receipt PDA collision on fee-free trades

Seeds used `vault.receipts_opened`… originally `vault.premiums_collected`, which
the RAW tier never increments. Two consecutive RAW positions by the same trader on
the same asset derived the same PDA and the second failed. Not a fund loss, but a
denial of the free tier. Fixed with a monotonic counter; test:
`two fee-free trades do not collide on the receipt PDA`.

### Config PDA deserialised but not seed-checked

`RegisterAsset`, `PublishMark`, `PostOpenPrint` and `AdminOnly` took `config` as a
plain `Account<Config>` with a `has_one`. An attacker could pass *any* account of
the right type — including one they had initialised with themselves as `oracle`.
All four now carry `seeds = [b"config"], bump = config.bump`.

### Silent truncation in premium math

Every `u128 → u64` in `math.rs` was an `as` cast. A large enough notional wrapped
and produced a cheap premium for enormous cover. Now `u64::try_from(..).ok()?`
throughout, so the instruction fails instead. Test:
`absurd_inputs_refuse_rather_than_wrap`.

## Open, and stated

### The oracle is one key

`config.oracle` signs both `publish_mark` and `post_open_print`. That key can:
publish a σ it knows is too tight (underpricing the vault's own risk), or post a
false opening print and drain the vault to a colluding receipt holder.

This is the largest single risk in the design and the first thing to fix. The
intended shape: a committee with ed25519 signature aggregation, stake-weighted,
**slashable when the auction later proves a published mark lay outside its own
published band**. The band is the commitment that makes the slashing condition
objective — which is a second reason to publish σ.

### Vault exposure treats receipts as independent

`capital_at_risk` is summed per receipt. Weekend gaps across eight large-cap US
names are heavily correlated; a single risk-off Monday hits every position at once.
The 85% utilisation cap and the quadratic scarcity load blunt this but do not price
it. Correct sizing is a portfolio VaR over the covariance of the covered names, not
a sum. Modelled in the demo's vault panel, not in the program.

### Tape manipulation

The tape leg is weighted by traded volume against pool depth. An attacker willing
to move real size through a thin weekend pool can drag the mark, then take the
other side. Cost is bounded by depth, which on some names is under $100k.
Unmitigated. The standard defences — TWAP across the window, trimmed means, a hard
cap on how far the tape may pull the mark from the factor leg — are not built.

Note the basis subtraction helps slightly by accident: moving *one* name does not
move the median, so a single-pool attack shows up as cross-sectional signal rather
than being absorbed into the basis. Moving the whole complex is far more expensive.

### Liveness of the settlement crank

`publish_mark` will not open a new window while receipts are outstanding, so a
never-cranked receipt stalls new cover on that asset. Settlement is permissionless
and anyone can clear it, and the vault has a direct incentive to (it releases
exposure), so this is a nuisance rather than a grief. A `force_expire` after a long
timeout would remove the edge case entirely.

### Not audited

This is a hackathon build. It has unit tests, an 18-case on-chain lifecycle suite,
and one critical bug found and fixed in self-review. That is not an audit.

## Deliberate design choices that look like bugs

- **Settlement is asymmetric.** A gap in the holder's favour is theirs. This is
  insurance, not a swap. Pricing it symmetrically would halve the premium and
  double the vault's variance.
- **A vault that cannot pay in full pays what it has** and emits the shortfall,
  rather than reverting. Reverting would strand every receipt queued behind the
  first one that exceeded the balance.
- **σ is frozen into the receipt at fill time.** The band you were quoted settles,
  whatever the oracle publishes afterwards. This removes an entire class of
  re-marking attack and is why `Receipt` stores `sigma_abs` rather than reading it
  back off the asset.
