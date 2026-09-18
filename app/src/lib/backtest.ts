/**
 * Backtest. The only part of this repo that can embarrass us, which is why it is here.
 *
 * For each synthetic night we ask three estimators what the opening print will be,
 * then run the auction and score them. We also check whether our σ is honest:
 * a 1σ band that only covers 40% of outcomes is a lie, and a band that covers 95%
 * is us overcharging for insurance.
 */

import { UNIVERSE } from '../data/universe';
import { computeMark } from './nyx';
import { quotePremium, settle, type Tier } from './pricing';
import { sessionAt } from './market';
import { SCENARIOS, instantAt, openingPrint, rng, worldAt, type Scenario } from './world';

export interface NightResult {
  scenario: string;
  sym: string;
  close: number;
  open: number;
  noctis: number;
  band: number;      // 1σ in price units
  tape: number;
  errNoctis: number; // fractional
  errClose: number;
  errTape: number;
  insideBand: boolean;
  insideTwoBand: boolean;
}

export interface BacktestSummary {
  nights: number;
  rmse: { noctis: number; lastClose: number; thinBook: number };
  mae: { noctis: number; lastClose: number; thinBook: number };
  coverage1: number;   // fraction of opens inside ±1σ. Target ≈ 0.68
  coverage2: number;   // ±2σ. Target ≈ 0.95
  /** Underwriting book across the same nights, at the BAND tier. */
  vault: { premiums: number; payouts: number; net: number; worstNight: number; hitRate: number };
  results: NightResult[];
  /** Errors bucketed for the histogram, in σ units. */
  zHist: { bin: number; n: number }[];
}

/** Fabricate a scenario with a fresh seed so we can run many independent nights. */
function jitter(base: Scenario, i: number): Scenario {
  const r = rng(base.seed + i * 7717);
  return {
    ...base,
    id: `${base.id}-${i}`,
    seed: (base.seed + i * 104729) >>> 0,
    marketShock: base.marketShock + (r() - 0.5) * 0.035,
    volMult: base.volMult * (0.6 + r() * 1.1),
    openJumps: Object.fromEntries(
      Object.entries(base.openJumps).map(([k, v]) => [k, v * (0.4 + r() * 1.6)]),
    ),
  };
}

export function runBacktest(nights = 200, tier: Tier = 'BAND', notionalPerTrade = 25_000): BacktestSummary {
  const results: NightResult[] = [];
  let premiums = 0, payouts = 0, worstNight = 0;
  let breaches = 0, covered = 0;

  const bases = SCENARIOS;

  for (let n = 0; n < nights; n++) {
    const sc = jitter(bases[n % bases.length], n);
    // Quote 6 hours before the auction, a realistic "late Sunday" decision point.
    const h = sc.windowHours * 0.9;
    const w = worldAt(sc, h);
    // A real session off the scenario's own calendar, so `nowMs` and `isOpen` are
    // populated and the remaining-time integration sees the same clock the app does.
    const base = sessionAt(instantAt(sc, h));
    const sess = { ...base, hoursClosed: h, hoursToOpen: sc.windowHours - h };

    let nightPnl = 0;
    const r = rng(sc.seed ^ 0xbeef);

    for (const a of UNIVERSE) {
      const m = computeMark(a, sess, w.factors, w.noise, w.tape[a.sym]);
      const open = openingPrint(sc, a);
      const tapePx = a.close * Math.exp(w.tape[a.sym].impliedReturn);

      const eN = (open - m.mid) / open;
      const eC = (open - a.close) / open;
      const eT = (open - tapePx) / open;

      const inside1 = Math.abs(open - m.mid) <= m.sigmaAbs;
      const inside2 = Math.abs(open - m.mid) <= 2 * m.sigmaAbs;
      if (inside1) covered++;

      results.push({
        scenario: sc.id, sym: a.sym, close: a.close, open,
        noctis: m.mid, band: m.sigmaAbs, tape: tapePx,
        errNoctis: eN, errClose: eC, errTape: eT,
        insideBand: inside1, insideTwoBand: inside2,
      });

      // Underwrite one trade per asset per night, random direction.
      const side: 'BUY' | 'SELL' = r() < 0.5 ? 'BUY' : 'SELL';
      const qty = notionalPerTrade / m.mid;
      const q = quotePremium({
        notional: notionalPerTrade, sigma: m.sigma, tier,
        vault: { tvl: 2_500_000, exposure: 400_000 }, depth: a.depth,
      });
      const s = settle({
        side, qty, fillPrice: m.mid, openPrice: open,
        sigmaAbs: m.sigmaAbs, tier, premium: q.premium,
      });
      premiums += q.premium;
      payouts += s.payout;
      nightPnl += q.premium - s.payout;
      if (s.payout > 0) breaches++;
    }
    worstNight = Math.min(worstNight, nightPnl);
  }

  const rms = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);
  const mae = (xs: number[]) => xs.reduce((s, x) => s + Math.abs(x), 0) / xs.length;

  const zs = results.map((r) => (r.open - r.noctis) / Math.max(1e-9, r.band));
  const BINS = 17, LO = -4, HI = 4;
  const zHist = Array.from({ length: BINS }, (_, i) => ({
    bin: LO + ((HI - LO) * (i + 0.5)) / BINS, n: 0,
  }));
  for (const z of zs) {
    if (!Number.isFinite(z)) continue;
    const i = Math.floor(((Math.max(LO, Math.min(HI - 1e-9, z)) - LO) / (HI - LO)) * BINS);
    zHist[i].n++;
  }

  return {
    nights,
    rmse: {
      noctis: rms(results.map((r) => r.errNoctis)),
      lastClose: rms(results.map((r) => r.errClose)),
      thinBook: rms(results.map((r) => r.errTape)),
    },
    mae: {
      noctis: mae(results.map((r) => r.errNoctis)),
      lastClose: mae(results.map((r) => r.errClose)),
      thinBook: mae(results.map((r) => r.errTape)),
    },
    coverage1: covered / results.length,
    coverage2: results.filter((r) => r.insideTwoBand).length / results.length,
    vault: {
      premiums, payouts, net: premiums - payouts, worstNight,
      hitRate: breaches / results.length,
    },
    results, zHist,
  };
}
