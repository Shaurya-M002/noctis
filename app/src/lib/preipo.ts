/**
 * The pre-IPO NAV gap, measured.
 *
 * An xStock has a closing bell and a reopening auction, so Noctis forecasts a
 * specific future event. Pre-IPO tokens have neither. What they have instead is a
 * published mark and a token price that disagree, permanently, by amounts that
 * dwarf anything in the equity complex.
 *
 * So the object of interest is not "what will the auction print" but "how far will
 * this gap move". That is a smaller claim and an honest one: we are modelling
 * something we can actually observe, sample and score.
 *
 * Every number here comes from a feed or from our own recorded history. There is no
 * factor model for a private company and we do not pretend to have one.
 */

import { PREIPO } from '../data/preipo';
import type { SourceReport } from './feeds';

const JUP = 'https://lite-api.jup.ag/price/v3';
const TESSERA = 'https://rest-api.tessera.pe/v1/public/token-details';
/** Our own committed log, read back from GitHub. See the note in `fetchHistory`. */
const HISTORY =
  'https://raw.githubusercontent.com/Shaurya-M002/noctis/main/forecasts/prestocks.jsonl';

export interface PreIPOQuote {
  sym: string;
  company: string;
  group: string;
  mint: string;
  /** Issuer's NAV mark, per token. */
  mark: number;
  /** On-chain price. */
  token: number;
  /** ln(token / mark). The thing we insure. */
  gap: number;
  liquidity: number;
  change24h: number;
  /** Token-2022 ScaledUiAmount, and its next scheduled change if any. */
  uiMultiplier: number | null;
  nextMultiplier: number | null;
  nextMultiplierAt: string | null;
  /** A rival issuer's implied valuation for the same company, where one exists. */
  rivalValuation: number | null;
  markValuation: number | null;
}

export interface GapStats {
  sym: string;
  /** Samples backing these numbers. Shown, always. */
  n: number;
  hours: number;
  /** Per-sample stdev of d(gap). The gap's own volatility, not the token's. */
  stepSd: number;
  meanGap: number;
  minGap: number;
  maxGap: number;
  /** Per-sample stdev of log returns, mark and token side by side. */
  markVel: number;
  tokenVel: number;
  /** Dispersion of the gap LEVEL — the stationary width the gap oscillates in. */
  levelSd: number;
  /** Distinct token prices seen. A low count against many samples means stale. */
  distinctTokens: number;
}

