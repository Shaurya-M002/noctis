import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UNIVERSE, bySym } from '../data/universe';
import { sessionAt, type SessionState } from './market';
import { baselines, computeMark, type Mark } from './nyx';
import { quotePremium, settle, type Settlement, type Tier, type VaultState } from './pricing';
import { SCENARIOS, instantAt, openingPrint, worldAt, type Scenario } from './world';
import type { Frame } from '../components/BandChart';

export interface Receipt {
  id: string;
  sym: string;
  side: 'BUY' | 'SELL';
  qty: number;
  notional: number;
  fillPrice: number;
  tier: Tier;
  premium: number;
  sigmaAbs: number;
  capitalAtRisk: number;
  atHours: number;
  sig: string;
  settlement?: Settlement;
  openPrice?: number;
}

const INITIAL_TVL = 2_500_000;

/**
 * A deterministic stand-in for a transaction signature.
 *
 * Simulation mode settles against a synthetic auction, so there is no transaction
 * and there cannot be one. The receipt still shows an identifier because that is
 * what a receipt has. But it is labelled `simulated` wherever it appears, because
 * a 44-character base58 string that resolves to nothing on an explorer is the kind
 * of detail that costs you a reader's trust for no gain. The executable path is
 * devnet, and those signatures are real: see docs/DEVNET.md.
 */
function simulatedRef(n: number) {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let s = '';
  let x = (n * 2654435761) >>> 0;
  for (let i = 0; i < 44; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    s += A[x % A.length];
  }
  return s;
}

