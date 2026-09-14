/**
 * Commit a forecast, then let reality mark it.
 *
 *   node scripts/forecast.mjs record    # snapshot live marks -> forecasts/*.jsonl
 *   node scripts/forecast.mjs score     # fetch what actually opened, score them
 *   node scripts/forecast.mjs report    # print the running scorecard
 *
 * A backtest is a claim about a model on data the author chose. This is the other
 * thing: a timestamped prediction, written into git before the outcome exists, that
 * anybody can check afterwards without trusting us.
 *
 * `record` writes the mark, the band, and every input that produced them. `score`
 * reads the reference price after the auction and works out how wrong we were.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { UNIVERSE } from '../app/src/data/universe';
import { sessionAt } from '../app/src/lib/market';
import { computeMark } from '../app/src/lib/nyx';
import { factorsFor } from '../app/src/lib/feeds';
import type { FactorNoise } from '../app/src/lib/nyx';

const FILE = 'forecasts/marks.jsonl';
const JUP = 'https://lite-api.jup.ag/price/v3';
const CB = 'https://api.exchange.coinbase.com';

const getJSON = async (u: string): Promise<any> => {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.json();
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Rebuild the live snapshot exactly as the app does, in node. */
async function snapshot() {
  const now = new Date();
  const session = sessionAt(now);
  const lastCloseMs = now.getTime() - session.hoursClosed * 3_600_000;

  const jup = await getJSON(`${JUP}?ids=${UNIVERSE.map((a) => a.mint).join(',')}`);

  const candles = async (p: string) => {
    const rows = await getJSON(`${CB}/products/${p}/candles?granularity=3600`);
    const target = Math.floor(lastCloseMs / 1000);
    let best = rows[rows.length - 1];
    for (const r of rows as number[][]) {
      if (Math.abs(r[0] - target) < Math.abs(best[0] - target)) best = r;
    }
    return Math.log(rows[0][4] / best[4]);
  };
  const [btc, eth] = await Promise.all([candles('BTC-USD'), candles('ETH-USD')]);
  const crypto = (btc + eth) / 2;

  const assets: Record<string, any> = {};
  for (const a of UNIVERSE) {
    const j = jup[a.mint];
    if (!j?.usdPrice) continue;
    const onChain = Number(j.usdPrice);
    const reference = Number(j?.stockData?.price ?? 0) || onChain;
    assets[a.sym] = {
      sym: a.sym, mint: a.mint, onChain, reference,
      referenceAt: j?.stockData?.updatedAt ?? null,
      dislocation: Math.log(onChain / reference),
      liquidity: Number(j.liquidity ?? 0),
      volume24h: 0,
    };
  }
  const basis = median(Object.values(assets).map((a: any) => a.dislocation));

  const noise: FactorNoise = { MKT: 0.0060, SECT: 0.0075, CRYPTO: 0.0012, FX: 0.0040, RATES: 0.0050 };

  const out: any[] = [];
  for (const a of UNIVERSE) {
    const l = assets[a.sym];
    if (!l) continue;
    const factors = factorsFor(a.sym, { assets, basis, crypto });
    // No earnings calendar feed — carry the unconditional risk, do not assert a date.
    const asset = {
      ...a, close: l.reference, depth: Math.max(20_000, l.liquidity), earningsInDays: -1,
    };
    const m = computeMark(asset, session, factors, noise, {
      impliedReturn: l.dislocation - basis,
      volume: l.liquidity * 0.15,
    });
    out.push({
      sym: a.sym,
      mid: +m.mid.toFixed(4),
      sigma: +m.sigma.toFixed(6),
      lo: +m.lo.toFixed(4),
      hi: +m.hi.toFixed(4),
      reference: +l.reference.toFixed(4),
      onChain: +l.onChain.toFixed(4),
      dislocation: +l.dislocation.toFixed(6),
    });
  }

  return {
    recordedAt: now.toISOString(),
    etClock: `${session.nyDate} ${session.nyTime} ET`,
    session: session.kind,
    hoursClosed: +session.hoursClosed.toFixed(2),
    hoursToOpen: +session.hoursToOpen.toFixed(2),
    basis: +basis.toFixed(6),
    crypto: { btc: +btc.toFixed(6), eth: +eth.toFixed(6) },
    marks: out,
    scored: null,
  };
}

async function record() {
  const snap = await snapshot();
  if (!snap.marks.length) { console.error('no marks; feeds down?'); process.exit(1); }
  appendFileSync(FILE, JSON.stringify(snap) + '\n');
  console.log(`\n  recorded ${snap.marks.length} marks at ${snap.etClock}`);
  console.log(`  session ${snap.session} · ${snap.hoursToOpen.toFixed(1)}h to the bell`);
  console.log(`  complex-wide basis ${(snap.basis * 100).toFixed(2)}%\n`);
  for (const m of snap.marks) {
    console.log(`    ${m.sym.padEnd(7)} ${m.mid.toFixed(2).padStart(8)} ± ${(m.sigma * m.mid).toFixed(2).padStart(6)}` +
      `   (±${(m.sigma * 100).toFixed(2)}%)   chain ${m.onChain.toFixed(2)}`);
  }
  console.log(`\n  → ${FILE}. Commit it. Monday scores it.\n`);
}

