import { useState } from 'react';
import { useNoctis } from './lib/useNoctis';
import { useLive } from './lib/useLive';
import { Header } from './components/Header';
import { AssetRail } from './components/AssetRail';
import { PriceHero } from './components/PriceHero';
import { BandChart } from './components/BandChart';
import { VenueChart } from './components/VenueChart';
import { Sources } from './components/Sources';
import { Waterfall } from './components/Waterfall';
import { Ticket } from './components/Ticket';
import { Receipts } from './components/Receipts';
import { Vault } from './components/Vault';
import { Calibration } from './components/Calibration';
import { Panel } from './components/ui';
import { fmtDuration } from './lib/market';
import { bps, pct, pctSigned, compact } from './lib/fmt';

export type Mode = 'sim' | 'live';

export default function App() {
  const [mode, setMode] = useState<Mode>('sim');
  const [liveSym, setLiveSym] = useState('AAPLx');
  const n = useNoctis();
  const live = useLive(mode === 'live', liveSym);

  return (
    <div className="min-h-full">
      <Header
        scenarioId={n.scenarioId} setScenarioId={n.setScenarioId}
        session={mode === 'live' ? live.session : n.session}
        atOpen={mode === 'sim' && n.settled}
        mode={mode} setMode={setMode}
      />
      <main className="relative z-10 mx-auto max-w-[1560px] px-6 py-5">
        {mode === 'sim'
          ? <SimulationView n={n} />
          : <LiveView live={live} sym={liveSym} setSym={setLiveSym} />}
        <Footer mode={mode} />
      </main>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── live */

function LiveView({
  live, sym, setSym,
}: { live: ReturnType<typeof useLive>; sym: string; setSym: (s: string) => void }) {
  const asset = live.assets.find((a) => a.sym === sym)!;
  const mark = live.marks[sym];
  const l = live.snap?.assets[sym];

  if (!mark || !l) {
    return (
      <Panel title="Live mainnet data">
        <p className="py-10 text-center text-[12px] text-ink3">
          {live.error
            ? `Feeds unavailable: ${live.error}`
            : 'Reading Jupiter, DexScreener and Coinbase…'}
        </p>
      </Panel>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[210px_minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Panel title="xStocks · mainnet" sub="Real prices, refreshed every 30s." pad="p-0">
          <AssetRail marks={live.marks} sym={sym} onSelect={setSym} />
        </Panel>
        <Panel title="The hole"><Gap /></Panel>
      </div>

      <div className="space-y-4">
        <Panel
          title={`${sym} — live, on mainnet`}
          sub="Every number on this screen was fetched from a public endpoint you can curl yourself."
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="rounded-xl border border-mark/30 bg-mark/[0.06] p-4">
              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-mark/80">
                Noctis mark · {sym}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="num text-[38px] leading-none text-ink">{mark.mid.toFixed(2)}</span>
                <span className="num text-[15px] text-mark">± {mark.sigmaAbs.toFixed(2)}</span>
              </div>
              <div className="mt-2 num text-[12px] text-ink2">
                1σ band <span className="text-ink">{mark.lo.toFixed(2)} – {mark.hi.toFixed(2)}</span>
                <span className="text-ink3"> · {pct(mark.sigma)}</span>
              </div>
              <p className="mt-3 border-t border-mark/20 pt-2.5 text-[11.5px] leading-relaxed text-ink2">
                Computed by the same Nyx that runs the simulation. Nothing is
                special-cased for live mode — only the inputs changed.
              </p>
            </div>
            <div className="grid gap-2">
              <Alt label={`${sym} on-chain, right now`} value={l.onChain.toFixed(2)}
                   note={`24h ${pctSigned(l.change24h)} · ${compact(l.volume24h)} traded · ${compact(l.liquidity)} liquidity`}
                   accent />
              <Alt label="Last official reference" value={l.reference.toFixed(2)}
                   note={l.referenceAt
                     ? `frozen since ${new Date(l.referenceAt).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })} ET`
                     : 'no timestamp'} />
              <Alt label="Dislocation, on-chain vs reference"
                   value={pctSigned(l.dislocation)}
                   note={live.snap ? `${pctSigned(live.snap.basis)} of that is the complex-wide weekend basis` : ''} />
            </div>
          </div>
        </Panel>

        <Panel
          title="Where the same token is printing right now"
          sub="Quoted pool prices, and — separately — what the router will actually fill."
          right={live.dispersion > 0 && (
            <span className={`chip ${live.dispersion > 200 ? 'border-down/50 text-down' : 'border-warn/50 text-warn'}`}>
              {bps(live.dispersion)} quoted apart
            </span>
          )}
        >
          <VenueChart venues={live.venues} mark={mark} reference={l.reference}
                      loading={live.venuesLoading} basis={live.snap?.basis ?? 0}
                      executable={live.executable} />
        </Panel>

        <Panel title="Why the mark is the mark" sub="Same attribution, live inputs.">
          <Waterfall mark={mark} />
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel title="Quote" sub="What assurance would cost on this trade, right now.">
          <Ticket asset={asset} mark={mark} quote={live.quote} onTrade={() => {}}
                  disabled quoteOnly />
        </Panel>
        <Panel title="Data sources" sub="Public, keyless, and checkable.">
          <Sources snap={live.snap} ageSeconds={live.ageSeconds}
                   onRefresh={live.refresh} loading={live.loading} error={live.error} />
        </Panel>
      </div>
    </div>
  );
}

function Alt({ label, value, note, accent }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-panel/60 p-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink3">{label}</div>
      <div className={`mt-1.5 num text-[21px] leading-none ${accent ? 'text-tape' : 'text-ink'}`}>{value}</div>
      <div className="mt-1.5 text-[10.5px] leading-snug text-ink3">{note}</div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────── simulation */

function SimulationView({ n }: { n: ReturnType<typeof useNoctis> }) {
  const openPrint = n.settled ? n.openPrints[n.sym] : undefined;
  return (
    <div className="grid gap-4 xl:grid-cols-[210px_minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Panel title="xStocks universe" sub="Trading 24/7. Priced 6.5h a day." pad="p-0">
          <AssetRail marks={n.marks} sym={n.sym} onSelect={n.setSym} />
        </Panel>
        <Panel title="The hole"><Gap /></Panel>
      </div>

      <div className="space-y-4">
        <Panel
          title={n.settled ? `${n.sym} — the scorecard` : `What is ${n.sym} worth right now?`}
          sub={n.settled
            ? 'The auction has printed. Here is what each answer was worth.'
            : n.session.isDark
              ? 'Nobody is printing this equity anywhere on earth. Four systems will still give you an answer.'
              : 'The primary venue is shut. Four systems will still give you an answer.'}
        >
          <PriceHero asset={n.asset} mark={n.mark} base={n.base}
                     dark={n.session.isDark} openPrint={openPrint} scorecard={n.scorecard} />
        </Panel>

        <Panel
          title="The closed window"
          sub={`${n.scenario.name} — ${n.scenario.blurb}`}
          right={
            <div className="flex items-center gap-2">
              <button onClick={() => n.setPlaying(!n.playing)}
                      className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-ink2 hover:border-line2 hover:text-ink">
                {n.playing ? '❚❚ pause' : '▶ play to open'}
              </button>
              <button onClick={n.runAuction} disabled={n.settled}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${
                        n.settled ? 'cursor-not-allowed border border-line text-ink3'
                          : 'border border-truth/50 bg-truth/10 text-truth hover:bg-truth/15'}`}>
                ⏭ run the opening auction
              </button>
              <button onClick={n.reset}
                      className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-ink3 hover:text-ink2">
                reset
              </button>
            </div>
          }
        >
          <BandChart
            frames={n.frames} close={n.asset.close} cursorH={n.hoursClosed}
            windowHours={n.scenario.windowHours} openPrint={openPrint}
            revealTruth={n.settled}
            onScrub={(h) => { n.setPlaying(false); n.setHoursClosed(h); }}
          />
          <div className="mt-3 flex items-center gap-3">
            <input type="range" min={0} max={n.scenario.windowHours} step={0.25}
                   value={n.hoursClosed}
                   onChange={(e) => { n.setPlaying(false); n.setHoursClosed(Number(e.target.value)); }}
                   className="w-full"
                   aria-label="Hours since the last regular-session close" />
            <span className="num shrink-0 text-[11.5px] text-ink2">+{n.hoursClosed.toFixed(1)}h</span>
            <span className="num shrink-0 text-[11px] text-ink3">
              {fmtDuration(n.scenario.windowHours - n.hoursClosed)} to open
            </span>
          </div>
          {n.settled && (
            <div className="rise mt-3 rounded-lg border border-truth/35 bg-truth/[0.06] p-3">
              <SettleBanner
                close={n.asset.close} open={n.openPrints[n.sym]}
                mark={n.scorecard?.mark.mid ?? n.mark.mid}
                band={n.scorecard?.mark.sigmaAbs ?? n.mark.sigmaAbs}
                sym={n.sym} atHours={n.scorecard?.atHours ?? n.hoursClosed}
              />
            </div>
          )}
        </Panel>

        <Panel title="Why the mark is the mark" sub="Auditable by construction. No black box, no vibes.">
          <Waterfall mark={n.mark} />
        </Panel>

        <Panel title="Does any of this actually work?" sub="The part every other submission leaves out.">
          <Calibration />
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel title="Cover the dark" sub="Noctis never touches your trade. You pay only for certainty.">
          <Ticket asset={n.asset} mark={n.mark} quote={n.quote}
                  onTrade={n.trade} disabled={n.settled} />
        </Panel>
        <Panel title="Assurance receipts" sub={`${n.receipts.length} position${n.receipts.length === 1 ? '' : 's'}`}>
          <Receipts receipts={n.receipts} />
        </Panel>
        <Panel title="Underwriting vault" sub="Who is short the gap, and how it goes for them.">
          <Vault tvl={n.vault.tvl} exposure={n.vault.exposure}
                 premiums={n.premiumsCollected} payouts={n.payoutsPaid}
                 initialTvl={n.initialTvl}
                 openReceipts={n.receipts.filter((r) => !r.settlement).length} />
        </Panel>
      </div>
    </div>
  );
}

function SettleBanner({
  close, open, mark, band, sym, atHours,
}: { close: number; open: number; mark: number; band: number; sym: string; atHours: number }) {
  const errM = Math.abs(open - mark);
  const errC = Math.abs(open - close);
  const better = errC > 0 ? 1 - errM / errC : 0;
  const inside = errM <= band;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11.5px]">
      <span className="chip border-truth/50 text-truth">auction complete</span>
      <span className="text-ink2">
        {sym} opened at <span className="num text-truth">{open.toFixed(2)}</span>
      </span>
      <span className="text-ink2">
        Its <span className="num">+{atHours.toFixed(1)}h</span> mark was off by{' '}
        <span className="num text-mark">{errM.toFixed(2)}</span>
        {inside ? ' — inside its own band' : ' — outside the band, and the vault pays for that'}
      </span>
      <span className="text-ink2">
        Last close was off by <span className="num text-ink3">{errC.toFixed(2)}</span>
        {better > 0 && <span className="text-up"> ({(better * 100).toFixed(0)}% worse)</span>}
      </span>
    </div>
  );
}

function Gap() {
  const rows = [
    { k: 'Regular session', h: 32.5, tone: 'bg-truth' },
    { k: 'Extended hours', h: 40, tone: 'bg-tape' },
    { k: 'Overnight (24/5 feeds)', h: 30, tone: 'bg-warn/70' },
    { k: 'Weekend + holidays', h: 65.5, tone: 'bg-down' },
  ];
  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-snug text-ink3">
        A week is 168 hours. US equities discover a price in 32.5 of them.
      </p>
      {rows.map((r) => (
        <div key={r.k}>
          <div className="flex items-baseline justify-between">
            <span className="text-[10.5px] text-ink2">{r.k}</span>
            <span className="num text-[10.5px] text-ink3">{r.h}h</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-void">
            <div className={`h-full rounded-full ${r.tone}`} style={{ width: `${(r.h / 168) * 100}%` }} />
          </div>
        </div>
      ))}
      <p className="border-t border-line pt-2 text-[10px] leading-snug text-ink3">
        Pyth Pro covers pre-market through overnight — <em>24/5</em>. The 65.5-hour
        weekend is the hole Noctis is built for, and it is 39% of the week.
      </p>
    </div>
  );
}

function Footer({ mode }: { mode: Mode }) {
  return (
    <footer className="mt-8 border-t border-line pt-4 text-[10.5px] leading-relaxed text-ink3">
      <p>
        <span className="text-ink2">Noctis</span> · Stocklana hackathon submission ·
        Solana Foundation, September 2026.{' '}
        {mode === 'live'
          ? 'Live mode reads Jupiter, DexScreener and Coinbase from your browser — no key, no server. Marks are model output, not quotes, and nothing here is executable.'
          : 'Simulation mode is synthetic and deterministic by design — see docs/MODEL.md. Switch to Live for real mainnet prices.'}
        {' '}Nothing here is investment advice or an offer of insurance.
      </p>
    </footer>
  );
}
