import type { Receipt } from '../lib/useNoctis';
import { usd, usdSigned } from '../lib/fmt';

export function Receipts({ receipts }: { receipts: Receipt[] }) {
  if (!receipts.length) {
    return (
      <p className="py-6 text-center text-[11.5px] text-ink3">
        No positions yet. Buy something in the dark and see what the auction does to it.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {receipts.map((r) => <Card key={r.id} r={r} />)}
    </div>
  );
}

function Card({ r }: { r: Receipt }) {
  const s = r.settlement;
  return (
    <div className={`rise rounded-lg border p-3 ${
      s ? (s.breached ? 'border-truth/40 bg-truth/[0.05]' : 'border-line bg-panel/60')
        : 'border-mark/30 bg-mark/[0.04]'
    }`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className={`text-[12px] font-semibold ${r.side === 'BUY' ? 'text-up' : 'text-down'}`}>
            {r.side}
          </span>
          <span className="num text-[12.5px] text-ink">{r.qty} {r.sym}</span>
          <span className="num text-[11px] text-ink3">@ {r.fillPrice.toFixed(2)}</span>
        </div>
        <span className={`chip ${r.tier === 'RAW' ? '' : 'border-mark/50 text-mark'}`}>
          {r.tier}
        </span>
      </div>

      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px]">
        <KV k="Premium paid" v={r.premium > 0 ? usd(r.premium) : '—'} />
        <KV k="Deductible" v={r.tier === 'RAW' ? 'all of it' : r.tier === 'PIN' ? 'none' : `±${r.sigmaAbs.toFixed(2)}`} />
        <KV k="Receipt" v={r.id} />
        <KV k="Traded at" v={`+${r.atHours.toFixed(1)}h`} />
      </div>

      {s && (
        <div className="mt-2 border-t border-line pt-2">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px]">
            <KV k="Opening print" v={r.openPrice!.toFixed(2)} tone="truth" />
            <KV k="Gap vs fill" v={`${(((r.openPrice! - r.fillPrice) / r.fillPrice) * 100).toFixed(2)}%`} />
            <KV k="Vault payout" v={s.payout > 0 ? usd(s.payout) : '$0.00'} tone={s.payout > 0 ? 'truth' : undefined} />
            <KV k="Naked P&L" v={usdSigned(s.nakedPnl)} tone={s.nakedPnl >= 0 ? 'up' : 'down'} />
          </div>
          <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2">
            <span className="text-[11px] text-ink2">Net after assurance</span>
            <span className={`num text-[15px] ${s.netPnl >= 0 ? 'text-up' : 'text-down'}`}>
              {usdSigned(s.netPnl)}
            </span>
          </div>
          {s.breached && (
            <p className="mt-1.5 text-[10px] leading-snug text-truth">
              Gap breached the band. The vault paid {usd(s.payout)}.
              {' '}{usd(s.payout - r.premium)} more than the premium you handed it.
            </p>
          )}
          {!s.breached && r.tier !== 'RAW' && s.adverse === 0 && (
            <p className="mt-1.5 text-[10px] leading-snug text-ink3">
              The gap went your way, so nothing was owed. Assurance is insurance,
              not a swap, the upside was always yours. The vault keeps the{' '}
              {usd(r.premium)}.
            </p>
          )}
          {!s.breached && r.tier !== 'RAW' && s.adverse > 0 && (
            <p className="mt-1.5 text-[10px] leading-snug text-ink3">
              Moved against you by {s.adverse.toFixed(2)}, inside the{' '}
              {s.deductible.toFixed(2)} you agreed to absorb. You paid {usd(r.premium)}
              {' '}for a night of knowing your downside. The vault keeps it.
            </p>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        <span className="rounded border border-line2 px-1 py-px text-[8.5px] uppercase tracking-wider text-ink3">
          simulated
        </span>
        <span className="truncate font-mono text-[9px] text-ink3" title={`${r.sig}, a synthetic reference, not a transaction. Real signatures are in docs/DEVNET.md.`}>
          ref {r.sig}
        </span>
      </div>
    </div>
  );
}

function KV({ k, v, tone }: { k: string; v: string; tone?: 'up' | 'down' | 'truth' }) {
  const c = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : tone === 'truth' ? 'text-truth' : 'text-ink';
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-ink3">{k}</span>
      <span className={`num ${c}`}>{v}</span>
    </div>
  );
}
