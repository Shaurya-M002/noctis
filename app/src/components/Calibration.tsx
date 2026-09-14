import { useMemo, useState } from 'react';
import { runBacktest } from '../lib/backtest';
import { usd, pct } from '../lib/fmt';
import { Stat } from './ui';

/**
 * Two questions a judge should ask and almost no hackathon demo answers:
 *   1. Is the point estimate actually better than doing nothing?
 *   2. Is the uncertainty honest, or tuned to make the insurance look cheap?
 */
export function Calibration() {
  const [nights, setNights] = useState(200);
  const [ran, setRan] = useState(false);
  const bt = useMemo(() => (ran ? runBacktest(nights) : null), [ran, nights]);

  if (!bt) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setRan(true)}
          className="rounded-lg border border-mark/50 bg-mark/10 px-3.5 py-2 text-[12px] font-medium text-mark hover:bg-mark/15"
        >
          Run {nights}-night backtest
        </button>
        <select
          value={nights}
          onChange={(e) => setNights(Number(e.target.value))}
          className="rounded-lg border border-line bg-void px-2.5 py-2 text-[11.5px] text-ink2"
        >
          {[50, 200, 500, 1000].map((n) => <option key={n} value={n}>{n} nights</option>)}
        </select>
        <p className="text-[11px] text-ink3">
          Independent synthetic weekends and overnights across all 8 names. Nyx never sees the latent path.
        </p>
      </div>
    );
  }

  const best = Math.max(bt.rmse.noctis, bt.rmse.lastClose, bt.rmse.thinBook);
  const rows = [
    { k: 'Noctis mark', v: bt.rmse.noctis, tone: 'mark' as const },
    { k: 'Last official close', v: bt.rmse.lastClose, tone: 'ink' as const },
    { k: 'Thin 24/7 book last trade', v: bt.rmse.thinBook, tone: 'tape' as const },
  ];

  const maxN = Math.max(...bt.zHist.map((b) => b.n), 1);
  const improve = 1 - bt.rmse.noctis / bt.rmse.lastClose;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-6">
          <Stat label="Nights simulated" value={bt.nights.toLocaleString()} size="sm" />
          <Stat label="RMSE vs last close" value={pct(improve, 1) + ' better'} tone="mark" size="sm" />
          <Stat label="1σ coverage" value={pct(bt.coverage1, 1)} sub="target 68.3%"
                tone={Math.abs(bt.coverage1 - 0.683) < 0.06 ? 'up' : 'down'} size="sm" />
          <Stat label="2σ coverage" value={pct(bt.coverage2, 1)} sub="target 95.4%"
                tone={Math.abs(bt.coverage2 - 0.954) < 0.05 ? 'up' : 'down'} size="sm" />
        </div>
        <button onClick={() => setRan(false)}
                className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-ink3 hover:text-ink2">
          reset
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-ink2">
            Predicting the opening print
          </h3>
          <p className="mt-1 mb-3 text-[11px] text-ink3">
            RMSE of each estimator against the official open, quoted 6h before the auction. Lower is better.
          </p>
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.k}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11.5px] text-ink">{r.k}</span>
                  <span className="num text-[12px] text-ink2">{(r.v * 100).toFixed(3)}%</span>
                </div>
                <div className="mt-1 h-2.5 w-full overflow-hidden rounded bg-void">
                  <div
                    className={`h-full rounded ${r.tone === 'mark' ? 'bg-mark' : r.tone === 'tape' ? 'bg-tape' : 'bg-line2'}`}
                    style={{ width: `${(r.v / best) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-ink2">
            Is σ honest?
          </h3>
          <p className="mt-1 mb-3 text-[11px] text-ink3">
            Standardised errors (open − mark) ÷ σ. If the model is calibrated this is
            a unit normal — not too fat, not too thin.
          </p>
          <div className="flex h-[132px] items-end gap-[3px]">
            {bt.zHist.map((b, i) => (
              <div key={i} className="group relative flex-1"
                   title={`z ≈ ${b.bin.toFixed(1)} · ${b.n} observations`}>
                <div
                  className={`w-full rounded-t-[3px] ${Math.abs(b.bin) <= 1 ? 'bg-mark' : 'bg-mark/35'}`}
                  style={{ height: `${(b.n / maxN) * 126}px` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between num text-[9.5px] text-ink3">
            <span>−4σ</span><span>0</span><span>+4σ</span>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-ink3">
            Solid bars are inside ±1σ. They should be about two thirds of the mass.
          </p>
        </div>
      </div>

      <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-4">
        <Stat label="Premiums written" value={usd(bt.vault.premiums, 0)} size="sm" />
        <Stat label="Claims paid" value={usd(bt.vault.payouts, 0)} size="sm"
              tone={bt.vault.payouts > bt.vault.premiums ? 'down' : 'ink'} />
        <Stat label="LP net" value={usd(bt.vault.net, 0)} size="sm"
              tone={bt.vault.net >= 0 ? 'up' : 'down'} sub={`${pct(bt.vault.hitRate, 1)} of trades claimed`} />
        <Stat label="Worst single night" value={usd(bt.vault.worstNight, 0)} size="sm" tone="down"
              sub="the number an LP actually needs to see" />
      </div>
    </div>
  );
}
