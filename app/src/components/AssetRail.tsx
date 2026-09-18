import { UNIVERSE } from '../data/universe';
import type { Mark } from '../lib/nyx';
import { pctSigned } from '../lib/fmt';

export function AssetRail({
  marks, sym, onSelect,
}: { marks: Record<string, Mark>; sym: string; onSelect: (s: string) => void }) {
  return (
    <div className="divide-y divide-line">
      {UNIVERSE.map((a) => {
        const m = marks[a.sym];
        const sel = a.sym === sym;

        // In live mode a name can simply be absent, a mint with no route, a feed
        // that dropped it. Say so rather than crashing or inventing a price.
        if (!m) {
          return (
            <div key={a.sym}
                 className="flex items-center justify-between px-3 py-2.5 opacity-45">
              <span className="text-[13px] text-ink3">{a.sym}</span>
              <span className="text-[10px] uppercase tracking-wider text-ink3">no feed</span>
            </div>
          );
        }

        const conf = m.confidence;
        return (
          <button
            key={a.sym}
            onClick={() => onSelect(a.sym)}
            className={`grid w-full grid-cols-[1fr_auto] items-center gap-2 px-3 py-2.5 text-left transition-colors ${
              sel ? 'bg-mark/[0.07]' : 'hover:bg-raised/60'
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`text-[13px] font-medium ${sel ? 'text-mark' : 'text-ink'}`}>{a.sym}</span>
                {a.earningsInDays >= 0 && a.earningsInDays <= 3 && (
                  <span className="rounded border border-warn/40 px-1 text-[9px] uppercase tracking-wider text-warn">
                    ER {a.earningsInDays}d
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <div className="h-[3px] w-16 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-mark"
                    style={{ width: `${conf * 100}%` }}
                  />
                </div>
                <span className="num text-[10px] text-ink3">σ {(m.sigma * 100).toFixed(2)}%</span>
              </div>
            </div>
            <div className="text-right">
              <div className="num text-[13px] text-ink">{m.mid.toFixed(2)}</div>
              <div className={`num text-[10.5px] ${m.ret >= 0 ? 'text-up' : 'text-down'}`}>
                {pctSigned(m.ret)}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
