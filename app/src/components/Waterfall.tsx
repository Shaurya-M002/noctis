import type { Mark } from '../lib/nyx';
import { FACTORS } from '../data/universe';
import { pct } from '../lib/fmt';

/**
 * Where the mark came from, and where the uncertainty came from.
 * A price nobody can audit is a price nobody should trade against.
 */
export function Waterfall({ mark }: { mark: Mark }) {
  const maxAbs = Math.max(...mark.contributions.map((c) => Math.abs(c.contrib)), 1e-6);

  const V = mark.variance;
  const varRows = [
    { k: 'Idiosyncratic drift', v: V.idio, why: 'the part no factor can explain, growing with time shut' },
    { k: 'Factor reading noise', v: V.factorNoise, why: 'how badly we can read each signal overnight' },
    { k: 'Time still to run', v: V.future, why: 'the world keeps moving between now and the opening bell' },
    { k: 'Signal disagreement', v: V.disagreement, why: 'model vs on-chain tape telling different stories' },
    { k: 'Event risk', v: V.event, why: 'scheduled discontinuities a factor model cannot see' },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-ink2">
          Return attribution
        </h3>
        <p className="mt-1 mb-3 text-[11px] text-ink3">
          Every always-on signal, its loading, and what it contributed to the mark.
        </p>
        <div className="space-y-2">
          {mark.contributions.map((c) => {
            const src = FACTORS.find((f) => f.id === c.id)?.source ?? 'Signed order flow on the token itself';
            const w = (Math.abs(c.contrib) / maxAbs) * 50;
            return (
              <div key={c.id} className="grid grid-cols-[110px_1fr_64px] items-center gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[11.5px] text-ink">{c.name}</div>
                  <div className="truncate text-[9.5px] text-ink3" title={src}>{src}</div>
                </div>
                <div className="relative h-4 rounded bg-void/60">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-line2" />
                  <div
                    className={`absolute inset-y-[3px] rounded-sm ${c.contrib >= 0 ? 'bg-up/70' : 'bg-down/70'}`}
                    style={
                      c.contrib >= 0
                        ? { left: '50%', width: `${w}%` }
                        : { right: '50%', width: `${w}%` }
                    }
                  />
                </div>
                <div className="text-right">
                  <div className={`num text-[11.5px] ${c.contrib >= 0 ? 'text-up' : 'text-down'}`}>
                    {c.contrib >= 0 ? '+' : '−'}{(Math.abs(c.contrib) * 100).toFixed(2)}%
                  </div>
                  <div className="num text-[9.5px] text-ink3">β {c.beta.toFixed(2)}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-baseline justify-between border-t border-line pt-2">
          <span className="text-[11px] text-ink2">Estimated move since close</span>
          <span className={`num text-[13px] ${mark.ret >= 0 ? 'text-up' : 'text-down'}`}>
            {mark.ret >= 0 ? '+' : '−'}{(Math.abs(mark.ret) * 100).toFixed(2)}%
          </span>
        </div>
      </div>

      <div>
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-ink2">
          Variance budget
        </h3>
        <p className="mt-1 mb-3 text-[11px] text-ink3">
          σ = {pct(mark.sigma)}. This is what the premium is priced off. Pyth
          publishes a confidence interval too — but it measures publisher
          disagreement right now, and its equity feeds are closed during this
          window. This is forecast error for Monday&apos;s auction.
        </p>
        <div className="space-y-2.5">
          {varRows.map((r) => {
            const share = V.total > 0 ? r.v / V.total : 0;
            return (
              <div key={r.k}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11.5px] text-ink">{r.k}</span>
                  <span className="num text-[11px] text-ink2">
                    {(Math.sqrt(r.v) * 100).toFixed(2)}% · {(share * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-mark/80 transition-[width] duration-500"
                       style={{ width: `${share * 100}%` }} />
                </div>
                <div className="mt-1 text-[10px] leading-snug text-ink3">{r.why}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 border-t border-line pt-2 text-[10.5px] text-ink3">
          Information time elapsed: <span className="num text-ink2">{mark.infoHours.toFixed(1)}h</span> of
          trading-equivalent. Calendar hours are discounted — a Sunday 04:00 hour
          carries far less news than a Tuesday 10:00 one.
        </div>
      </div>
    </div>
  );
}
