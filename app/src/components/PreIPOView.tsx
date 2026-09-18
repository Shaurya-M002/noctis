import { useMemo } from 'react';
import type { usePreIPO } from '../lib/usePreIPO';
import { gapSigma } from '../lib/preipo';
import { Panel, Stat } from './ui';
import { Sources } from './Sources';
import { Ticket } from './Ticket';
import { compact, pct, pctSigned } from '../lib/fmt';
import type { Asset } from '../data/universe';

/**
 * Pre-IPO: the same problem with the bell removed.
 *
 * An xStock is unpriced for 48 hours a week. A pre-IPO token has no exchange at
 * all, so the only reference is a mark its issuer publishes and the gap between
 * that and the on-chain price never closes. It is the weekend, permanently, and an
 * order of magnitude wider.
 */
export function PreIPOView({ s }: { s: ReturnType<typeof usePreIPO> }) {
  const snap = s.snap;
  const q = snap?.quotes.find((x) => x.sym === s.sym);
  const st = snap?.stats[s.sym];
  const g = useMemo(() => gapSigma(st, s.horizonDays * 24, s.vol?.horizonSd),
                    [st, s.horizonDays, s.vol]);

  if (!snap || !q) {
    return (
      <Panel title="Pre-IPO, PreStocks on mainnet">
        <p className="py-10 text-center text-[12px] text-ink3">
          {s.error ? `Feeds unavailable: ${s.error}` : 'Reading Jupiter, Tessera and the recorded gap log…'}
        </p>
      </Panel>
    );
  }

  const spread = Math.max(...snap.quotes.map((x) => x.gap)) - Math.min(...snap.quotes.map((x) => x.gap));
  // The ticket is written against the gap, so the "asset" it prices is notional.
  const asset = {
    sym: q.sym, under: q.sym, name: q.company, sector: q.group, mint: q.mint,
    close: q.mark, beta: { MKT: 0, SECT: 0, CRYPTO: 0, FX: 0, RATES: 0 },
    idioVol: 0, totalVol: 0, depth: Math.max(20_000, q.liquidity), earningsInDays: -1,
  } as unknown as Asset;

  return (
    <div className="grid gap-4 xl:grid-cols-[210px_minmax(0,1fr)_340px]">
      {/* rail */}
      <div className="space-y-4">
        <Panel title="Pre-IPO · mainnet" sub="No exchange. No bell. Ever." pad="p-0">
          <div className="divide-y divide-line">
            {snap.quotes.map((x) => (
              <button key={x.sym} onClick={() => s.setSym(x.sym)}
                className={`grid w-full grid-cols-[1fr_auto] items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                  x.sym === s.sym ? 'bg-mark/[0.07]' : 'hover:bg-raised/60'}`}>
                <div className="min-w-0">
                  <div className={`truncate text-[12.5px] ${x.sym === s.sym ? 'text-mark' : 'text-ink'}`}>
                    {x.company}
                  </div>
                  <div className="num text-[9.5px] text-ink3">{compact(x.liquidity)} liq</div>
                </div>
                <div className="text-right">
                  <div className="num text-[12px] text-ink">{x.token.toFixed(2)}</div>
                  <div className={`num text-[10.5px] ${x.gap >= 0 ? 'text-up' : 'text-down'}`}>
                    {pctSigned(x.gap)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="The cross-section">
          <div className="space-y-2">
            <Stat label="Widest gap spread" value={pct(spread)} tone="mark" size="sm"
                  sub="between the richest and cheapest name, right now" />
            <Stat label="Complex-wide basis" value={pctSigned(snap.basis)} size="sm"
                  sub="the median, a liquidity premium, not a forecast" />
            <p className="border-t border-line pt-2 text-[10px] leading-snug text-ink3">
              For comparison, the same measurement across xStocks on a weekend is
              about 1.3 points. There is no exchange here to pull these back.
            </p>
          </div>
        </Panel>
      </div>

      {/* centre */}
      <div className="space-y-4">
        <Panel
          title={`${q.company}, what is it worth?`}
          sub="Nobody can tell you. There is no exchange, so there is no price to be right about, only a mark, and a token that disagrees with it."
        >
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-line bg-panel/60 p-4">
              <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink3">
                Issuer NAV mark
              </div>
              <div className="mt-2 num text-[30px] leading-none text-ink">{q.mark.toFixed(2)}</div>
              <div className="mt-1.5 text-[10.5px] leading-snug text-ink3">
                averaged from off-chain secondary-market data
              </div>
            </div>
            <div className="rounded-xl border border-tape/30 bg-tape/[0.06] p-4">
              <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-tape/80">
                On-chain, right now
              </div>
              <div className="mt-2 num text-[30px] leading-none text-tape">{q.token.toFixed(2)}</div>
              <div className="mt-1.5 num text-[10.5px] text-ink3">
                {compact(q.liquidity)} liquidity · 24h {pctSigned(q.change24h)}
              </div>
            </div>
            <div className={`rounded-xl border p-4 ${
              Math.abs(q.gap) > 0.05 ? 'border-down/35 bg-down/[0.06]' : 'border-mark/30 bg-mark/[0.06]'}`}>
              <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink3">
                The gap
              </div>
              <div className={`mt-2 num text-[30px] leading-none ${
                Math.abs(q.gap) > 0.05 ? 'text-down' : 'text-mark'}`}>{pctSigned(q.gap)}</div>
              <div className="mt-1.5 text-[10.5px] leading-snug text-ink3">
                this is the thing you can insure
              </div>
            </div>
          </div>

          {st && (
            <div className="mt-3 rounded-lg border border-line bg-void/50 p-3">
              <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-ink3">
                Which side is actually moving, measured over {st.hours.toFixed(1)}h, {st.n} samples
              </div>
              <Bar label="issuer mark" v={st.markVel} max={Math.max(st.markVel, st.tokenVel)} tone="ink" />
              <Bar label="on-chain token" v={st.tokenVel} max={Math.max(st.markVel, st.tokenVel)} tone="tape" />
              <p className="mt-2 text-[10px] leading-snug text-ink3">
                {st.tokenVel > st.markVel * 5 ? (
                  <>The mark is close to static and the token moves{' '}
                  <span className="num text-ink2">{(st.tokenVel / Math.max(st.markVel, 1e-9)).toFixed(0)}×</span>{' '}
                  faster. Almost all of the gap&apos;s movement is the token, so what
                  you are insuring is on-chain noise against a slow reference.</>
                ) : (
                  <>Unusually, the <em>mark</em> is moving as fast as the token, and this
                  name only printed{' '}
                  <span className="num text-ink2">{st.distinctTokens}</span> distinct
                  prices in {st.n} samples. Here the token is the stale side, not the
                  mark. Same symptom, opposite cause.</>
                )}
              </p>
            </div>
          )}
        </Panel>

        <Panel title="Every name, and every disagreement"
               sub="Two issuers tokenise three of the same companies. They do not agree.">
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-line bg-void/50 text-left text-[9.5px] uppercase tracking-[0.09em] text-ink3">
                  <th className="px-2.5 py-1.5 font-medium">Company</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Mark</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">On-chain</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Gap</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Implied val</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Rival issuer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {snap.quotes.map((x) => {
                  const dis = x.rivalValuation && x.markValuation
                    ? (x.rivalValuation - x.markValuation) / x.markValuation : null;
                  return (
                    <tr key={x.sym} className={x.sym === s.sym ? 'bg-mark/[0.05]' : ''}>
                      <td className="px-2.5 py-1.5 text-ink">{x.company}</td>
                      <td className="num px-2.5 py-1.5 text-right text-ink2">{x.mark.toFixed(2)}</td>
                      <td className="num px-2.5 py-1.5 text-right text-tape">{x.token.toFixed(2)}</td>
                      <td className={`num px-2.5 py-1.5 text-right ${Math.abs(x.gap) > 0.05 ? 'text-down' : 'text-ink3'}`}>
                        {pctSigned(x.gap)}
                      </td>
                      <td className="num px-2.5 py-1.5 text-right text-ink3">
                        {x.markValuation ? `$${(x.markValuation / 1e9).toFixed(0)}B` : '—'}
                      </td>
                      <td className={`num px-2.5 py-1.5 text-right ${dis ? 'text-warn' : 'text-ink3'}`}>
                        {x.rivalValuation ? `$${(x.rivalValuation / 1e9).toFixed(0)}B (${pctSigned(dis ?? 0, 0)})` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 text-[10.5px] leading-relaxed text-ink3">
            Two regulated-ish issuers, both holding real exposure, both publishing
            on-chain, disagreeing by tens of percent on what the same company is
            worth. That disagreement is not noise to be smoothed away, it is the
            honest width of the answer, and it is exactly what a σ is for.
          </p>
        </Panel>
      </div>

      {/* ticket */}
      <div className="space-y-4">
        <Panel title="NAV-gap cover"
               sub={`Insure the gap, not the price. Settles on the published mark at T+${s.horizonDays}d.`}>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.11em] text-ink3">Horizon</span>
            {[1, 7, 30].map((d) => (
              <button key={d} onClick={() => s.setHorizonDays(d)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] ${
                  s.horizonDays === d ? 'border-mark/60 bg-mark/10 text-mark'
                    : 'border-line text-ink3 hover:text-ink2'}`}>
                {d}d
              </button>
            ))}
          </div>

          <div className={`mb-3 rounded-lg border p-3 ${
            g.confident ? 'border-line bg-void/50' : 'border-warn/40 bg-warn/[0.06]'}`}>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-ink2">σ of the gap at {s.horizonDays}d</span>
              <span className="num text-[15px] text-mark">{pct(g.sigma)}</span>
            </div>

            <div className="mt-2 space-y-1 border-t border-line pt-2 text-[10px]">
              <Cand label="diffusion, from our log" v={g.diffusion} win={g.basis === 'diffusion'} />
              <Cand label="the band the gap sits in" v={g.stationary} win={g.basis === 'stationary'} />
              <Cand label="token vol, 38d of candles" v={g.tokenBound ?? 0} win={g.basis === 'token'} />
              <Cand label="floor. We will not claim tighter" v={0.02} win={g.basis === 'floor'} />
            </div>

            <p className="mt-2 border-t border-line pt-2 text-[10px] leading-snug text-ink3">
              Four readings, and we take the tightest that is still defensible. The
              gap cannot move faster than its two legs, and one of them —{' '}
              {s.vol ? <>the token, over{' '}
                <span className="num">{s.vol.days.toFixed(0)}</span> days of candles
                with <span className="num">{compact(s.vol.medianHourlyVolume)}</span>{' '}
                median hourly volume</> : 'the token'}, is measurable. That ceiling is
              real data; the rest is bounded by it.
            </p>

            {!g.confident && (
              <p className="mt-1.5 border-t border-warn/20 pt-1.5 text-[10px] leading-snug text-warn">
                Not calibrated at this horizon. {st?.n ?? 0} samples over{' '}
                {(st?.hours ?? 0).toFixed(1)}h of our own log cannot score a{' '}
                {s.horizonDays}-day move, nothing has been held that long yet. The
                recorder is still running and this box updates with it.
              </p>
            )}

            {st?.realised && (
              <div className="mt-2 rounded border border-line bg-panel/60 p-2">
                <div className="mb-1 text-[9.5px] font-medium uppercase tracking-[0.1em] text-ink3">
                  What we CAN score, {(st.scorableHours * 60).toFixed(0)} min horizon
                </div>
                <div className="flex items-baseline justify-between text-[10.5px]">
                  <span className="text-ink3">realised σ</span>
                  <span className="num text-ink">{pct(st.realised.sigma)}</span>
                </div>
                <div className="flex items-baseline justify-between text-[10.5px]">
                  <span className="text-ink3">inside ±1σ</span>
                  <span className={`num ${Math.abs(st.realised.coverage1 - 0.68) < 0.12 ? 'text-up' : 'text-warn'}`}>
                    {pct(st.realised.coverage1, 0)} <span className="text-ink3">of {st.realised.n}</span>
                  </span>
                </div>
                <p className="mt-1 text-[9.5px] leading-snug text-ink3">
                  A calibrated σ gives 68%. This is the same check the equity backtest
                  runs, at the only horizon this log is old enough to answer.
                </p>
              </div>
            )}
          </div>

          <Ticket asset={asset} mark={{ mid: q.token, sigma: g.sigma, sigmaAbs: q.token * g.sigma } as never}
                  quote={s.quote} onTrade={() => {}} disabled quoteOnly
                  settlesOn={`the issuer's published mark at T+${s.horizonDays}d`} />
        </Panel>

        <Panel title="Data sources" sub="Public, keyless, and checkable.">
          <Sources snap={null} ageSeconds={s.ageSeconds} onRefresh={s.refresh}
                   loading={s.loading} error={s.error} extra={snap.sources} />
          <p className="mt-2 text-[10px] leading-snug text-ink3">
            The gap history is this repo&apos;s own committed log, read back from
            GitHub. Neither issuer publishes price history, so the only way to have
            any was to start recording.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function Cand({ label, v, win }: { label: string; v: number; win: boolean }) {
  return (
    <div className={`flex items-baseline justify-between ${win ? 'text-mark' : 'text-ink3'}`}>
      <span>{win ? '→ ' : '   '}{label}</span>
      <span className="num">{(v * 100).toFixed(2)}%</span>
    </div>
  );
}

function Bar({ label, v, max, tone }: { label: string; v: number; max: number; tone: 'ink' | 'tape' }) {
  return (
    <div className="mb-1.5">
      <div className="flex items-baseline justify-between text-[10.5px]">
        <span className="text-ink2">{label}</span>
        <span className="num text-ink3">{(v * 100).toFixed(3)}% / sample</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-void">
        <div className={`h-full rounded-full ${tone === 'tape' ? 'bg-tape' : 'bg-line2'}`}
             style={{ width: `${max > 0 ? (v / max) * 100 : 0}%` }} />
      </div>
    </div>
  );
}
