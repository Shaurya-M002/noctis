import { useEffect, useState } from 'react';
import { sessionAt, fmtDuration } from '../lib/market';
import { SCENARIOS } from '../lib/world';

export function Header({
  scenarioId, setScenarioId, session, atOpen, mode, setMode,
}: {
  scenarioId: string;
  setScenarioId: (s: string) => void;
  session: { label: string; isDark: boolean; hoursClosed: number; nyDate: string; nyTime: string };
  atOpen: boolean;
  mode: 'sim' | 'live' | 'preipo';
  setMode: (m: 'sim' | 'live' | 'preipo') => void;
}) {
  const [live, setLive] = useState(() => sessionAt(new Date()));
  useEffect(() => {
    const t = setInterval(() => setLive(sessionAt(new Date())), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="relative z-10 border-b border-line bg-void/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3.5">
        <div className="flex items-center gap-3">
          <Moon />
          <div>
            <div className="text-[17px] font-semibold leading-none tracking-[-0.01em]">
              NOCTIS
            </div>
            <div className="mt-1 text-[10.5px] leading-none tracking-[0.06em] text-ink3">
              fair value for the hours Wall Street isn&apos;t open
            </div>
          </div>
        </div>

        <div className="hidden h-8 w-px bg-line lg:block" />

        {/* Real wall clock — always honest about what the actual market is doing. */}
        <div className="flex items-center gap-2.5">
          <span className={`h-1.5 w-1.5 rounded-full ${live.isDark ? 'bg-down pulse' : live.isOpen ? 'bg-up' : 'bg-warn'}`} />
          <div className="leading-tight">
            <div className="num text-[12.5px] text-ink">{live.nyTime} ET</div>
            <div className="text-[10px] uppercase tracking-[0.08em] text-ink3">
              live · {live.label.toLowerCase()}
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="mr-2 inline-flex rounded-lg border border-line bg-void p-0.5">
            {([['sim', 'Simulation'], ['live', 'Live mainnet'], ['preipo', 'Pre-IPO']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  mode === id ? 'bg-raised text-ink' : 'text-ink3 hover:text-ink2'
                }`}
              >
                {(id === 'live' || id === 'preipo') && (
                  <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                    mode === id ? 'bg-up pulse' : 'bg-ink3'
                  }`} />
                )}
                {label}
              </button>
            ))}
          </div>
          {mode === 'sim' && (
            <span className="mr-1 text-[10px] uppercase tracking-[0.11em] text-ink3">Scenario</span>
          )}
          {mode === 'sim' && SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => setScenarioId(s.id)}
              title={s.blurb}
              className={`rounded-lg border px-2.5 py-1.5 text-[11.5px] transition-colors ${
                scenarioId === s.id
                  ? 'border-mark/60 bg-mark/10 text-mark'
                  : 'border-line text-ink3 hover:border-line2 hover:text-ink2'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* The state of the simulated world, front and centre. */}
      <div className="border-t border-line bg-panel/40">
        <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-7 gap-y-2 px-6 py-2">
          <span className={`chip ${
            atOpen ? 'border-truth/50 text-truth'
              : session.isDark ? 'border-down/50 text-down' : 'border-warn/50 text-warn'
          }`}>
            {atOpen ? 'OPENING AUCTION — MARKET LIVE' : session.label}
          </span>
          <span className="text-[11.5px] text-ink2">
            <span className="text-ink3">{mode === 'live' ? 'now ' : 'simulated clock '}</span>
            <span className="num text-ink">{session.nyDate} {session.nyTime} ET</span>
          </span>
          <span className="text-[11.5px] text-ink2">
            <span className="text-ink3">{atOpen ? 'was shut for ' : 'shut for '}</span>
            <span className="num text-ink">{fmtDuration(session.hoursClosed)}</span>
          </span>
          <span className="ml-auto text-[11px] text-ink3">
            {atOpen
              ? 'The auction has printed. Everyone finds out how wrong they were.'
              : mode === 'preipo'
                ? 'No exchange. No bell. The gap never closes.'
                : mode === 'live'
                  ? 'Live mainnet prices. Public endpoints, no key, no server.'
                  : 'xStocks keep trading. Price discovery does not.'}
          </span>
        </div>
      </div>
    </header>
  );
}

function Moon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
      <defs>
        <radialGradient id="mg" cx="35%" cy="30%">
          <stop offset="0%" stopColor="#f0b84a" />
          <stop offset="100%" stopColor="#c98500" />
        </radialGradient>
      </defs>
      <circle cx="13" cy="13" r="11" fill="none" stroke="#20242c" strokeWidth="1" />
      <path d="M13 3.5a9.5 9.5 0 1 0 7.4 15.45A9.5 9.5 0 0 1 13 3.5Z" fill="url(#mg)" />
      <circle cx="13" cy="13" r="11" fill="none" stroke="#c98500" strokeOpacity=".35" strokeWidth="1" />
    </svg>
  );
}
