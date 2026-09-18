import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UNIVERSE, type Asset } from '../data/universe';
import { sessionAt, type SessionState } from './market';
import { PYTH_ENABLED } from './flags';
import { readPyth, type PythRead } from './pyth';
import {
  BUILTIN_CALENDAR, cachedCalendar, fetchPythCalendar,
  type MarketCalendar, type MarketHours,
} from './schedule';
import { computeMark, type Mark } from './nyx';
import { quotePremium, type PremiumQuote, type Tier, type VaultState } from './pricing';
import {
  dispersionBps, factorsFor, fetchExecutable, fetchSnapshot, fetchVenues,
  type Executable, type LiveSnapshot, type SourceReport, type Venue,
} from './feeds';

const REFRESH_MS = 30_000;
const LIVE_TVL = 2_500_000;

export interface LiveState {
  loading: boolean;
  error: string | null;
  snap: LiveSnapshot | null;
  session: SessionState;
  /** Universe with close, depth and tape taken from the live feeds. */
  assets: Asset[];
  marks: Record<string, Mark>;
  venues: Venue[];
  venuesLoading: boolean;
  dispersion: number;
  /** Round-trip cost from Jupiter's router, what a trade actually costs. */
  executable: Executable[];
  quote: (tier: Tier, notional: number) => PremiumQuote;
  refresh: () => void;
  ageSeconds: number;
  /** Pyth, read off mainnet on its own independent cycle. */
  pyth: PythRead | null;
  calendar: MarketCalendar;
  marketHours: MarketHours | null;
  /** Ticking wall clock, so the dark timer counts in real time. */
  nowMs: number;
  pythReports: SourceReport[];
}

/**
 * Live mode.
 *
 * The same Nyx and the same premium math as the simulation, only the inputs
 * change. Nothing about the model is special-cased for the demo, which is the
 * whole reason this mode is worth having.
 */