/**
 * Score every unscored forecast whose window has since resolved.
 *
 * The "actual" is Jupiter's reference price once it has moved past the timestamp
 * the forecast was taken at — i.e. the underlying's price after the market
 * reopened. Not the auction print to the tick, but it is the number the same feed
 * reports, which keeps the comparison apples-to-apples and independently checkable.
 */
async function score() {
  if (!existsSync(FILE)) { console.error('nothing recorded yet'); process.exit(1); }
  const lines = readFileSync(FILE, 'utf8').trim().split('\n').filter(Boolean);
  const rows = lines.map((l: string) => JSON.parse(l));

  const jup = await getJSON(`${JUP}?ids=${UNIVERSE.map((a) => a.mint).join(',')}`);
  const nowRef: Record<string, { price: number; at: string | null }> = {};
  for (const a of UNIVERSE) {
    const j = jup[a.mint];
    const r = Number(j?.stockData?.price ?? 0);
    if (r) nowRef[a.sym] = { price: r, at: j?.stockData?.updatedAt ?? null };
  }

  let updated = 0;
  for (const row of rows) {
    if (row.scored) continue;
    const results: any[] = [];
    for (const m of row.marks) {
      const cur = nowRef[m.sym];
      if (!cur) continue;
      // Only score once the reference has genuinely moved on from the snapshot.
      if (cur.at && Date.parse(cur.at) <= Date.parse(row.recordedAt) + 3_600_000) continue;
      if (Math.abs(cur.price - m.reference) < 1e-9) continue; // still frozen
      const band = m.sigma * m.mid;
      results.push({
        sym: m.sym,
        actual: +cur.price.toFixed(4),
        errMark: +(cur.price - m.mid).toFixed(4),
        errRef: +(cur.price - m.reference).toFixed(4),
        errChain: +(cur.price - m.onChain).toFixed(4),
        z: +((cur.price - m.mid) / band).toFixed(3),
        insideBand: Math.abs(cur.price - m.mid) <= band,
      });
    }
    if (results.length) {
      row.scored = { scoredAt: new Date().toISOString(), results };
      updated++;
    }
  }
  writeFileSync(FILE, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(updated ? `  scored ${updated} forecast(s)` : '  nothing resolved yet — the market has not reopened');
  report();
}

function report() {
  if (!existsSync(FILE)) { console.log('  no forecasts recorded'); return; }
  const rows = readFileSync(FILE, 'utf8').trim().split('\n').filter(Boolean).map((l: string) => JSON.parse(l));
  const scored = rows.filter((r) => r.scored);
  console.log(`\n  FORECAST LOG — ${rows.length} recorded, ${scored.length} resolved\n`);
  for (const r of rows) {
    console.log(`  ${r.etClock}  (${r.session}, ${r.hoursToOpen.toFixed(0)}h to the bell)`);
    if (!r.scored) { console.log('    …unresolved\n'); continue; }
    for (const s of r.scored.results) {
      const m = r.marks.find((x: any) => x.sym === s.sym);
      const tick = s.insideBand ? '\x1b[32m✓\x1b[0m' : '\x1b[33m·\x1b[0m';
      console.log(`    ${tick} ${s.sym.padEnd(7)} mark ${m.mid.toFixed(2).padStart(8)}` +
        `  actual ${s.actual.toFixed(2).padStart(8)}` +
        `  off ${Math.abs(s.errMark).toFixed(2).padStart(6)}` +
        `  (stale ref off ${Math.abs(s.errRef).toFixed(2)})  z ${s.z.toFixed(2).padStart(6)}`);
    }
    console.log('');
  }
  const all: any[] = scored.flatMap((r: any) => r.scored.results);
  if (all.length) {
    const rms = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);
    const rel = (k: string) => rms(all.map((s: any) => {
      const row = scored.find((r: any) => r.scored.results.includes(s))!;
      const m = row.marks.find((x: any) => x.sym === s.sym);
      return s[k] / m.mid;
    }));
    console.log(`  ${all.length} observations`);
    console.log(`    Noctis mark RMSE   ${(rel('errMark') * 100).toFixed(3)}%`);
    console.log(`    stale reference    ${(rel('errRef') * 100).toFixed(3)}%`);
    console.log(`    on-chain price     ${(rel('errChain') * 100).toFixed(3)}%`);
    console.log(`    inside ±1σ         ${((all.filter((s) => s.insideBand).length / all.length) * 100).toFixed(1)}%  (68.3% is calibrated)\n`);
  }
}

const cmd = process.argv[2] ?? 'report';
(async () => {
  if (cmd === 'record') await record();
  else if (cmd === 'score') await score();
  else report();
})();
