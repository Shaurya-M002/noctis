import type { Asset } from '../data/universe';
import type { Baselines, Mark } from '../lib/nyx';
import { bps, pct, pctSigned } from '../lib/fmt';

/**
 * Four answers to one question. This panel is the whole pitch: everyone else
 * either refuses to answer, answers with yesterday's number, or answers with a
 * number one $40k order invented.
 */
export function PriceHero({
  asset, mark, base, dark, weekend, openPrint, scorecard,
}: {
  asset: Asset; mark: Mark; base: Baselines; dark: boolean;
  /** True only for weekend/holiday — when Pyth's own schedule says `C`. */
  weekend?: boolean;
  openPrint?: number;
  scorecard?: { atHours: number; mark: Mark; base: Baselines } | null;
}) {
  if (openPrint != null && scorecard) {
    return <Settled asset={asset} scorecard={scorecard} openPrint={openPrint} />;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* The Noctis answer */}
      <div className="rounded-xl border border-mark/30 bg-mark/[0.06] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-mark/80">
              Noctis mark · {asset.sym}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="num text-[38px] leading-none text-ink">{mark.mid.toFixed(2)}</span>
              <span className="num text-[15px] text-mark">± {mark.sigmaAbs.toFixed(2)}</span>
            </div>
            <div className="mt-2 num text-[12px] text-ink2">
              1σ band <span className="text-ink">{mark.lo.toFixed(2)} – {mark.hi.toFixed(2)}</span>
              <span className="text-ink3"> · {pct(mark.sigma)} </span>
              <span className="text-ink3">· {pctSigned(mark.ret)} vs close</span>
            </div>
          </div>
          <Confidence v={mark.confidence} />
        </div>
        <p className="mt-3 border-t border-mark/20 pt-2.5 text-[11.5px] leading-relaxed text-ink2">
          Not a last trade. A conditional expectation of Monday&apos;s opening
          print, published with a σ that is forecast error for that specific
          auction — for a window that the feed above, by its own schedule, does
          not cover.
        </p>
      </div>

      {/* What you'd have to use instead */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
        {/* Be exact about Pyth. Its equity feeds publish 24/5 — verified on
            mainnet, ticking every ~15s pre-market — and only the weekend is
            marked `C` in its own schedule string. Claiming otherwise is both
            wrong and a weaker argument. */}
        <Alt
          label="Pyth equity feed"
          value={weekend ? '—' : base.staleOracle.price.toFixed(2)}
          note={
            weekend
              ? 'Pyth schedule marks Sat/Sun “C”. Last publish Friday 16:00 ET.'
              : base.staleOracle.status === 'CLOSED'
                ? 'Publishing — 24/5 covers pre-market, after-hours and overnight.'
                : 'Trading. This is the settlement truth Noctis resolves back to.'
          }
          bad={weekend}
        />
        <Alt
          label="Last official close"
          value={base.lastClose.toFixed(2)}
          note={dark ? 'Frozen since Friday 16:00 ET. Ignores everything since.' : 'Frozen at the last bell.'}
          bad
        />
        <Alt
          label="Thin 24/7 order book"
          value={base.thinBook.last.toFixed(2)}
          note={`bid ${base.thinBook.bid.toFixed(2)} / ask ${base.thinBook.ask.toFixed(2)} · ${bps(base.thinBook.spreadBps)} to cross`}
          bad={base.thinBook.spreadBps > 40}
          accent="tape"
        />
      </div>
    </div>
  );
}

function Alt({
  label, value, note, bad, accent,
}: { label: string; value: string; note: string; bad?: boolean; accent?: 'tape' }) {
  return (
    <div className="rounded-xl border border-line bg-panel/60 p-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink3">{label}</div>
      <div className={`mt-1.5 num text-[21px] leading-none ${accent === 'tape' ? 'text-tape' : bad ? 'text-ink3' : 'text-ink'}`}>
        {value}
      </div>
      <div className="mt-1.5 text-[10.5px] leading-snug text-ink3">{note}</div>
    </div>
  );
}