export interface PreIPOSnapshot {
  fetchedAt: number;
  quotes: PreIPOQuote[];
  /** Median gap across the complex — the part that is not name-specific. */
  basis: number;
  stats: Record<string, GapStats>;
  historySamples: number;
  historyHours: number;
  sources: SourceReport[];
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

async function getJSON(url: string, ms = 12_000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/**
 * Read back the log this repo has been committing every five minutes.
 *
 * PreStocks exposes no price history and neither does Tessera — I checked every
 * plausible path. So the only way to say anything calibrated about how this gap
 * behaves is to have been recording it, and the only way to get that history into a
 * static browser app is to read our own committed file. raw.githubusercontent.com
 * is CORS-open and always current, so this needs no rebuild and no server.
 */
async function fetchHistory(): Promise<{ rows: any[]; report: SourceReport }> {
  const t0 = Date.now();
  try {
    const r = await fetch(HISTORY, { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const rows = (await r.text()).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    return {
      rows,
      report: {
        name: 'Noctis · recorded gap history', url: HISTORY, status: 'ok',
        detail: `${rows.length} samples committed to git`, ms: Date.now() - t0,
      },
    };
  } catch (e) {
    return {
      rows: [],
      report: {
        name: 'Noctis · recorded gap history', url: HISTORY, status: 'degraded',
        detail: `${e instanceof Error ? e.message : e} — no calibration available`,
        ms: Date.now() - t0,
      },
    };
  }
}

function statsFrom(rows: any[]): { stats: Record<string, GapStats>; hours: number } {
  const stats: Record<string, GapStats> = {};
  if (rows.length < 2) return { stats, hours: 0 };
  const hours =
    (Date.parse(rows[rows.length - 1].at) - Date.parse(rows[0].at)) / 3_600_000;

  for (const p of PREIPO) {
    const gaps: number[] = [];
    const marks: number[] = [];
    const tokens: number[] = [];
    for (const r of rows) {
      const n = r.names?.find((x: any) => x.sym === p.sym);
      if (!n?.mark || !n?.token) continue;
      gaps.push(Math.log(n.token / n.mark));
      marks.push(n.mark);
      tokens.push(n.token);
    }
    if (gaps.length < 3) continue;
    const ret = (xs: number[]) => xs.slice(1).map((v, i) => Math.log(v / xs[i]));
    stats[p.sym] = {
      sym: p.sym,
      n: gaps.length,
      hours,
      stepSd: sd(ret(gaps.map((g) => Math.exp(g)))),
      meanGap: gaps.reduce((a, b) => a + b, 0) / gaps.length,
      levelSd: sd(gaps),
      minGap: Math.min(...gaps),
      maxGap: Math.max(...gaps),
      markVel: sd(ret(marks)),
      tokenVel: sd(ret(tokens)),
      distinctTokens: new Set(tokens).size,
    };
  }
  return { stats, hours };
}

export async function fetchPreIPO(): Promise<PreIPOSnapshot> {
  const t0 = Date.now();
  const ids = PREIPO.map((p) => p.mint).join(',');

  const [jup, hist] = await Promise.all([
    getJSON(`${JUP}?ids=${ids}`).catch(() => ({})),
    fetchHistory(),
  ]);

  /**
   * The rival issuer's marks come out of our own recorded log, not a live call.
   *
   * Tessera's API sends no `access-control-allow-origin`, so a browser cannot read
   * it at all — and this app has no server to proxy through. The five-minute
   * recorder does have one (it runs in node), and it has been capturing Tessera
   * alongside everything else. So the committed log is not only the calibration
   * history, it is the only route cross-issuer data has into a static page.
   */
  const rivalVal: Record<string, number> = {};
  const last = hist.rows[hist.rows.length - 1];
  for (const n of last?.names ?? []) {
    if (n.rivalValuation) rivalVal[String(n.sym).toLowerCase()] = n.rivalValuation;
  }

  const quotes: PreIPOQuote[] = [];
  for (const p of PREIPO) {
    const j = (jup as any)?.[p.mint];
    const token = Number(j?.usdPrice ?? 0);
    const mark = Number(j?.stockData?.price ?? 0);
    if (!token || !mark) continue;
    quotes.push({
      sym: p.sym, company: p.company, group: p.group, mint: p.mint,
      mark, token, gap: Math.log(token / mark),
      liquidity: Number(j?.liquidity ?? 0),
      change24h: Number(j?.priceChange24h ?? 0) / 100,
      uiMultiplier: j?.scaledUiConfig?.multiplier ?? null,
      nextMultiplier: j?.scaledUiConfig?.newMultiplier ?? null,
      nextMultiplierAt: j?.scaledUiConfig?.newMultiplierEffectiveAt ?? null,
      rivalValuation: rivalVal[p.sym.toLowerCase()] ?? null,
      markValuation: Number(j?.stockData?.mcap ?? 0) || null,
    });
  }

  const { stats, hours } = statsFrom(hist.rows);

  return {
    fetchedAt: Date.now(),
    quotes,
    basis: median(quotes.map((q) => q.gap)),
    stats,
    historySamples: hist.rows.length,
    historyHours: hours,
    sources: [
      {
        name: 'Jupiter · PreStocks', url: JUP,
        status: quotes.length ? 'ok' : 'down',
        detail: `${quotes.length}/${PREIPO.length} names · mark + on-chain in one call`,
        ms: Date.now() - t0,
      },
      {
        name: 'Tessera · rival marks', url: `${TESSERA} (via the recorded log — no CORS)`,
        status: Object.keys(rivalVal).length ? 'ok' : 'degraded',
        detail: Object.keys(rivalVal).length
          ? `${Object.keys(rivalVal).length} overlapping companies, recorded server-side`
          : 'not in the log yet',
        ms: Date.now() - t0,
      },
      hist.report,
    ],
  };
}

/**
 * Sigma for the NAV gap at a horizon.
 *
 * The obvious thing is to take the per-sample step deviation and scale it by
 * sqrt(t). Doing that here is badly wrong, and it is worth saying why because the
 * first version of this function did it and quoted 25% sigma on a seven-day cover.
 *
 * Five-minute samples of a thin AMM are dominated by bid-ask bounce, not by
 * information. Random-walking that noise out to a week compounds a microstructure
 * artefact into a number with no meaning. And the gap is plainly NOT a random walk:
 * it oscillates inside a band, because the token is tethered to a mark that barely
 * moves. A mean-reverting series does not spread like sqrt(t) — it converges on its
 * stationary width.
 *
 * So the estimate is bounded by that stationary width, taken from the dispersion of
 * the observed gap LEVELS rather than the steps, and widened because a few hours
 * cannot have seen the full range. Short horizons still get the diffusion reading
 * where it is the smaller of the two.
 *
 * This is a bound, not a fit. With days of log we would fit an Ornstein-Uhlenbeck
 * and use its actual reversion speed. The UI shows the sample count so the
 * distinction is never hidden.
 */
export type SigmaBasis = 'diffusion' | 'stationary' | 'floor' | 'none';

/** Our window is short, so the range we have seen understates the true one. */
const WIDEN = 3;
/** Below this we would be claiming precision about an asset with no exchange. */
const FLOOR = 0.02;
const CAP = 0.35;

export function gapSigma(s: GapStats | undefined, horizonHours: number): {
  sigma: number; basis: SigmaBasis; confident: boolean;
  diffusion: number; stationary: number;
} {
  if (!s || s.n < 3) {
    return { sigma: 0.05, basis: 'none', confident: false, diffusion: 0, stationary: 0 };
  }
  const perSample = s.hours / Math.max(1, s.n - 1);
  const steps = Math.max(1, horizonHours / Math.max(perSample, 1e-6));
  const diffusion = s.stepSd * Math.sqrt(steps);
  const stationary = s.levelSd * WIDEN;

  const bounded = Math.min(diffusion, stationary);
  const sigma = Math.min(CAP, Math.max(FLOOR, bounded));

  const basis: SigmaBasis =
    sigma === FLOOR && bounded < FLOOR ? 'floor'
      : bounded === stationary ? 'stationary' : 'diffusion';

  return {
    sigma, basis, diffusion, stationary,
    // Hours of five-minute samples show structure. A distribution needs days.
    confident: s.n >= 500 && s.hours >= 48,
  };
}
