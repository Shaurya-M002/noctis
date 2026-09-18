/**
 * Live data.
 *
 * Everything here is a public, keyless endpoint, fetched straight from the
 * browser. No server, no API key, nothing you cannot curl yourself:
 *
 *   Jupiter      lite-api.jup.ag        on-chain price + the last official
 *                                       reference price for each xStock
 *   DexScreener  api.dexscreener.com    real 24h volume, liquidity, and the
 *                                       per-venue prints that show how far apart
 *                                       the "same" token trades
 *   Coinbase     api.exchange.coinbase  hourly candles, so crypto returns are
 *                                       measured from the actual last ET close
 *                                       rather than a rolling 24h window
 *
 * What is deliberately NOT faked: if a factor has no free always-on source, it is
 * reported as unavailable and Nyx widens sigma accordingly. A missing signal
 * should make the model less confident, not silently read as zero.
 */

import type { FactorId } from '../data/universe';
import { UNIVERSE } from '../data/universe';
import type { FactorNoise, FactorReturns } from './nyx';

const JUP = 'https://lite-api.jup.ag/price/v3';
const DEX = 'https://api.dexscreener.com';
const CB = 'https://api.exchange.coinbase.com';

/** SPYx is the market proxy; it is in UNIVERSE but called out here for clarity. */
const MKT_SYM = 'SPYx';
const TECH = ['AAPLx', 'NVDAx', 'METAx', 'GOOGLx'];

export type FeedStatus = 'ok' | 'degraded' | 'down';

export interface SourceReport {
  name: string;
  url: string;
  status: FeedStatus;
  detail: string;
  ms: number;
}

export interface Venue {
  dex: string;
  pair: string;
  price: number;
  liquidity: number;
  volume24h: number;
}

export interface LiveAsset {
  sym: string;
  mint: string;
  /** Current on-chain price, USD. */
  onChain: number;
  /** Last official reference price of the underlying equity, USD. */
  reference: number;
  referenceAt: number | null;
  /** ln(onChain / reference), the raw dislocation, basis and signal mixed. */
  dislocation: number;
  liquidity: number;
  volume24h: number;
  change24h: number;
}

export interface LiveSnapshot {
  fetchedAt: number;
  assets: Record<string, LiveAsset>;
  /**
   * The complex-wide basis: the median dislocation across every xStock.
   *
   * On a weekend the whole complex trades away from NAV together, because nobody
   * wants to warehouse gap risk until Monday. That common move is a LIQUIDITY
   * PREMIUM, not a forecast, and reading it as one would make Nyx bearish on every
   * name at once every Saturday. We strip it out and price the cross-section.
   */
  basis: number;
  crypto: { btc: number | null; eth: number | null; sinceClose: number | null };
  /** Factors, computed leave-one-out per asset. See `factorsFor`. */
  factors: FactorReturns;
  noise: FactorNoise;
  /** Which factors we genuinely have a live source for. */
  available: Record<FactorId, boolean>;
  sources: SourceReport[];
}

async function timed<T>(
  name: string, url: string, fn: () => Promise<T>,
): Promise<{ value: T | null; report: SourceReport }> {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { value, report: { name, url, status: 'ok', detail: 'live', ms: Date.now() - t0 } };
  } catch (e) {
    return {
      value: null,
      report: {
        name, url, status: 'down',
        detail: e instanceof Error ? e.message : String(e),
        ms: Date.now() - t0,
      },
    };
  }
}

