import type { MarketCalendar } from '../lib/schedule';
import { liveness, MAX_AGE_SECONDS, type PythPrice, type PythRead } from '../lib/pyth';
import type { SessionState } from '../lib/market';
import { fmtDuration } from '../lib/market';
import { pctSigned } from '../lib/fmt';

/**
 * Pyth, read off mainnet, next to the token that is still trading.
 *
 * The panel exists to hold two facts side by side that are easy to conflate, and
 * the distinction is the entire point of this project:
 *
 *   the exchange session   from Pyth's own schedule string
 *   the feed's liveness    from publish_time
 *
 * On a Wednesday at 09:27 those read CLOSED and LIVE, Pyth ticks all night, and
 * saying otherwise would be wrong. On a Saturday they read CLOSED and DARK, and the
 * dark timer climbs toward 48 hours. That second state is the whole thesis, told in
 * the incumbent's numbers rather than ours.
 */
export function PythMark({
  read, under, sym, session, calendar, chainPrice, noctisMark, nowMs,
}: {
  read: PythRead | null;
  under: string;
  sym: string;
  session: SessionState;
  calendar: MarketCalendar;
  chainPrice: number | null;
  noctisMark: number;
  nowMs: number;
}) {
  const p: PythPrice | undefined = read?.byUnder[under];
  const state = liveness(p, nowMs);
  const age = p ? nowMs / 1000 - p.publishTime : 0;

  if (!read) {
    return <p className="py-8 text-center text-[11.5px] text-ink3">reading Solana mainnet…</p>;
  }

  if (!p) {
    return (
      <div className="rounded-lg border border-down/40 bg-down/[0.06] p-3">
        <p className="text-[11.5px] text-down">
          No live Pyth account for {under}. {read.report.detail}
        </p>
        {read.rejected.length > 0 && (
          <ul className="mt-2 space-y-0.5 font-mono text-[10px] text-ink3">
            {read.rejected.map((r) => (
              <li key={r.account}>{r.account.slice(0, 8)}… rejected: {r.why}</li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px] leading-snug text-ink3">
          The rest of the page is unaffected, Pyth is read on its own independent
          cycle precisely so that this cannot take anything else down with it.
        </p>
      </div>
    );
  }

  const gap = chainPrice ? Math.log(chainPrice / p.price) : null;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* ── Pyth's side ─────────────────────────────────────────────── */}
      <div className={`rounded-xl border p-4 ${
        state === 'dark' ? 'border-warn/40 bg-warn/[0.06]' : 'border-line bg-panel/60'
      }`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink3">
            Pyth · Equity.US.{under}/USD
          </span>
          <span className={`chip ${
            state === 'live' ? 'border-up/50 text-up'
              : state === 'dark' ? 'border-warn/50 text-warn' : 'border-line2 text-ink2'
          }`}>
            {state === 'live' ? 'publishing' : state === 'lagging' ? 'lagging' : 'dark'}
          </span>
        </div>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="num text-[34px] leading-none text-ink">{p.price.toFixed(2)}</span>
          <span className="num text-[14px] text-tape">± {p.conf.toFixed(4)}</span>
        </div>
        <div className="mt-1 num text-[11px] text-ink3">
          confidence {p.confBps.toFixed(2)} bps, how much Pyth&apos;s publishers
          disagree <em>right now</em>
        </div>

        <div className="mt-3 space-y-1 border-t border-line pt-2.5 text-[11px]">
          <Row k="published"
               v={`${new Date(p.publishTime * 1000).toLocaleString('en-US', {
                 timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'medium',
               })} ET`} />
          <Row k="age" v={age < 90 ? `${Math.round(age)}s ago` : `${fmtDuration(age / 3600)} ago`}
               tone={state === 'dark' ? 'warn' : undefined} />
          <Row k="slot" v={p.postedSlot.toLocaleString()} />
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-ink3">account</span>
            <a href={`https://solscan.io/account/${p.account}`} target="_blank" rel="noreferrer"
               className="num text-[10px] text-tape hover:underline">
              {p.account.slice(0, 8)}…{p.account.slice(-6)}
            </a>
          </div>
        </div>

        {state === 'dark' && (
          <div className="pulse mt-3 rounded-lg border border-warn/50 bg-warn/[0.09] px-3 py-2.5">
            <div className="num text-[13px] text-warn">
              PYTH IS DARK, {fmtDuration(age / 3600)} since the last publish
            </div>
            <p className="mt-1 text-[10.5px] leading-snug text-ink2">
              Pyth&apos;s own schedule marks today
              {' '}<span className="num">&ldquo;C&rdquo;</span>. Its equity feeds run
              Sunday 20:00 ET to Friday 20:00 ET and then stop for 48 hours. There is
              no price here for a confidence interval to attach to.
            </p>
          </div>
        )}
      </div>

      {/* ── the contrast ────────────────────────────────────────────── */}
      <div className="grid content-start gap-2">
        <Card label={`${sym} on-chain, still trading`}
              value={chainPrice ? chainPrice.toFixed(2) : '—'} accent="tape"
              note={state === 'dark'
                ? `changing hands ${fmtDuration(age / 3600)} after Pyth went quiet`
                : 'trading alongside the feed'} />
        <Card label={`Gap, ${sym} vs the last Pyth publish`}
              value={gap === null ? '—' : pctSigned(gap)}
              note={state === 'dark'
                ? 'nobody can arbitrage this, the reference itself is offline'
                : 'the token and the feed are both live, so this stays tight'} />
        <Card label="Noctis mark" value={noctisMark.toFixed(2)} accent="mark"
              note="a forecast for the reopening auction, not a quote" />

        <div className="rounded-xl border border-line bg-void/50 p-3">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-ink3">
            Two different questions
          </div>
          <div className="space-y-1 text-[11px]">
            <Row k="exchange session" v={session.isOpen ? 'OPEN' : 'CLOSED'}
                 tone={session.isOpen ? undefined : 'warn'} />
            <Row k="Pyth feed" v={state === 'dark' ? 'DARK' : 'PUBLISHING'}
                 tone={state === 'dark' ? 'warn' : 'up'} />
          </div>
          <p className="mt-2 border-t border-line pt-2 text-[10px] leading-snug text-ink3">
            These disagree most weekday nights, and that is correct. The exchange
            shuts at 16:00 ET; Pyth keeps publishing until 20:00 and resumes Sunday
            evening. Only the 48-hour weekend makes both say no.
            {calendar.source !== 'builtin' && ' Session state is read from Pyth’s own schedule string.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: 'warn' | 'up' }) {
  const c = tone === 'warn' ? 'text-warn' : tone === 'up' ? 'text-up' : 'text-ink';
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-ink3">{k}</span>
      <span className={`num ${c}`}>{v}</span>
    </div>
  );
}

function Card({
  label, value, note, accent,
}: { label: string; value: string; note: string; accent?: 'tape' | 'mark' }) {
  return (
    <div className="rounded-xl border border-line bg-panel/60 p-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink3">{label}</div>
      <div className={`mt-1.5 num text-[20px] leading-none ${
        accent === 'tape' ? 'text-tape' : accent === 'mark' ? 'text-mark' : 'text-ink'
      }`}>{value}</div>
      <div className="mt-1.5 text-[10.5px] leading-snug text-ink3">{note}</div>
    </div>
  );
}

export { MAX_AGE_SECONDS };
