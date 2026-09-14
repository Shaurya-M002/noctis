import type { Executable, Venue } from '../lib/feeds';
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
  venues, mark, reference, loading, basis, executable,
}: {
  venues: Venue[]; mark: Mark; reference: number; loading: boolean;
  basis: number; executable: Executable[];
}) {
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

      {/* Quoted pool prices are not tradeable prices, and saying so is the
          difference between an honest panel and a misleading one. */}
      {executable.length > 0 && (
        <div className="mb-3 rounded-lg border border-tape/30 bg-tape/[0.05] p-3">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-tape/90">
            What you can actually trade at — Jupiter router, right now
          </div>
          <div className="space-y-1">
            {executable.map((e) => (
              <div key={e.size} className="flex items-baseline justify-between gap-2 text-[11.5px]">
                <span className="num text-ink3">${(e.size / 1000).toFixed(0)}k</span>
                <span className="num text-ink2">
                  buy <span className="text-ink">{e.buyPrice.toFixed(2)}</span>
                  {' / '}sell <span className="text-ink">{e.sellPrice.toFixed(2)}</span>
                </span>
                <span className={`num ${e.roundTrip > 0.02 ? 'text-down' : 'text-warn'}`}>
                  {(e.roundTrip * 100).toFixed(2)}% round trip
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 border-t border-line pt-2 text-[10px] leading-snug text-ink3">
            The table below is what each pool <em>quotes</em>. This is what the
            router will actually fill. They are not the same number, and the gap
            between them is where most tokenised-equity &ldquo;arbitrage&rdquo;
            headlines die — the router walks straight past a stale pool sitting 10%
            away, because there is no size behind it.
            {executable[0] && (
              <> Note the scale: assurance on this name costs tens of basis points,
              against {(executable[0].roundTrip * 100).toFixed(2)}% just to get in
              and out.</>
            )}
          </p>
        </div>
      )}

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