function Confidence({ v }: { v: number }) {
  const R = 22, C = 2 * Math.PI * R;
  return (
    <div className="relative shrink-0" title="Model confidence: 1 − σ/3%">
      <svg width="58" height="58" aria-hidden>
        <circle cx="29" cy="29" r={R} fill="none" stroke="#20242c" strokeWidth="4" />
        <circle
          cx="29" cy="29" r={R} fill="none" stroke="#c98500" strokeWidth="4"
          strokeLinecap="round" strokeDasharray={`${C * v} ${C}`}
          transform="rotate(-90 29 29)"
          style={{ transition: 'stroke-dasharray .5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="num text-[13px] leading-none text-ink">{Math.round(v * 100)}</div>
          <div className="text-[8px] uppercase tracking-wider text-ink3">conf</div>
        </div>
      </div>
    </div>
  );
}

/** After the auction there is a real price again, and a scorecard. */
function Settled({
  asset, scorecard, openPrint,
}: {
  asset: Asset;
  scorecard: { atHours: number; mark: Mark; base: Baselines };
  openPrint: number;
}) {
  const { mark, base, atHours } = scorecard;
  const errMark = Math.abs(openPrint - mark.mid);
  const errClose = Math.abs(openPrint - base.lastClose);
  const errBook = Math.abs(openPrint - base.thinBook.last);
  const inside = errMark <= mark.sigmaAbs;
  const worst = Math.max(errMark, errClose, errBook, 1e-9);

  const rows = [
    { k: 'Noctis mark', v: mark.mid, e: errMark, tone: 'mark' as const },
    { k: 'Thin 24/7 book', v: base.thinBook.last, e: errBook, tone: 'tape' as const },
    { k: 'Last official close', v: base.lastClose, e: errClose, tone: 'ink' as const },
  ];

  return (
    <div className="rise grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="rounded-xl border border-truth/35 bg-truth/[0.06] p-4">
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-truth/80">
          Official opening print · {asset.sym}
        </div>
        <div className="mt-2 num text-[38px] leading-none text-ink">{openPrint.toFixed(2)}</div>
        <div className="mt-2 num text-[12px] text-ink2">
          {pctSigned((openPrint - base.lastClose) / base.lastClose)} vs Friday close
        </div>
        <p className="mt-3 border-t border-truth/20 pt-2.5 text-[11.5px] leading-relaxed text-ink2">
          There is a real price again. Everything below is scored against the
          answers as they stood at <span className="num">+{atHours.toFixed(1)}h</span>,
          when you actually had to act — not at the bell, when every estimate has
          already converged on the truth.
        </p>
      </div>

      <div className="rounded-xl border border-line bg-panel/60 p-4">
        <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.1em] text-ink3">
          How far each answer was from the print
          <span className="ml-1.5 num normal-case tracking-normal text-ink3">
            (as of +{atHours.toFixed(1)}h)
          </span>
        </div>
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.k}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11.5px] text-ink">{r.k}</span>
                <span className="num text-[11.5px] text-ink2">
                  {r.v.toFixed(2)} <span className="text-ink3">· off by {r.e.toFixed(2)}</span>
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded bg-void">
                <div
                  className={`h-full rounded ${r.tone === 'mark' ? 'bg-mark' : r.tone === 'tape' ? 'bg-tape' : 'bg-line2'}`}
                  style={{ width: `${(r.e / worst) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        {errBook < errMark && (
          <p className="mt-3 rounded-md border border-line bg-void/60 px-2.5 py-2 text-[10.5px] leading-snug text-ink3">
            On <em>this</em> night the thin book happened to land closer. Over 800
            nights it does not — the backtest below has Noctis at 3.58% RMSE against
            the book&apos;s 5.01%. One draw is one draw. And neither the book nor the
            close published a band, which is why neither of them could have
            underwritten the trade you just settled.
          </p>
        )}
        <div className="mt-3 border-t border-line pt-2 text-[10.5px] leading-snug text-ink3">
          Noctis published ±{mark.sigmaAbs.toFixed(2)} and the print landed{' '}
          <span className={inside ? 'text-up' : 'text-down'}>
            {inside ? 'inside that band' : `${(errMark / mark.sigmaAbs).toFixed(1)}σ away`}
          </span>
          . {inside ? 'Nobody was owed anything.' : 'Every basis point past the band was the vault\u2019s to pay.'}
        </div>
      </div>
    </div>
  );
}
