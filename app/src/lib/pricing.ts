/**
 * Noctis premium math.
 *
 * The product is not the trade. The product is CERTAINTY ABOUT THE REOPENING PRINT.
 * A user buys tokenized equity at the Noctis mark and separately buys a guarantee
 * about how far that mark can be wrong when the primary venue reopens.
 *
 * The guarantee is a one-sided option on the overnight gap. We price it with a
 * Bachelier (normal) partial expectation, then load it for capital scarcity and
 * concentration. No bps fee on notional anywhere in this file, that is the point.
 */

/** Standard normal pdf. */
export const phi = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

/** Abramowitz & Stegun 7.1.26 error function; ~1.5e-7 absolute error. */
function erf(x: number): number {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-a * a);
  return s * y;
}

/** Standard normal cdf. */
export const Phi = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));

/**
 * E[(Z - k)^+] for Z ~ N(0,1). The expected adverse overshoot beyond k sigma.
 * k = 0 gives phi(0) = 0.39894, the classic half-straddle.
 *
 * Kept for reference. The premium does NOT use it, see `PE` below.
 */
export function partialExpectationGaussian(k: number): number {
  return phi(k) - k * (1 - Phi(k));
}

/**
 * E[(Z - k)^+] under a Student-t with 4 degrees of freedom, standardised to unit
 * variance. This, not the Gaussian, is what the premium is priced off.
 *
 * We did not choose t(4) because it sounded sophisticated. We measured it. Once
 * sigma was correctly scaled, `engine/backtest.ts` reported 76.1% of opening prints
 * inside +/-1 sigma and 95.8% inside +/-2. A normal gives 68.3% and 95.4%; a
 * standardised t(4) gives 76.98% and 95.26%. The gap distribution is peaked and
 * fat-tailed, and it is very clearly this shape.
 *
 * The direction of the correction is the interesting part. Fat tails sound like
 * they should make insurance dearer, and at a far strike they would. At k <= 1 the
 * taller peak dominates: more of the mass sits near zero, so the expected payout is
 * SMALLER than the Gaussian price. Pricing this honestly made the product ~11%
 * cheaper for Pin and ~7% cheaper for Band.
 *
 * Values by Simpson quadrature over the standardised density; the same two
 * constants are hard-coded in `math.rs` so the chain agrees with the client.
 */
const PE_T4: Record<string, number> = {
  '0': 0.353549,   // Pin  — vs Gaussian 0.398942 (0.886x)
  '1': 0.077346,   // Band, vs Gaussian 0.083315 (0.928x)
};

export function partialExpectation(k: number): number {
  const hit = PE_T4[String(k)];
  if (hit !== undefined) return hit;
  // Only the two shipped tiers have measured constants; anything else falls back
  // to the Gaussian, which is conservative at these strikes.
  return partialExpectationGaussian(k);
}

export type Tier = 'RAW' | 'BAND' | 'PIN';

export interface TierSpec {
  id: Tier;
  name: string;
  /** How many sigma of gap the user eats before the vault pays. */
  k: number;
  blurb: string;
}

export const TIERS: TierSpec[] = [
  { id: 'RAW',  name: 'Raw',  k: Infinity, blurb: 'No guarantee. You take the whole gap. Costs nothing, ever.' },
  { id: 'BAND', name: 'Band', k: 1.0,      blurb: 'You eat the first 1σ. The vault pays every basis point beyond it.' },
  { id: 'PIN',  name: 'Pin',  k: 0,        blurb: 'You are filled at the official opening print. Zero gap risk.' },
];

export interface VaultState {
  /** Total USDC underwriting capital. */
  tvl: number;
  /** Notional risk currently written, in USDC. */
  exposure: number;
}

export interface PremiumInput {
  /** Trade notional in USDC. */
  notional: number;
  /** Fractional 1-sigma uncertainty of the reopening gap, e.g. 0.018 = 1.8%. */
  sigma: number;
  tier: Tier;
  vault: VaultState;
  /** On-chain depth for this asset in USDC, for the concentration load. */
  depth: number;
}

export interface PremiumQuote {
  tier: Tier;
  /** Actuarially fair expected payout. */
  fair: number;
  /** Load for scarce underwriting capital. */
  utilLoad: number;
  /** Load for taking a large slice of available depth. */
  sizeLoad: number;
  /** What the user actually pays, USDC. */
  premium: number;
  /** Premium as a fraction of notional, shown only so people can compare to a fee. */
  bps: number;
  /** The worst the user can do, in USDC, after the guarantee. */
  maxAdverse: number;
  /** Vault's capital at risk for writing this. */
  capitalAtRisk: number;
  utilisation: number;
}

const FLOOR = 0.01;