async function getJSON(url: string, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Return of a Coinbase product measured from a specific instant to now, using
 * hourly candles. A rolling 24h change is the wrong window: at 10:00 ET on a
 * Sunday it spans half of Saturday, which the equity market has already been
 * closed through.
 */
async function returnSince(product: string, sinceMs: number): Promise<number> {
  const rows: number[][] = await getJSON(
    `${CB}/products/${product}/candles?granularity=3600`);
  if (!Array.isArray(rows) || !rows.length) throw new Error('no candles');
  // [ time, low, high, open, close, volume ], newest first.
  const now = rows[0][4];
  const target = Math.floor(sinceMs / 1000);
  let best = rows[rows.length - 1];
  for (const r of rows) {
    if (Math.abs(r[0] - target) < Math.abs(best[0] - target)) best = r;
  }
  if (!now || !best[4]) throw new Error('bad candle');
  return Math.log(now / best[4]);
}

/** Every xStock we mark, priced on-chain and against its official reference. */
async function fetchAssets(): Promise<Record<string, LiveAsset>> {
  const mints = UNIVERSE.map((a) => a.mint);
  const [jup, dex] = await Promise.all([
    getJSON(`${JUP}?ids=${mints.join(',')}`),
    getJSON(`${DEX}/tokens/v1/solana/${mints.join(',')}`).catch(() => []),
  ]);

  const vol: Record<string, { v: number; l: number }> = {};
  if (Array.isArray(dex)) {
    const ours = new Set(mints);
    for (const p of dex) {
      const mint = p?.baseToken?.address;
      if (!mint || !ours.has(mint)) continue;
      const v = Number(p?.volume?.h24 ?? 0);
      const l = Number(p?.liquidity?.usd ?? 0);
      const cur = vol[mint] ?? { v: 0, l: 0 };
      vol[mint] = { v: cur.v + v, l: cur.l + l };
    }
  }

  const out: Record<string, LiveAsset> = {};
  for (const a of UNIVERSE) {
    const j = jup?.[a.mint];
    if (!j?.usdPrice) continue;
    const onChain = Number(j.usdPrice);
    const reference = Number(j?.stockData?.price ?? 0) || onChain;
    const refAt = j?.stockData?.updatedAt ? Date.parse(j.stockData.updatedAt) : null;
    out[a.sym] = {
      sym: a.sym,
      mint: a.mint,
      onChain,
      reference,
      referenceAt: Number.isFinite(refAt as number) ? (refAt as number) : null,
      dislocation: Math.log(onChain / reference),
      liquidity: Number(j.liquidity ?? vol[a.mint]?.l ?? 0),
      volume24h: vol[a.mint]?.v ?? 0,
      change24h: Number(j.priceChange24h ?? 0) / 100,
    };
  }
  return out;
}

/**
 * Every venue currently printing this token.
 *
 * This is the single most persuasive live number in the app: the same token can
 * print several percent apart across two DEXs at the same moment, because with
 * the cash equity shut there is no arbitrage to close it.
 */
export async function fetchVenues(mint: string): Promise<Venue[]> {
  const d = await getJSON(`${DEX}/latest/dex/tokens/${mint}`);
  const pairs: Venue[] = (d?.pairs ?? [])
    // Only pools where this mint is the BASE token. In a TREE/AAPLx pool the
    // priceUsd field is TREE's price, not ours, including those was reporting
    // $0.00 prints and a 10,000 bps dispersion.
    .filter((p: Record<string, any>) => p?.baseToken?.address === mint)
    .map((p: Record<string, any>) => ({
      dex: p.dexId,
      pair: `${p.baseToken?.symbol}/${p.quoteToken?.symbol}`,
      price: Number(p.priceUsd ?? 0),
      liquidity: Number(p.liquidity?.usd ?? 0),
      volume24h: Number(p.volume?.h24 ?? 0),
    }))
    .filter((v: Venue) => v.price > 0 && v.liquidity > 2_000);
  return pairs.sort((a, b) => b.liquidity - a.liquidity).slice(0, 8);
}

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export interface Executable {
  size: number;
  buyPrice: number;
  sellPrice: number;
  /** Round-trip cost as a fraction of mid. This is the number that matters. */
  roundTrip: number;
}

/**
 * What you can ACTUALLY trade at, from Jupiter's router.
 *
 * The venue table shows what each pool is quoting. Those are not the same thing,
 * and conflating them is the classic tokenised-equity headline error: a stale CLMM
 * position sitting 10% away looks like a screaming arbitrage right up until you
 * notice the router walks straight past it, because there is no size behind it.
 *
 * The honest measure of "is this a price" is the round trip, buy N dollars of it,
 * sell it straight back, see what is missing.
 */
export async function fetchExecutable(mint: string, decimals = 8): Promise<Executable[]> {
  const SIZES = [1_000, 25_000, 100_000];
  const out: Executable[] = [];
  for (const size of SIZES) {
    try {
      const buy = await getJSON(
        `https://lite-api.jup.ag/swap/v1/quote?inputMint=${USDC_MINT}&outputMint=${mint}` +
        `&amount=${Math.round(size * 1e6)}&slippageBps=100`);
      const qty = Number(buy?.outAmount ?? 0) / 10 ** decimals;
      if (!qty) continue;
      const sell = await getJSON(
        `https://lite-api.jup.ag/swap/v1/quote?inputMint=${mint}&outputMint=${USDC_MINT}` +
        `&amount=${buy.outAmount}&slippageBps=100`);
      const back = Number(sell?.outAmount ?? 0) / 1e6;
      if (!back) continue;
      const buyPrice = size / qty;
      const sellPrice = back / qty;
      out.push({
        size, buyPrice, sellPrice,
        roundTrip: (buyPrice - sellPrice) / ((buyPrice + sellPrice) / 2),
      });
    } catch { /* a size that will not route is information too */ }
  }
  return out;
}

/** Spread between the best and worst QUOTED pool price, in bps of the median.
 *  Not a tradeable spread, see `fetchExecutable`. */
export function dispersionBps(vs: Venue[]): number {
  if (vs.length < 2) return 0;
  const px = vs.map((v) => v.price);
  const mid = median(px);
  return mid > 0 ? ((Math.max(...px) - Math.min(...px)) / mid) * 10_000 : 0;
}

export async function fetchSnapshot(lastCloseMs: number): Promise<LiveSnapshot> {
  const [assetsRes, btcRes, ethRes] = await Promise.all([
    timed('Jupiter + DexScreener', `${JUP} · ${DEX}`, fetchAssets),
    timed('Coinbase BTC-USD', `${CB}/products/BTC-USD/candles`,
      () => returnSince('BTC-USD', lastCloseMs)),
    timed('Coinbase ETH-USD', `${CB}/products/ETH-USD/candles`,
      () => returnSince('ETH-USD', lastCloseMs)),
  ]);

  const assets = assetsRes.value ?? {};
  const syms = Object.keys(assets);

  // Strip the complex-wide weekend basis before reading anything as a signal.
  const basis = median(syms.map((s) => assets[s].dislocation));

  const btc = btcRes.value;
  const eth = ethRes.value;
  const cryptoOk = btc != null || eth != null;
  const crypto = cryptoOk
    ? btc != null && eth != null ? (btc + eth) / 2 : (btc ?? eth)!
    : 0;

  const available: Record<FactorId, boolean> = {
    MKT: !!assets[MKT_SYM],
    SECT: TECH.filter((t) => assets[t]).length >= 2,
    CRYPTO: cryptoOk,
    FX: false,     // no free always-on USD index; EURC-USD on Coinbase is dead
    RATES: false,  // no free always-on tokenised-bill yield feed
  };



  /**
   * Reading noise. MKT and SECT are DERIVED from thin on-chain prints rather than
   * observed on a real venue, so they are far noisier than the synthetic
   * scenario's factors, and an unavailable factor gets the full standalone
   * uncertainty of the move it would have explained.
   */
  const noise: FactorNoise = {
    MKT: available.MKT ? 0.0060 : 0.0090,
    SECT: available.SECT ? 0.0075 : 0.0110,
    CRYPTO: available.CRYPTO ? 0.0012 : 0.0180,
    FX: 0.0040,
    RATES: 0.0050,
  };

  const reports = [assetsRes.report, btcRes.report, ethRes.report];
  reports.push({
    name: 'FX · rates',
    url: '—',
    status: 'degraded',
    detail: 'no free always-on source; sigma widened instead of assuming zero',
    ms: 0,
  });

  return {
    fetchedAt: Date.now(),
    assets, basis,
    crypto: { btc, eth, sinceClose: cryptoOk ? crypto : null },
    factors: factorsFor(null, { assets, basis, crypto }),
    noise, available,
    sources: reports,
  };
}


/**
 * Factors for one asset, built leave-one-out.
 *
 * MKT and SECT are read off the cross-section of xStock dislocations. If we let a
 * name contribute to the factor that then explains it, the model reads its own
 * input back as independent evidence and understates sigma, SPYx was the worst
 * offender, since it IS the market proxy. Excluding the asset being marked costs
 * nothing and removes the circularity for every name at once.
 *
 * Pass `exclude = null` for the complex-wide view shown in the Sources panel.
 */
export function factorsFor(
  exclude: string | null,
  snap: Pick<LiveSnapshot, 'assets' | 'basis'> & { crypto: number },
): FactorReturns {
  const { assets, basis } = snap;
  const sig = (s: string) => (assets[s] ? assets[s].dislocation - basis : 0);
  const usable = (s: string) => !!assets[s] && s !== exclude;

  const mkt = usable(MKT_SYM)
    ? sig(MKT_SYM)
    // If the proxy itself is what we are marking, fall back to the median of
    // everything else rather than dropping the factor entirely.
    : median(Object.keys(assets).filter(usable).map(sig));

  const tech = TECH.filter(usable);
  const sect = tech.length >= 2 ? median(tech.map(sig)) - mkt : 0;

  return { MKT: mkt, SECT: sect, CRYPTO: snap.crypto, FX: 0, RATES: 0 };
}
