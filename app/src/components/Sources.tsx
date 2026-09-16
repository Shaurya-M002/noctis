import type { LiveSnapshot, SourceReport } from '../lib/feeds';
import { FACTORS } from '../data/universe';
import { pctSigned } from '../lib/fmt';

/** Every number in live mode, and exactly where it came from. */
export function Sources({
  snap, ageSeconds, onRefresh, loading, error, extra = [],
}: {
  snap: LiveSnapshot | null; ageSeconds: number;
  onRefresh: () => void; loading: boolean; error: string | null;
  /** Reports from feeds on their own cycle, e.g. Pyth. */
  extra?: SourceReport[];
}) {
  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-ink2">
          {loading ? 'fetching…' : snap ? `updated ${ageSeconds}s ago` : 'no data yet'}
        </span>
        <button
          onClick={onRefresh}
          className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink3 hover:border-line2 hover:text-ink2"
        >
          refresh
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-down/40 bg-down/[0.07] p-2.5 text-[11px] text-down">
          {error}
        </p>
      )}

      <div className="space-y-1.5">
        {[...(snap?.sources ?? []), ...extra].map((s) => (
          <div key={s.name} className="rounded-lg border border-line bg-void/50 px-2.5 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11.5px] text-ink">
                <span className={`h-1.5 w-1.5 rounded-full ${
                  s.status === 'ok' ? 'bg-up' : s.status === 'degraded' ? 'bg-warn' : 'bg-down'
                }`} />
                {s.name}
              </span>
              {s.ms > 0 && <span className="num text-[10px] text-ink3">{s.ms}ms</span>}
            </div>
            <div className="mt-1 truncate font-mono text-[9.5px] text-ink3" title={s.url}>{s.url}</div>
            {s.status !== 'ok' && (
              <div className="mt-1 text-[10px] leading-snug text-ink3">{s.detail}</div>
            )}
          </div>
        ))}
      </div>

      {snap && (
        <div className="rounded-lg border border-line bg-void/50 p-2.5">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-ink3">
            Factors, since the last ET close
          </div>
          {FACTORS.map((f) => {
            const on = snap.available[f.id];
            return (
              <div key={f.id} className="flex items-baseline justify-between gap-2 py-0.5">
                <span className={`text-[11px] ${on ? 'text-ink2' : 'text-ink3 line-through'}`}>
                  {f.name}
                </span>
                <span className={`num text-[11px] ${on ? 'text-ink' : 'text-ink3'}`}>
                  {on ? pctSigned(snap.factors[f.id]) : 'no source'}
                </span>
              </div>
            );
          })}
          <p className="mt-2 border-t border-line pt-2 text-[10px] leading-snug text-ink3">
            A factor with no live source is not read as zero — its full standalone
            uncertainty is added to σ instead. Missing data should make the model
            less confident, not accidentally more.
          </p>
        </div>
      )}

      {snap && (
        <div className="rounded-lg border border-line bg-void/50 p-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-ink2">Complex-wide xStocks basis</span>
            <span className={`num text-[13px] ${snap.basis < 0 ? 'text-down' : 'text-up'}`}>
              {pctSigned(snap.basis)}
            </span>
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-ink3">
            The median dislocation across every name. When the whole complex moves
            together it is the price of warehousing gap risk over the weekend, not
            a forecast — so Nyx strips it out and only reads the cross-section.
          </p>
        </div>
      )}
    </div>
  );
}