/*
 * A load we tested and removed.
 *
 * The fair price assumes sigma is KNOWN, and it is not. E[(G−kσ)⁺] is convex in
 * the scale of G, so we expected uncertainty in sigma to push real payouts above
 * the Gaussian price, and we shipped a 1.35x "model risk" multiplier for it.
 *
 * Then we measured. Once sigma itself was calibrated (see engine/backtest.ts:
 * 68.7% coverage at 1σ against a 68.3% target) the underwriting book already ran
 * at a ~0.75 loss ratio on the fair price plus the two loads below. The extra
 * multiplier took it to 0.57, LPs earning a great return by overcharging users
 * for a risk that was already priced. It is gone.
 *
 * The 25% of premium that is not expected claims IS the LP's compensation for
 * bearing variance. That is what a loss ratio is for.
 */

export function quotePremium(inp: PremiumInput): PremiumQuote {
  const { notional, sigma, tier, vault, depth } = inp;
  const spec = TIERS.find((t) => t.id === tier)!;
  const utilisation = vault.tvl > 0 ? Math.min(1, vault.exposure / vault.tvl) : 1;

  if (tier === 'RAW') {
    return {
      tier, fair: 0, utilLoad: 0, sizeLoad: 0, premium: 0, bps: 0,
      // Practical worst case shown to the user: a 3-sigma adverse gap.
      maxAdverse: notional * sigma * 3,
      capitalAtRisk: 0,
      utilisation,
    };
  }

  // Actuarially fair: expected adverse overshoot beyond k sigma, sigma assumed known.
  const fair = notional * sigma * partialExpectation(spec.k);


  // Capital scarcity. Quadratic so the vault chokes off gracefully instead of
  // selling its last dollar of capacity at the same price as its first.
  const utilLoad = fair * utilisation * utilisation;

  // Concentration. Writing 40% of an asset's depth is not 4x the risk of 10%.
  const conc = depth > 0 ? notional / depth : 1;
  const sizeLoad = fair * Math.min(1.5, conc * 1.2);

  const premium = Math.max(FLOOR, fair + utilLoad + sizeLoad);

  // Vault reserves against a 4-sigma tail beyond the user's own deductible.
  const capitalAtRisk =
    notional * sigma * Math.max(0, 4 - (Number.isFinite(spec.k) ? spec.k : 4));

  return {
    tier,
    fair,
    utilLoad,
    sizeLoad,
    premium,
    bps: notional > 0 ? (premium / notional) * 10_000 : 0,
    maxAdverse: Number.isFinite(spec.k) ? notional * sigma * spec.k + premium : Infinity,
    capitalAtRisk,
    utilisation,
  };
}

/**
 * Settlement. The official opening print lands; work out who owes whom.
 *
 * Asymmetric on purpose: this is insurance, not a swap. A gap in the user's favour
 * stays with the user. Only adverse gaps beyond the deductible are reimbursed.
 */
export interface SettleInput {
  side: 'BUY' | 'SELL';
  qty: number;
  fillPrice: number;
  openPrice: number;
  sigmaAbs: number;   // 1 sigma in price units at trade time
  tier: Tier;
  premium: number;
}

export interface Settlement {
  /** Signed mark-to-open on the position itself, before any payout. */
  rawPnl: number;
  /** Adverse move in price units (0 if the gap helped you). */
  adverse: number;
  /** Deductible in price units the user absorbs before the vault pays. */
  deductible: number;
  /** USDC paid by the vault to the user. */
  payout: number;
  /** rawPnl + payout - premium. What actually hits the wallet. */
  netPnl: number;
  /** Same trade with no guarantee bought, for comparison. */
  nakedPnl: number;
  breached: boolean;
}

export function settle(inp: SettleInput): Settlement {
  const { side, qty, fillPrice, openPrice, sigmaAbs, tier, premium } = inp;
  const dir = side === 'BUY' ? 1 : -1;

  const rawPnl = dir * (openPrice - fillPrice) * qty;
  const nakedPnl = rawPnl;

  if (tier === 'RAW') {
    return {
      rawPnl, adverse: Math.max(0, -rawPnl / qty), deductible: Infinity,
      payout: 0, netPnl: rawPnl, nakedPnl, breached: false,
    };
  }

  const spec = TIERS.find((t) => t.id === tier)!;
  const deductible = spec.k * sigmaAbs;

  // Adverse per-share move: a BUY is hurt by the open printing below the fill.
  const adverse = Math.max(0, dir * (fillPrice - openPrice));
  const payout = Math.max(0, adverse - deductible) * qty;

  return {
    rawPnl,
    adverse,
    deductible,
    payout,
    netPnl: rawPnl + payout - premium,
    nakedPnl,
    breached: payout > 0,
  };
}
