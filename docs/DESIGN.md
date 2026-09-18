# Visual system

Dark by construction, the product is about the hours when the lights are off.

## Chart palette

Three categorical series, validated with the `dataviz` skill's checker against the
chart surface `#0b0d11` on the **all-pairs** list (line charts overlay everything,
so adjacent-pair validation is not enough):

```
$ node validate_palette.js "#c98500,#3987e5,#1baf7a" --mode dark --surface "#0b0d11" --pairs all

  [PASS] Lightness band         all 3 inside L 0.48–0.67
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst all-pairs #1baf7a↔#c98500 ΔE 10.6 (deutan)
  [PASS] Normal-vision floor    worst all-pairs #1baf7a↔#c98500 ΔE 19.8
  [PASS] Contrast vs surface    all 3 >= 3:1
```

| slot | hex | carries |
|---|---|---|
| 1 | `#c98500` | the Noctis mark and its ±1σ ribbon |
| 2 | `#3987e5` | the on-chain last trade |
| 3 | `#1baf7a` | latent truth / the official opening print |

**Friday's close is not a series.** It is a reference annotation, muted grey,
dashed, directly labelled, because it is a constant, not a measurement.

Rejected: a four-colour set with red for the open print. It failed all-pairs CVD
separation (ΔE 4.1 deutan against the aqua). The fix was to drop to three
categorical slots rather than ship a pair colourblind readers cannot separate.

## Rules held to

- Every series is direct-labelled in the legend; identity is never colour alone.
- Status colours (`up` `#35c77e`, `down` `#e66767`) are reserved for P&L and always
  carry an explicit sign. They never appear as a chart series.
- One y-axis. Never two.
- Recessive grid, 2px marks, tabular-lining numerals everywhere a number can be
  compared to another number.
- Hover crosshair with a value readout on the band chart; per-mark titles on every
  bar.
- The region right of the cursor is hatched and labelled **NOT YET HAPPENED**.
  Drawing a confident line into the future would contradict the entire thesis.
