import type { Venue } from '../lib/feeds';
import type { Mark } from '../lib/nyx';
import { Key } from './ui';
import { compact } from '../lib/fmt';

/**
 * Where the same token is actually printing, right now, across every DEX.
 *
 * With the cash equity shut there is no arbitrage to close these, so the prints
 * spread out. This is the single most persuasive live panel in the app because
 * it is not a model output — it is just what the chain says.
 */
export function VenueChart({
  venues, mark, reference, loading, basis,
}: { venues: Venue[]; mark: Mark; reference: number; loading: boolean; basis: number }) {
  if (loading && !venues.length) {
    return <p className="py-8 text-center text-[11.5px] text-ink3">reading the venues…</p>;
  }
  if (!venues.length) {
    return <p className="py-8 text-center text-[11.5px] text-ink3">No venues returned a print.</p>;
  }

  const px = venues.map((v) => v.price);
  const lo = Math.min(...px, mark.lo, reference);
  const hi = Math.max(...px, mark.hi, reference);
  const pad = (hi - lo) * 0.14 || 1;
  const A = lo - pad, B = hi + pad;
  const X = (v: number) => ((v - A) / (B - A)) * 100;

  const maxLiq = Math.max(...venues.map((v) => v.liquidity), 1);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Key color="var(--color-mark)" label="Noctis mark ±1σ" />
        <Key color="var(--color-tape)" label="Venue print (dot size = liquidity)" />
        <Key color="var(--color-ink3)" label="Last official reference" dash />
      </div>

      {/* the band, drawn once, with every venue laid over it */}
      <div className="relative mb-4 h-14">
        <div
          className="absolute inset-y-5 rounded-sm bg-mark/25"
          style={{ left: `${X(mark.lo)}%`, width: `${X(mark.hi) - X(mark.lo)}%` }}
        />
        <div className="absolute inset-y-3 w-[2px] rounded bg-mark"
             style={{ left: `${X(mark.mid)}%` }} />
        <div className="absolute inset-y-3 w-[1.5px] bg-ink3"
             style={{ left: `${X(reference)}%`, backgroundImage: 'repeating-linear-gradient(180deg,var(--color-ink3) 0 3px,transparent 3px 6px)' }} />
        {venues.map((v, i) => {
          const r = 5 + 7 * Math.sqrt(v.liquidity / maxLiq);
          return (
            <div
              key={i}
              title={`${v.dex} ${v.pair} · ${v.price.toFixed(2)} · liq ${compact(v.liquidity)} · 24h vol ${compact(v.volume24h)}`}
              className="absolute top-1/2 rounded-full border-2 border-void bg-tape"
              style={{
                left: `${X(v.price)}%`, width: r * 2, height: r * 2,
                marginLeft: -r, marginTop: -r,
                opacity: 0.55 + 0.45 * (v.liquidity / maxLiq),
              }}
            />
          );
        })}
        <div className="absolute inset-x-0 bottom-0 flex justify-between num text-[10px] text-ink3">
          <span>{A.toFixed(2)}</span>
          <span className="text-mark">mark {mark.mid.toFixed(2)}</span>
          <span>{B.toFixed(2)}</span>
        </div>
      </div>

      {/* The mark usually sits ABOVE every print. That looks wrong until you know
          why, so say why. */}
      <p className="mb-3 rounded-lg border border-line bg-void/50 px-3 py-2.5 text-[11px] leading-relaxed text-ink3">
        The mark sits <span className="text-mark">above the whole cluster</span>, and
        that is deliberate. Every print here carries the{' '}
        <span className="num text-ink2">{(basis * 100).toFixed(2)}%</span> weekend
        basis — the discount holders accept for wanting out before anyone can hedge
        against the cash equity. That discount is the price of liquidity on a
        Sunday, and it disappears at the opening bell. Noctis is estimating{' '}
        <em>Monday&apos;s print</em>, so it prices the basis out rather than
        inheriting it.
      </p>

      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-line bg-void/50 text-left text-[9.5px] uppercase tracking-[0.09em] text-ink3">
              <th className="px-2.5 py-1.5 font-medium">Venue</th>
              <th className="px-2.5 py-1.5 font-medium">Pair</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Print</th>
              <th className="px-2.5 py-1.5 text-right font-medium">vs mark</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Liquidity</th>
              <th className="px-2.5 py-1.5 text-right font-medium">24h vol</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {venues.map((v, i) => {
              const d = (v.price - mark.mid) / mark.mid;
              const outside = Math.abs(v.price - mark.mid) > mark.sigmaAbs;
              return (
                <tr key={i} className="text-ink2">
                  <td className="px-2.5 py-1.5 text-ink">{v.dex}</td>
                  <td className="px-2.5 py-1.5 text-ink3">{v.pair}</td>
                  <td className="num px-2.5 py-1.5 text-right text-tape">{v.price.toFixed(2)}</td>
                  <td className={`num px-2.5 py-1.5 text-right ${outside ? 'text-down' : 'text-ink3'}`}>
                    {d >= 0 ? '+' : '−'}{(Math.abs(d) * 100).toFixed(2)}%
                  </td>
                  <td className="num px-2.5 py-1.5 text-right text-ink3">{compact(v.liquidity)}</td>
                  <td className="num px-2.5 py-1.5 text-right text-ink3">{compact(v.volume24h)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
