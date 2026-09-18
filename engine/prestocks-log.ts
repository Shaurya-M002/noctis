/**
 * Poll the pre-IPO reference marks and the on-chain prices, append, never stop.
 *
 *   npx tsx engine/prestocks-log.ts          # one sample
 *
 * Why this runs on a timer from the moment we decided to look at pre-IPO: unlike
 * every other part of this repo, a price history cannot be reconstructed later.
 * Neither PreStocks nor Tessera exposes a history endpoint, I checked. If we want
 * to say anything calibrated about pre-IPO uncertainty by Friday, the only way is
 * to have been recording since Tuesday.
 *
 * Three independent witnesses per sample, which is the whole point:
 *   PreStocks API   the issuer's own NAV mark          (server-side; no CORS)
 *   Jupiter         on-chain price + a mirrored mark   (CORS-open, scaled correctly)
 *   Tessera API     a RIVAL issuer's mark for 3 of the same companies
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const OUT = 'forecasts/prestocks.jsonl';
const PRESTOCKS = 'https://prestocks.com/api/prestocks';
const TESSERA = 'https://rest-api.tessera.pe/v1/public/token-details';
const JUP = 'https://lite-api.jup.ag/price/v3';

const get = async (u: string) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 20_000);
  try {
    const r = await fetch(u, { signal: c.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
};

/** Companies both issuers tokenise, the cross-issuer disagreement witnesses. */
const OVERLAP: Record<string, string> = {
  OPENAI: 'openai', SPACEX: 'spacex', KALSHI: 'kalshi',
};

(async () => {
  const at = new Date().toISOString();
  const pre = await get(PRESTOCKS).catch(() => null);
  const rows: any[] = Array.isArray(pre) ? pre : (pre?.data ?? []);
  if (!rows.length) { console.error('  prestocks feed empty'); process.exit(0); }

  const mints = rows.map((r) => r.contract_address).filter(Boolean);
  const jup = await get(`${JUP}?ids=${mints.join(',')}`).catch(() => ({}));
  const tes = await get(TESSERA).catch(() => null);

  // Tessera's payload shape is not documented as stable; index defensively.
  const tesRows: any[] = Array.isArray(tes) ? tes : (tes?.data ?? tes?.tokens ?? []);
  const tesBy: Record<string, any> = {};
  for (const t of tesRows) {
    const name = String(t?.name ?? t?.symbol ?? '').toLowerCase();
    for (const k of Object.values(OVERLAP)) if (name.includes(k)) tesBy[k] = t;
  }

  const sample = {
    at,
    names: rows.map((r) => {
      const j = jup?.[r.contract_address];
      const sym = String(r.symbol ?? r.name ?? '').toUpperCase();
      const tk = OVERLAP[sym] ? tesBy[OVERLAP[sym]] : undefined;
      return {
        sym,
        mint: r.contract_address,
        // Issuer's NAV mark, and the on-chain price, both from PreStocks itself.
        mark: Number(r.markPrice) || null,
        token: Number(r.tokenPrice) || null,
        markValuation: Number(r.markValuation) || null,
        impliedValuation: Number(r.impliedValuation) || null,
        supply: Number(r.supply) || null,
        // Jupiter's independent read of the same two numbers.
        jupPrice: j?.usdPrice ?? null,
        jupMark: j?.stockData?.price ?? null,
        jupLiquidity: j?.liquidity ?? null,
        // Token-2022 ScaledUiAmount. The multiplier and its next scheduled change.
        // a split-like discontinuity with a published timestamp.
        uiMultiplier: j?.scaledUiConfig?.multiplier ?? null,
        nextMultiplier: j?.scaledUiConfig?.newMultiplier ?? null,
        nextMultiplierAt: j?.scaledUiConfig?.newMultiplierEffectiveAt ?? null,
        // A rival issuer's mark for the same company, where one exists.
        rivalMark: tk ? (Number(tk.markPrice ?? tk.nav ?? tk.price) || null) : null,
        rivalValuation: tk ? (Number(tk.markValuation ?? tk.valuation) || null) : null,
      };
    }),
  };

  appendFileSync(OUT, JSON.stringify(sample) + '\n');

  const n = existsSync(OUT) ? readFileSync(OUT, 'utf8').trimEnd().split('\n').length : 1;
  const basis = sample.names
    .filter((x) => x.mark && x.token)
    .map((x) => Math.log(x.token! / x.mark!));
  basis.sort((a, b) => a - b);
  const lo = basis[0] * 100, hi = basis[basis.length - 1] * 100;
  console.log(`  ${at}  ${sample.names.length} names  basis ${lo.toFixed(1)}% … ${hi.toFixed(1)}%  (${(hi - lo).toFixed(1)}pt spread)  [${n} samples]`);
})();
