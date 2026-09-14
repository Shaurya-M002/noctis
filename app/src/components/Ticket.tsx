import { useMemo, useState } from 'react';
import type { Asset } from '../data/universe';
import type { Mark } from '../lib/nyx';
import { TIERS, type Tier, type PremiumQuote } from '../lib/pricing';
import { usd, bps, pct } from '../lib/fmt';

/**
 * The ticket. Note what is NOT on it: a fee.
 *
 * You are filled at the Noctis mark with zero spread and zero commission. The only
 * thing you can pay for is a guarantee about the reopening print — priced as an
 * option on the gap, quoted in dollars, itemised.
 */
export function Ticket({
  asset, mark, quote, onTrade, disabled,
}: {
  asset: Asset;
  mark: Mark;
  quote: (t: Tier, notional: number) => PremiumQuote;
  onTrade: (side: 'BUY' | 'SELL', qty: number, tier: Tier) => void;
  disabled: boolean;
}) {
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [qty, setQty] = useState(50);
  const [tier, setTier] = useState<Tier>('BAND');

  const notional = qty * mark.mid;
  const quotes = useMemo(
    () => Object.fromEntries(TIERS.map((t) => [t.id, quote(t.id, notional)])) as Record<Tier, PremiumQuote>,
    [quote, notional]);
  const q = quotes[tier];

  return (
    <div className="space-y-3.5">
      <div className="flex gap-2">
        {(['BUY', 'SELL'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`flex-1 rounded-lg border py-2 text-[12px] font-semibold tracking-wide transition-colors ${
              side === s
                ? s === 'BUY'
                  ? 'border-up/50 bg-up/10 text-up'
                  : 'border-down/50 bg-down/10 text-down'
                : 'border-line text-ink3 hover:text-ink2'
            }`}
          >
            {s} {asset.sym}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="text-[10px] font-medium uppercase tracking-[0.11em] text-ink3">Quantity</span>
        <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-line bg-void px-3 py-2">
          <input
            type="number" min={1} step={1} value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            className="num w-full bg-transparent text-[16px] text-ink outline-none"
          />
          <span className="text-[11px] text-ink3">{asset.sym}</span>
        </div>
        <div className="mt-1.5 flex justify-between text-[10.5px] text-ink3">
          <span>Notional <span className="num text-ink2">{usd(notional)}</span></span>
          <span>Depth <span className="num text-ink2">{usd(asset.depth, 0)}</span></span>
        </div>
      </label>

      <div className="rounded-lg border border-line bg-void/60 px-3 py-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-ink2">Fill price (Noctis mark)</span>
          <span className="num text-[14px] text-mark">{mark.mid.toFixed(2)}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-[11px] text-ink2">Spread &amp; commission</span>
          <span className="num text-[13px] text-up">$0.00</span>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[10px] font-medium uppercase tracking-[0.11em] text-ink3">
            Reopen assurance
          </span>
          <span className="text-[10px] text-ink3">the only thing you pay for</span>
        </div>
        <div className="space-y-1.5">
          {TIERS.map((t) => {
            const tq = quotes[t.id];
            const sel = tier === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTier(t.id)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  sel ? 'border-mark/55 bg-mark/[0.08]' : 'border-line hover:border-line2'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-[12.5px] font-medium ${sel ? 'text-mark' : 'text-ink'}`}>
                    {t.name}
                    <span className="ml-1.5 num text-[10px] text-ink3">
                      {t.id === 'RAW' ? 'no cover' : t.id === 'PIN' ? 'k = 0σ' : `k = ${t.k}σ`}
                    </span>
                  </span>
                  <span className={`num text-[14px] ${tq.premium > 0 ? 'text-ink' : 'text-up'}`}>
                    {tq.premium > 0 ? usd(tq.premium) : 'free'}
                  </span>
                </div>
                <div className="mt-1 text-[10.5px] leading-snug text-ink3">{t.blurb}</div>
                {tq.premium > 0 && (
                  <div className="mt-1 num text-[10px] text-ink3">
                    {bps(tq.bps)} of notional · worst case {usd(tq.maxAdverse)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {q.premium > 0 && (
        <div className="rounded-lg border border-line bg-panel/70 p-3">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.11em] text-ink3">
            How that premium was built
          </div>
          <Row k={`Actuarially fair  ·  N × σ × E[(Z−k)⁺]`} v={usd(q.fair)} sub={`σ = ${pct(mark.sigma)}`} />
          <Row k="Capital scarcity load  ·  × u²" v={usd(q.utilLoad)} sub={`vault utilisation ${pct(q.utilisation, 1)}`} />
          <Row k="Concentration load  ·  × size/depth" v={usd(q.sizeLoad)} />
          <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2">
            <span className="text-[12px] text-ink">You pay</span>
            <span className="num text-[16px] text-mark">{usd(q.premium)}</span>
          </div>
          <div className="mt-1.5 text-[10px] leading-snug text-ink3">
            100% of this goes to the underwriting vault. Noctis takes 10% of the
            vault&apos;s <em>net profit</em> — nothing on your volume. We are paid for
            being calibrated, not for being used.
          </div>
        </div>
      )}

      <button
        disabled={disabled}
        onClick={() => onTrade(side, qty, tier)}
        className={`w-full rounded-lg py-2.5 text-[13px] font-semibold tracking-wide transition-colors ${
          disabled
            ? 'cursor-not-allowed bg-raised text-ink3'
            : 'bg-mark text-void hover:bg-[#e09a12]'
        }`}
      >
        {disabled
          ? 'Market reopened — auction settled'
          : `${side} ${qty} ${asset.sym} @ ${mark.mid.toFixed(2)}${q.premium > 0 ? ` + ${usd(q.premium)}` : ''}`}
      </button>
    </div>
  );
}

function Row({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[11px] text-ink2">
        {k}{sub && <span className="ml-1.5 num text-[9.5px] text-ink3">{sub}</span>}
      </span>
      <span className="num text-[11.5px] text-ink">{v}</span>
    </div>
  );
}
