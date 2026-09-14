import { Stat } from './ui';
import { usd, usdSigned, pct, compact } from '../lib/fmt';

/**
 * The other side of every premium. Someone has to be short the gap, and the
 * demo is dishonest if it hides them.
 */
export function Vault({
  tvl, exposure, premiums, payouts, initialTvl, openReceipts,
}: {
  tvl: number; exposure: number; premiums: number; payouts: number;
  initialTvl: number; openReceipts: number;
}) {
  const util = tvl > 0 ? Math.min(1, exposure / tvl) : 0;
  const net = premiums - payouts;
  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Underwriting TVL" value={compact(tvl)} sub={`${usdSigned(tvl - initialTvl)} this session`} />
        <Stat label="Capital at risk" value={compact(exposure)} sub={`${openReceipts} open receipt${openReceipts === 1 ? '' : 's'}`} />
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between text-[10.5px]">
          <span className="text-ink3">Utilisation</span>
          <span className="num text-ink2">{pct(util, 1)}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${util > 0.8 ? 'bg-down' : util > 0.5 ? 'bg-warn' : 'bg-mark'}`}
            style={{ width: `${util * 100}%` }}
          />
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-ink3">
          Premiums load quadratically with utilisation, so the vault&apos;s last dollar
          of capacity is never sold at the price of its first.
        </p>
      </div>

      <div className="rounded-lg border border-line bg-void/50 p-3">
        <Row k="Premiums collected" v={usd(premiums)} tone="up" />
        <Row k="Payouts made" v={payouts > 0 ? `−${usd(payouts)}` : usd(0)} tone={payouts > 0 ? 'down' : undefined} />
        <div className="mt-1.5 flex items-baseline justify-between border-t border-line pt-1.5">
          <span className="text-[11.5px] text-ink">LP net</span>
          <span className={`num text-[15px] ${net >= 0 ? 'text-up' : 'text-down'}`}>{usdSigned(net)}</span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-[10.5px] text-ink3">Protocol take (10% of net profit)</span>
          <span className="num text-[10.5px] text-ink2">{usd(Math.max(0, net) * 0.1)}</span>
        </div>
      </div>

      <p className="text-[10px] leading-relaxed text-ink3">
        When the model is badly calibrated the vault loses money and the protocol
        earns nothing. There is no volume fee to cushion that. The incentive to be
        right is the business model.
      </p>
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: 'up' | 'down' }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="text-[11px] text-ink2">{k}</span>
      <span className={`num text-[12px] ${tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-ink'}`}>{v}</span>
    </div>
  );
}
