/**
 * Nyx, the fair-value engine.
 *
 * When the NYSE is shut there is no price. There is only evidence. Nyx turns the
 * evidence that IS observable at 03:00 on a Sunday into two numbers:
 *
 *   mid   — the conditional expectation of the reopening print
 *   sigma, how wrong that is allowed to be
 *
 * sigma is the actual product. Every existing oracle publishes a point and lets
 * the protocol downstream pretend it is exact.
 */

import type { Asset, FactorId } from '../data/universe';
import { FACTORS } from '../data/universe';
import { informationHoursAhead, type SessionState } from './market';

/** Observed return of each always-on factor since the last ET close, decimal. */
export type FactorReturns = Record<FactorId, number>;

/** Noise (1 sigma) on each factor's own reading. Thin overnight tapes are noisy. */
export type FactorNoise = Record<FactorId, number>;

export interface TapeSignal {
  /** Volume-weighted signed order flow on the token itself, as an implied return. */
  impliedReturn: number;
  /** USDC traded on-chain since close. Low volume => we trust it less. */
  volume: number;
}

export interface Contribution {
  id: FactorId | 'TAPE';
  name: string;
  /** Factor move since close, decimal. */
  move: number;
  /** Loading applied. */
  beta: number;
  /** beta * move, the contribution to the estimated return. */
  contrib: number;
  /** Contribution to variance. */
  varContrib: number;
}

export interface Mark {
  sym: string;
  close: number;
  /** Fair value estimate, USD. */
  mid: number;
  /** Estimated return since close, decimal. */
  ret: number;
  /** 1-sigma uncertainty as a fraction of mid. */
  sigma: number;
  /** 1-sigma in dollars. */
  sigmaAbs: number;
  /** 0..1. High when factors agree, time is short, no event pending. */
  confidence: number;
  /** Band edges at 1 sigma. */
  lo: number;
  hi: number;
  contributions: Contribution[];
  /** Diagnostic breakdown of the variance budget. */
  variance: {
    idio: number;
    factorNoise: number;
    future: number;
    disagreement: number;
    event: number;
    total: number;
  };
  infoHours: number;
}

/**
 * How noisy the on-chain tape is as an estimate of fair value.
 *
 * A 24/7 token does print overnight. But nobody can arbitrage those prints against
 * the cash equity while the equity is shut, so the book is free to sit two or three
 * percent away from fair for hours at a time. Its noise scales with how little
 * money is standing behind it.
 */
function tapeVariance(volume: number, depth: number, idioVol: number): number {
  if (volume <= 0) return Number.POSITIVE_INFINITY;
  const thinness = Math.sqrt(depth / Math.max(volume, depth * 0.002));
  const sd = 0.0072 * thinness * (idioVol / 0.25);
  return sd * sd;
}

