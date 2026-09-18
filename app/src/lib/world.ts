/**
 * A deterministic synthetic world, so the demo is reproducible and honest.
 *
 * There is a LATENT TRUTH: the value the equity actually has while nobody is
 * printing it. Nyx never sees it. Nyx sees noisy factor readings and a thin
 * on-chain tape. At the reopening auction the truth becomes the official print
 * and everyone finds out how wrong they were.
 *
 * That separation is the whole reason this codebase can prove anything.
 */

import type { Asset, FactorId } from '../data/universe';
import { FACTORS, UNIVERSE } from '../data/universe';
import type { FactorNoise, FactorReturns, TapeSignal } from './nyx';
import { informationHoursAhead } from './market';

/** mulberry32, small, fast, seeded. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller from a uniform generator. */
export function gauss(r: () => number) {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const GRID = 96; // path resolution across the closed window

/** Annualised vol of each factor's *level*, used to shape the latent path. */
const FACTOR_VOL: Record<FactorId, number> = {
  MKT: 0.14, SECT: 0.20, CRYPTO: 0.55, FX: 0.07, RATES: 0.09,
};

/** How badly we can read each factor overnight (1 sigma, decimal, at full window). */
const FACTOR_NOISE: Record<FactorId, number> = {
  MKT: 0.0022, SECT: 0.0035, CRYPTO: 0.0009, FX: 0.0011, RATES: 0.0014,
};

export interface Scenario {
  id: string;
  name: string;
  blurb: string;
  seed: number;
  /** Total calendar hours the market stays shut in this scenario. */
  windowHours: number;
  /** UTC instant of the regular-session close that opens the window. */
  startUTC: string;
  /** Extra drift applied to MKT across the window, the "news" of the weekend. */
  marketShock: number;
  /** Multiplier on all factor vols. */
  volMult: number;
  /** Per-symbol idiosyncratic jump applied at the reopening auction. */
  openJumps: Record<string, number>;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'quiet',
    name: 'Quiet weekend',
    blurb: 'Nothing happens. Friday 16:00 ET to Monday 09:30 ET, 65.5 hours of silence.',
    seed: 20260912, windowHours: 65.5, startUTC: '2026-09-11T20:00:00Z', marketShock: 0.0015, volMult: 0.45,
    openJumps: {},
  },
  {
    id: 'risk-off',
    name: 'Sunday risk-off',
    blurb: 'Crypto sells off through Sunday. Equity beta follows it down at the open.',
    seed: 771103, windowHours: 65.5, startUTC: '2026-09-11T20:00:00Z', marketShock: -0.021, volMult: 1.25,
    openJumps: { MSTRx: -0.028, COINx: -0.019 },
  },
  {
    id: 'earnings',
    name: 'NVDA prints after the bell',
    blurb: 'A single-name discontinuity no factor model can see. Nyx widens σ instead of pretending.',
    seed: 44921, windowHours: 17.5, startUTC: '2026-09-16T20:00:00Z', marketShock: 0.004, volMult: 1.0,
    openJumps: { NVDAx: 0.081 },
  },
  {
    id: 'gap-up',
    name: 'Monday gap up',
    blurb: 'Overseas markets rally overnight. The stale-close oracle is 2% too low all weekend.',
    seed: 5150, windowHours: 65.5, startUTC: '2026-09-11T20:00:00Z', marketShock: 0.024, volMult: 1.1,
    openJumps: {},
  },
];

/** Cached latent paths per scenario. */
const cache = new Map<string, {
  factorPath: Record<FactorId, number[]>;
  idioPath: Record<string, number[]>;
  tapeNoise: Record<string, number[]>;
}>();

/**
 * Trading-day equivalents in the window.
 *
 * Calendar hours are the wrong clock: 65.5 hours of weekend is not ten trading
 * days of news, it is about one. Nyx discounts elapsed time the same way in
 * `informationHours`, so the model and the world it is scored against agree on
 * what "time" means.
 */
function windowTradingDays(sc: Scenario) {
  // Integrated, not flat. Nyx measures the remaining window by walking it and
  // summing each hour's weight; if the world generated its latent path on a
  // different clock the backtest would be scoring the model against a straw man.
  // (It briefly did: the flat version undercounted the Monday pre-market hours, so
  // sigma looked 13 points over-covered against a truth that had been shrunk.)
  return informationHoursAhead(Date.parse(sc.startUTC), sc.windowHours) / 6.5;
}