export function useNoctis() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const scenario: Scenario = useMemo(
    () => SCENARIOS.find((s) => s.id === scenarioId)!, [scenarioId]);

  const [hoursClosed, setHoursClosed] = useState(18);
  const [sym, setSym] = useState('AAPLx');
  const [playing, setPlaying] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [premiumsCollected, setPremiums] = useState(0);
  const [payoutsPaid, setPayouts] = useState(0);
  const [settledAt, setSettledAt] = useState<number | null>(null);
  /** Where the clock was when the auction was called. Scoring the mark AT the open
   *  would be meaningless, by then the mark and the print have converged. The
   *  honest question is how good the answer was when you had to act on it. */
  const [scoredAt, setScoredAt] = useState<number | null>(null);

  const nonce = useRef(1);

  // Reset the world when the scenario changes.
  useEffect(() => {
    setHoursClosed(Math.min(18, scenario.windowHours * 0.28));
    setReceipts([]); setPremiums(0); setPayouts(0);
    setSettledAt(null); setScoredAt(null); setPlaying(false);
  }, [scenarioId, scenario.windowHours]);

  // Playback: 1 real second ≈ 4 window-hours.
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setHoursClosed((h) => {
        const next = h + scenario.windowHours / 55;
        if (next >= scenario.windowHours) { setPlaying(false); return scenario.windowHours; }
        return next;
      });
    }, 70);
    return () => clearInterval(t);
  }, [playing, scenario.windowHours]);

  const atOpen = hoursClosed >= scenario.windowHours - 1e-6;
  const settledNow = settledAt != null;

  const now = useMemo(() => instantAt(scenario, hoursClosed), [scenario, hoursClosed]);
  const session: SessionState = useMemo(() => sessionAt(now), [now]);
  // The scrubber is the source of truth for elapsed time; the calendar supplies the label.
  const sess: SessionState = { ...session, hoursClosed, hoursToOpen: scenario.windowHours - hoursClosed };

  const world = useMemo(() => worldAt(scenario, hoursClosed), [scenario, hoursClosed]);

  /**
   * The session as it was at an arbitrary point in the window.
   *
   * Deriving this from the *current* cursor is a trap: once the auction runs, the
   * cursor sits on a Monday morning, and every historical frame would be re-scored
   * as if the market had been open all weekend. sigma would come out ~3x too wide.
   */
  const sessionForHour = useCallback((h: number): SessionState => {
    const base = sessionAt(instantAt(scenario, h));
    return { ...base, hoursClosed: h, hoursToOpen: scenario.windowHours - h };
  }, [scenario]);

  const marks: Record<string, Mark> = useMemo(() => {
    const out: Record<string, Mark> = {};
    for (const a of UNIVERSE) {
      out[a.sym] = computeMark(a, sess, world.factors, world.noise, world.tape[a.sym]);
    }
    return out;
  }, [world, sess.hoursClosed, sess.kind]);

  const asset = bySym(sym);
  const mark = marks[sym];
  const base = useMemo(
    () => baselines(asset, world.tape[sym], sess), [asset, world, sym, sess.hoursClosed]);

  const openPrints: Record<string, number> = useMemo(() => {
    const o: Record<string, number> = {};
    for (const a of UNIVERSE) o[a.sym] = openingPrint(scenario, a);
    return o;
  }, [scenario]);

  // Mirrors `Vault::reserve` in the program: one gap cannot pay both sides of a
  // name, so reserve the larger leg plus half the smaller rather than the sum.
  const live = receipts.filter((r) => !r.settlement);
  const longRisk = live.filter((r) => r.side === 'BUY').reduce((s, r) => s + r.capitalAtRisk, 0);
  const shortRisk = live.filter((r) => r.side === 'SELL').reduce((s, r) => s + r.capitalAtRisk, 0);
  const exposure = Math.max(longRisk, shortRisk) + 0.5 * Math.min(longRisk, shortRisk);

  const vault: VaultState = { tvl: INITIAL_TVL + premiumsCollected - payoutsPaid, exposure };

  // Frames for the chart: sample the whole window so the shape is stable while scrubbing.
  const frames: Frame[] = useMemo(() => {
    const N = 120;
    const out: Frame[] = [];
    for (let i = 0; i <= N; i++) {
      const h = (scenario.windowHours * i) / N;
      const w = worldAt(scenario, h);
      const s = sessionForHour(h);
      const m = computeMark(asset, s, w.factors, w.noise, w.tape[asset.sym]);
      out.push({
        h, mid: m.mid, lo: m.lo, hi: m.hi,
        tape: asset.close * Math.exp(w.tape[asset.sym].impliedReturn),
        truth: asset.close * Math.exp(w.truth[asset.sym]),
      });
    }
    return out;
  }, [scenario, asset, sessionForHour]);

  const quote = useCallback(
    (tier: Tier, notional: number) =>
      quotePremium({ notional, sigma: mark.sigma, tier, vault, depth: asset.depth }),
    [mark, vault, asset]);

  const trade = useCallback((side: 'BUY' | 'SELL', qty: number, tier: Tier) => {
    const notional = qty * mark.mid;
    const q = quotePremium({ notional, sigma: mark.sigma, tier, vault, depth: asset.depth });
    const r: Receipt = {
      id: `NR-${String(nonce.current).padStart(4, '0')}`,
      sym, side, qty, notional,
      fillPrice: mark.mid,
      tier, premium: q.premium,
      sigmaAbs: mark.sigmaAbs,
      capitalAtRisk: q.capitalAtRisk,
      atHours: hoursClosed,
      sig: simulatedRef(nonce.current * 7919),
    };
    nonce.current += 1;
    setReceipts((rs) => [r, ...rs]);
    setPremiums((p) => p + q.premium);
    return r;
  }, [mark, sym, vault, asset, hoursClosed]);

  /** Run the reopening auction and settle every outstanding receipt. */
  const runAuction = useCallback(() => {
    setScoredAt(hoursClosed);
    setHoursClosed(scenario.windowHours);
    setPlaying(false);
    let paid = 0;
    setReceipts((rs) =>
      rs.map((r) => {
        if (r.settlement) return r;
        const openPrice = openPrints[r.sym];
        const s = settle({
          side: r.side, qty: r.qty, fillPrice: r.fillPrice, openPrice,
          sigmaAbs: r.sigmaAbs, tier: r.tier, premium: r.premium,
        });
        paid += s.payout;
        return { ...r, settlement: s, openPrice };
      }));
    setPayouts((p) => p + paid);
    setSettledAt(Date.now());
  }, [openPrints, scenario.windowHours, hoursClosed]);

  const reset = useCallback(() => {
    setHoursClosed(Math.min(18, scenario.windowHours * 0.28));
    setReceipts([]); setPremiums(0); setPayouts(0);
    setSettledAt(null); setScoredAt(null); setPlaying(false);
  }, [scenario.windowHours]);

  /** The mark and the baselines frozen at the moment the auction was called. */
  const scorecard = useMemo(() => {
    if (scoredAt == null) return null;
    const w = worldAt(scenario, scoredAt);
    const s = sessionForHour(scoredAt);
    return {
      atHours: scoredAt,
      mark: computeMark(asset, s, w.factors, w.noise, w.tape[sym]),
      base: baselines(asset, w.tape[sym], s),
    };
  }, [scoredAt, scenario, asset, sym, sessionForHour]);

  return {
    scenario, scenarioId, setScenarioId, scorecard,
    hoursClosed, setHoursClosed, playing, setPlaying,
    sym, setSym, asset, mark, marks, base, session: sess, world,
    frames, openPrints, atOpen, settled: settledNow,
    receipts, vault, premiumsCollected, payoutsPaid,
    quote, trade, runAuction, reset,
    initialTvl: INITIAL_TVL,
  };
}
