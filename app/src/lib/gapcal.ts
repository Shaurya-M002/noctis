/**
 * What 38 days of candles can and cannot tell us about the pre-IPO gap.
 *
 * The attempt worth recording, because the obvious approach fails.
 *
 * GeckoTerminal serves free, keyless, CORS-open hourly OHLCV going back over a
 * month for every one of these pools. So the TOKEN half of the gap is fully
 * observable in history. The MARK half is not, neither issuer publishes one, and
 * the tempting move is to proxy the mark with a slow EMA of the token, on the
 * reasoning that a secondary-market mark is a smoothed traded price.
 *
 * We built that, then checked it against the live marks, and it is badly wrong:
 *
 *     OPENAI     real gap  +0.62%     EMA-168h proxy  -13.73%
 *     ANTHROPIC  real gap  -4.44%     EMA-168h proxy  -23.28%
 *
 * The issuer's mark tracks the token far more closely than a weekly EMA, nearer a
 * 6-to-24-hour one. Which means the mark is not a slow independent estimate at all;
 * it co-moves with the same secondary market the token follows. Calibrating a gap
 * sigma off that proxy produced 37-70% for a seven-day cover, and every bit of it
 * was the proxy's error rather than the gap's volatility.
 *
 * So this module does NOT reconstruct a gap history. It reports the one thing the
 * candles genuinely establish, how volatile the token is, with volume behind it.
 * and leaves the gap distribution to the only honest source we have, which is our
 * own recorded log. Sigma is bounded by the token's realised volatility, because
 * the gap cannot move faster than its two legs; that bound is real, and it is all
 * the candles can honestly give.
 */

const GT = 'https://api.geckoterminal.com/api/v2/networks/solana';

export interface TokenVol {
  sym: string;
  pool: string;
  candles: number;
  days: number;
  /** Hourly log-return sd, using only candles with real volume behind them. */
  hourlySd: number;
  /** Scaled to the horizon. An UPPER bound on gap movement, not an estimate of it. */
  horizonSd: number;
  medianHourlyVolume: number;
  /** Share of candles too thin to trust; high means the series is mostly noise. */
  thinShare: number;
  /** Biggest hourly move in the window, and the volume that did it. */
  worstMove: { pct: number; at: number; volume: number } | null;
  series: { t: number; c: number }[];
}

async function getJSON(url: string, ms = 15_000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

const poolCache = new Map<string, string>();
async function deepestPool(mint: string): Promise<string | null> {
  const hit = poolCache.get(mint);
  if (hit) return hit;
  const d = await getJSON(`${GT}/tokens/${mint}/pools`);
  const pools = ((d?.data ?? []) as any[])
    .map((p) => ({
      id: String(p.id).replace(/^solana_/, ''),
      liq: Number(p?.attributes?.reserve_in_usd ?? 0),
    }))
    .filter((p) => p.id && p.liq > 0)
    .sort((a, b) => b.liq - a.liq);
  if (!pools.length) return null;
  poolCache.set(mint, pools[0].id);
  return pools[0].id;
}

const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

/** GeckoTerminal's free tier is rate-limited; one name at a time, cached. */
const volCache = new Map<string, { at: number; v: TokenVol | null }>();

export async function tokenVolatility(
  sym: string, mint: string, horizonHours: number,
): Promise<TokenVol | null> {
  const key = `${mint}:${Math.round(horizonHours)}`;
  const hit = volCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.v;

  const pool = await deepestPool(mint).catch(() => null);
  if (!pool) { volCache.set(key, { at: Date.now(), v: null }); return null; }

  const d = await getJSON(`${GT}/pools/${pool}/ohlcv/hour?aggregate=1&limit=1000`)
    .catch(() => null);
  const raw: number[][] = d?.data?.attributes?.ohlcv_list ?? [];
  if (raw.length < 48) { volCache.set(key, { at: Date.now(), v: null }); return null; }

  const rows = [...raw].sort((a, b) => a[0] - b[0]);
  const vols = rows.map((r) => r[5]).sort((a, b) => a - b);
  const medVol = vols[vols.length >> 1] ?? 0;
  const thin = rows.filter((r) => r[5] < 500).length / rows.length;

  // A candle with no volume behind it is a quote, not a trade. Dropping them is the
  // difference between measuring the asset and measuring the AMM's idle wander.
  const good = rows.filter((r) => r[5] >= 1000 && r[4] > 0);
  const closes = good.map((r) => r[4]);
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));

  let worst: TokenVol['worstMove'] = null;
  for (let i = 1; i < rows.length; i++) {
    if (!(rows[i][4] > 0) || !(rows[i - 1][4] > 0)) continue;
    const m = Math.abs(Math.log(rows[i][4] / rows[i - 1][4]));
    if (!worst || m > worst.pct) worst = { pct: m, at: rows[i][0], volume: rows[i][5] };
  }

  const hourlySd = sd(rets);
  const v: TokenVol = {
    sym, pool,
    candles: rows.length,
    days: (rows[rows.length - 1][0] - rows[0][0]) / 86400,
    hourlySd,
    horizonSd: hourlySd * Math.sqrt(Math.max(1, horizonHours)),
    medianHourlyVolume: medVol,
    thinShare: thin,
    worstMove: worst,
    series: rows.map((r) => ({ t: r[0], c: r[4] })),
  };
  volCache.set(key, { at: Date.now(), v });
  return v;
}
