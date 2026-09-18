import { useCallback, useEffect, useState } from 'react';
import { fetchPreIPO, gapSigma, type PreIPOSnapshot } from './preipo';
import { tokenVolatility, type TokenVol } from './gapcal';
import { preBySym } from '../data/preipo';
import { quotePremium, type PremiumQuote, type Tier, type VaultState } from './pricing';

const REFRESH_MS = 60_000;
const VAULT: VaultState = { tvl: 2_500_000, exposure: 0 };

export interface PreIPOState {
  loading: boolean;
  error: string | null;
  snap: PreIPOSnapshot | null;
  sym: string;
  setSym: (s: string) => void;
  horizonDays: number;
  setHorizonDays: (d: number) => void;
  refresh: () => void;
  ageSeconds: number;
  /** 38 days of real candles for the selected name. An upper bound on the gap. */
  vol: TokenVol | null;
  /** Cover on the NAV gap, priced by the same formula the chain runs. */
  quote: (tier: Tier, notional: number) => PremiumQuote & {
    sigma: number; basis: string; confident: boolean;
  };
}

export function usePreIPO(enabled: boolean): PreIPOState {
  const [snap, setSnap] = useState<PreIPOSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sym, setSym] = useState('OPENAI');
  const [horizonDays, setHorizonDays] = useState(7);
  const [, setTick] = useState(0);
  const [vol, setVol] = useState<TokenVol | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await fetchPreIPO();
      setSnap(s);
      setError(s.quotes.length ? null : 'no pre-IPO quotes returned');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
    const t = setInterval(() => { load(); setTick((k) => k + 1); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [enabled, load]);

  // Candle history for the selected name only, GeckoTerminal's free tier is
  // rate-limited, and one name at a time is plenty for a panel.
  useEffect(() => {
    if (!enabled) return;
    let dead = false;
    const p = preBySym(sym);
    if (!p) return;
    setVol(null);
    tokenVolatility(sym, p.mint, horizonDays * 24)
      .then((v) => { if (!dead) setVol(v); })
      .catch(() => { if (!dead) setVol(null); });
    return () => { dead = true; };
  }, [enabled, sym, horizonDays]);

  const quote = useCallback((tier: Tier, notional: number) => {
    const g = gapSigma(snap?.stats[sym], horizonDays * 24, vol?.horizonSd);
    const q = snap?.quotes.find((x) => x.sym === sym);
    return {
      ...quotePremium({
        notional, sigma: g.sigma, tier, vault: VAULT,
        depth: Math.max(20_000, q?.liquidity ?? 50_000),
      }),
      sigma: g.sigma, basis: g.basis, confident: g.confident,
    };
  }, [snap, sym, horizonDays, vol]);

  return {
    loading, error, snap, sym, setSym, horizonDays, setHorizonDays,
    refresh: load,
    ageSeconds: snap ? Math.floor((Date.now() - snap.fetchedAt) / 1000) : 0,
    vol, quote,
  };
}