function buildPaths(sc: Scenario) {
  const hit = cache.get(sc.id);
  if (hit) return hit;
  const r = rng(sc.seed);
  const tDays = windowTradingDays(sc);

  const factorPath = {} as Record<FactorId, number[]>;
  for (const f of FACTORS) {
    const vol = FACTOR_VOL[f.id] * sc.volMult;
    // Convert annual vol to per-step over the window (252 trading days a year).
    const stepVol = vol * Math.sqrt(tDays / 252 / GRID);
    const drift = (f.id === 'MKT' ? sc.marketShock : f.id === 'CRYPTO' ? sc.marketShock * 2.1 : 0) / GRID;
    const path = [0];
    for (let i = 1; i <= GRID; i++) path.push(path[i - 1] + drift + stepVol * gauss(r));
    factorPath[f.id] = path;
  }

  const idioPath: Record<string, number[]> = {};
  const tapeNoise: Record<string, number[]> = {};
  for (const a of UNIVERSE) {
    const stepVol = a.idioVol * sc.volMult * Math.sqrt(tDays / 252 / GRID);
    const p = [0];
    for (let i = 1; i <= GRID; i++) p.push(p[i - 1] + stepVol * gauss(r));
    idioPath[a.sym] = p;

    // Thin-book dislocation. While the cash equity is shut nobody can arbitrage the
    // token against it, so the last trade does not snap back to fair, it wanders,
    // slowly, and can sit two or three percent away for hours. Highly persistent
    // (AR 0.95) rather than noisy, which is what makes it dangerous: it looks like
    // a stable price right up until the auction disagrees with it.
    const tn = [0];
    const kick = 0.006 * (a.idioVol / 0.25);
    for (let i = 1; i <= GRID; i++) {
      tn.push(tn[i - 1] * 0.95 + kick * gauss(r) * (r() < 0.12 ? 3.2 : 1));
    }
    tapeNoise[a.sym] = tn;
  }

  const built = { factorPath, idioPath, tapeNoise };
  cache.set(sc.id, built);
  return built;
}

function sample(path: number[], u: number) {
  const x = Math.max(0, Math.min(1, u)) * GRID;
  const i = Math.min(GRID - 1, Math.floor(x));
  const frac = x - i;
  return path[i] + (path[i + 1] - path[i]) * frac;
}

export interface WorldState {
  /** 0..1 through the closed window. */
  u: number;
  hoursClosed: number;
  factors: FactorReturns;
  noise: FactorNoise;
  /** Per-symbol latent truth return since close. Nyx must not read this. */
  truth: Record<string, number>;
  tape: Record<string, TapeSignal>;
}

export function worldAt(sc: Scenario, hoursClosed: number): WorldState {
  const { factorPath, idioPath, tapeNoise } = buildPaths(sc);
  const u = Math.max(0, Math.min(1, hoursClosed / sc.windowHours));
  const r = rng(sc.seed ^ Math.floor(hoursClosed * 1000));

  const factors = {} as FactorReturns;
  const noise = {} as FactorNoise;
  for (const f of FACTORS) {
    const trueLevel = sample(factorPath[f.id], u);
    // Reading noise shrinks as more independent venues wake up (Asia, then Europe).
    const n = FACTOR_NOISE[f.id] * (1.4 - 0.6 * u);
    factors[f.id] = trueLevel + n * gauss(r);
    noise[f.id] = n;
  }

  const truth: Record<string, number> = {};
  const tape: Record<string, TapeSignal> = {};
  for (const a of UNIVERSE) {
    let t = 0;
    for (const f of FACTORS) t += a.beta[f.id] * sample(factorPath[f.id], u);
    t += sample(idioPath[a.sym], u);
    truth[a.sym] = t;

    // 24/7 volume is real but small, and it dries up in the middle of the night.
    const clockFactor = 0.35 + 0.65 * Math.abs(Math.sin(Math.PI * u));
    const volume = a.depth * 0.18 * clockFactor * u;
    tape[a.sym] = {
      impliedReturn: t + sample(tapeNoise[a.sym], u),
      volume,
    };
  }

  return { u, hoursClosed, factors, noise, truth, tape };
}

/** Wall-clock instant for a given point in the closed window. */
export function instantAt(sc: Scenario, hoursClosed: number): Date {
  return new Date(Date.parse(sc.startUTC) + hoursClosed * 3_600_000);
}

/** The official opening print: latent truth at the end of the window plus the auction jump. */
export function openingPrint(sc: Scenario, asset: Asset): number {
  const w = worldAt(sc, sc.windowHours);
  const jump = sc.openJumps[asset.sym] ?? 0;
  return asset.close * Math.exp(w.truth[asset.sym] + jump);
}