export function computeMark(
  asset: Asset,
  session: SessionState,
  factors: FactorReturns,
  noise: FactorNoise,
  tape: TapeSignal,
): Mark {
  // Integrate the elapsed window too, for the same reason the forward one is
  // integrated: a flat weight taken from whatever session happens to be current
  // misprices every hour that isn't in it.
  const infoHours = Math.max(0.05, informationHoursAhead(
    session.nowMs - session.hoursClosed * 3_600_000, session.hoursClosed));
  // Fraction of a 6.5-hour trading day of information that has accrued.
  const tDays = infoHours / 6.5;

  // ---- Point estimate -----------------------------------------------------
  const contributions: Contribution[] = [];
  let ret = 0;

  for (const f of FACTORS) {
    const beta = asset.beta[f.id];
    const move = factors[f.id];
    const contrib = beta * move;
    ret += contrib;
    contributions.push({
      id: f.id, name: f.name, move, beta, contrib,
      varContrib: (beta * noise[f.id]) ** 2,
    });
  }

  // ---- Fuse the two witnesses by precision -------------------------------
  // The factor model and the on-chain tape are independent, noisy estimates of the
  // same latent value. The minimum-variance combination weights each by its own
  // precision. This is why Noctis beats both of its inputs rather than one of them.
  const tDaysFrac = tDays / 252;
  const varModel =
    (asset.idioVol ** 2) * tDaysFrac +
    contributions.reduce((s, c) => s + c.varContrib, 0);
  const varTape = tapeVariance(tape.volume, asset.depth, asset.idioVol);

  const w = Number.isFinite(varTape)
    ? Math.min(0.95, varModel / (varModel + varTape))
    : 0;

  const tapeContrib = w * (tape.impliedReturn - ret);
  const modelRet = ret;
  ret += tapeContrib;
  contributions.push({
    id: 'TAPE', name: 'On-chain tape', move: tape.impliedReturn,
    beta: w, contrib: tapeContrib,
    varContrib: 0,
  });

  const mid = asset.close * Math.exp(ret);

  // ---- Variance budget ----------------------------------------------------
  // 1 & 2. The fused estimate's variance: harmonic combination of the two sources.
  //        Split back out for the UI so a user can see which witness carried the day.
  const fused = Number.isFinite(varTape)
    ? (varModel * varTape) / (varModel + varTape)
    : varModel;
  const idioShare = varModel > 0 ? ((asset.idioVol ** 2) * tDaysFrac) / varModel : 1;
  const idio = fused * idioShare;
  const factorNoise = fused * (1 - idioShare);

  // 3. Time still to run.
  //    The quantity being estimated is not the value NOW, it is the print at the
  //    opening auction. Even a perfect read of the present leaves the whole
  //    remaining path unaccounted for. Omitting this is why a naive weekend model
  //    blows through its own band on Monday: it was answering the wrong question.
  // While the primary venue is open there is no gap to forecast, the thing we are
  // predicting is printing right now, so the remaining path contributes nothing.
  // Otherwise integrate the weight across the window rather than assuming the
  // current session's weight holds all the way to the bell.
  const futureHours = session.isOpen
    ? 0
    : informationHoursAhead(session.nowMs, Math.max(0, session.hoursToOpen ?? 0));
  const future = (asset.totalVol ** 2) * (futureHours / 6.5 / 252);

  // 4. Disagreement: the two witnesses telling different stories is itself
  //    information, about how little we know.
  const gap = tape.volume > 0 ? tape.impliedReturn - modelRet : 0;
  const disagreement = (gap * 0.45) ** 2;

  // 5. Event risk. Earnings tonight is a discontinuity no factor model sees coming.
  //
  // `earningsInDays < 0` means "we have no calendar". That is NOT the same as "no
  // earnings tonight", and treating it as zero would be the exact mistake this
  // model makes a point of not making elsewhere. Live mode has no free earnings
  // feed, so it carries the unconditional risk instead: a name reports ~4 times a
  // year over ~252 sessions, so about a 1.6% chance on any given night, blended
  // against the jump variance an actual report produces.
  const P_REPORTS_TONIGHT = 4 / 252;
  const event =
    asset.earningsInDays < 0 ? P_REPORTS_TONIGHT * (0.075 ** 2) :
    asset.earningsInDays === 0 ? (0.075) ** 2 :
    asset.earningsInDays <= 1 ? (0.030) ** 2 :
    asset.earningsInDays <= 3 ? (0.012) ** 2 : 0;

  const total = idio + factorNoise + future + disagreement + event;
  const sigma = Math.sqrt(total);
  const sigmaAbs = mid * sigma;

  // Confidence: a readable 0..1 for the UI. 4% sigma is our "we know nothing" anchor.
  const confidence = Math.max(0.02, Math.min(0.99, 1 - sigma / 0.04));

  return {
    sym: asset.sym,
    close: asset.close,
    mid, ret, sigma, sigmaAbs,
    confidence,
    lo: mid - sigmaAbs,
    hi: mid + sigmaAbs,
    contributions,
    variance: { idio, factorNoise, future, disagreement, event, total },
    infoHours,
  };
}

/**
 * What the naive alternatives say, for the side-by-side that makes the case.
 */
export interface Baselines {
  lastClose: number;
  /** Pyth-style: the feed is simply marked CLOSED and returns the stale close. */
  staleOracle: { price: number; status: 'CLOSED' | 'TRADING' };
  /** The thin on-chain book: last trade, and the spread you would actually cross. */
  thinBook: { last: number; bid: number; ask: number; spreadBps: number };
}

export function baselines(asset: Asset, tape: TapeSignal, session: SessionState): Baselines {
  const last = asset.close * Math.exp(tape.impliedReturn);
  // Spread on a 24/7 book widens roughly with how long the real market has been shut.
  const spreadFrac =
    0.0008 + 0.0016 * Math.min(4, session.hoursClosed / 12) * (asset.idioVol / 0.25);
  return {
    lastClose: asset.close,
    staleOracle: {
      price: asset.close,
      status: session.isOpen ? 'TRADING' : 'CLOSED',
    },
    thinBook: {
      last,
      bid: last * (1 - spreadFrac / 2),
      ask: last * (1 + spreadFrac / 2),
      spreadBps: spreadFrac * 10_000,
    },
  };
}