export function useLive(enabled: boolean, sym: string): LiveState {
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [executable, setExecutable] = useState<Executable[]>([]);
  const [venuesLoading, setVenuesLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const inflight = useRef(false);
  const [pyth, setPyth] = useState<PythRead | null>(null);
  const [calendar, setCalendar] = useState<MarketCalendar>(
    () => cachedCalendar() ?? BUILTIN_CALENDAR);
  const [marketHours, setMarketHours] = useState<MarketHours | null>(null);
  const [schedReport, setSchedReport] = useState<SourceReport | null>(null);

  // Real wall clock, ticking, so hoursClosed and hoursToOpen stay honest.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [enabled]);

  // The calendar comes from Pyth when we have it, and falls back to the builtin
  // set otherwise. Live mode only, simulation and the backtest never see this.
  const session = useMemo(() => sessionAt(now, calendar), [now, calendar]);
  const lastCloseMs = useMemo(
    () => now.getTime() - session.hoursClosed * 3_600_000,
    [now, session.hoursClosed]);

  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setLoading(true);
    try {
      const s = await fetchSnapshot(lastCloseMs);
      setSnap(s);
      setError(Object.keys(s.assets).length ? null : 'no asset prices returned');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      inflight.current = false;
    }
    // lastCloseMs moves every second; the fetch only needs it to the hour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(lastCloseMs / 3_600_000)]);

  useEffect(() => {
    if (!enabled) return;
    load();
    const t = setInterval(() => setTick((k) => k + 1), REFRESH_MS);
    return () => clearInterval(t);
  }, [enabled, load]);

  // Pyth's schedule. Cached 24h in localStorage, revalidated every 6h.
  useEffect(() => {
    if (!enabled || !PYTH_ENABLED) return;
    let dead = false;
    const go = () => fetchPythCalendar('AAPL').then((r) => {
      if (dead) return;
      setCalendar(r.calendar);
      setMarketHours(r.marketHours);
      setSchedReport(r.report);
    });
    go();
    const t = setInterval(go, 6 * 3_600_000);
    return () => { dead = true; clearInterval(t); };
  }, [enabled]);

  /**
   * Pyth prices, on a deliberately separate effect from the Jupiter snapshot.
   *
   * Two independent failure domains: if an RPC is having a bad afternoon the Pyth
   * panel degrades on its own and the rest of live mode never notices. Backs right
   * off once the feed is dark, because on a Saturday the data is frozen for 48
   * hours and polling it at 10s is pure waste.
   */
  useEffect(() => {
    if (!enabled || !PYTH_ENABLED) return;
    let dead = false;
    let timer: ReturnType<typeof setTimeout>;
    const cycle = async () => {
      if (document.visibilityState === 'visible') {
        const r = await readPyth();
        if (dead) return;
        setPyth(r);
      }
      const p = Object.values(pythRef.current?.byUnder ?? {})[0];
      const stale = p ? Date.now() / 1000 - p.publishTime > 900 : false;
      timer = setTimeout(cycle, stale ? 60_000 : 10_000);
    };
    cycle();
    return () => { dead = true; clearTimeout(timer); };
  }, [enabled]);

  useEffect(() => { if (enabled && tick) load(); }, [tick, enabled, load]);

  // Per-venue prints for whichever asset is selected.
  useEffect(() => {
    if (!enabled) return;
    let dead = false;
    const a = UNIVERSE.find((x) => x.sym === sym);
    if (!a) return;
    setVenuesLoading(true);
    setExecutable([]);
    fetchExecutable(a.mint)
      .then((e) => { if (!dead) setExecutable(e); })
      .catch(() => { if (!dead) setExecutable([]); });
    fetchVenues(a.mint)
      .then((v) => { if (!dead) setVenues(v); })
      .catch(() => { if (!dead) setVenues([]); })
      .finally(() => { if (!dead) setVenuesLoading(false); });
    return () => { dead = true; };
  }, [enabled, sym, tick]);

  const pythRef = useRef<PythRead | null>(null);
  pythRef.current = pyth;

  /** UNIVERSE re-based on live prices and live depth. */
  const assets: Asset[] = useMemo(() => {
    if (!snap) return UNIVERSE;
    return UNIVERSE.map((a) => {
      const l = snap.assets[a.sym];
      if (!l) return a;
      return {
        ...a,
        close: l.reference,
        depth: Math.max(20_000, l.liquidity),
        // The universe's earnings dates are demo data. Live mode has no calendar
        // feed, so say "unknown" rather than assert a date we did not look up.
        earningsInDays: -1,
      };
    });
  }, [snap]);

  const marks: Record<string, Mark> = useMemo(() => {
    const out: Record<string, Mark> = {};
    if (!snap) return out;
    const crypto = snap.crypto.sinceClose ?? 0;
    for (const a of assets) {
      const l = snap.assets[a.sym];
      if (!l) continue;
      // Leave-one-out: a name must not help build the factor that explains it.
      const factors = factorsFor(a.sym, { assets: snap.assets, basis: snap.basis, crypto });
      out[a.sym] = computeMark(a, session, factors, snap.noise, {
        // The complex-wide basis is a liquidity premium, not a forecast.
        impliedReturn: l.dislocation - snap.basis,
        volume: l.volume24h,
      });
    }
    return out;
  }, [snap, assets, session.hoursClosed, session.kind]);

  const vault: VaultState = { tvl: LIVE_TVL, exposure: 0 };
  const quote = useCallback((tier: Tier, notional: number) => {
    const m = marks[sym];
    const a = assets.find((x) => x.sym === sym)!;
    return quotePremium({
      notional, sigma: m?.sigma ?? 0.02, tier, vault, depth: a.depth,
    });
  }, [marks, sym, assets]);

  return {
    loading, error, snap, session, assets, marks,
    venues, venuesLoading, dispersion: dispersionBps(venues), executable,
    pyth, calendar, marketHours, nowMs: now.getTime(),
    pythReports: schedReport
      ? [pyth?.report, schedReport].filter(Boolean) as SourceReport[]
      : (pyth ? [pyth.report] : []),
    quote, refresh: load,
    ageSeconds: snap ? Math.floor((Date.now() - snap.fetchedAt) / 1000) : 0,
  };
}
