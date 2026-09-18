/**
 * Pyth equity prices, read straight off Solana mainnet in the browser.
 *
 * Not from Hermes. The Pyth Core upgrade (26 Aug 2026) put the price API behind a
 * key, and equities sit in the Pro tier at $2,500/mo. The same numbers are on
 * mainnet for free, readable by anyone with an RPC URL. So we read the chain.
 *
 * Everything in this file is measured rather than assumed, see docs/PYTH.md.
 * The three findings that shaped it:
 *
 *   1. `api.mainnet-beta.solana.com` rejects browser requests. The ladder below
 *      leads with a public node that sets `access-control-allow-origin: *`.
 *   2. `Content-Type: text/plain` is CORS-safelisted, so the browser skips the
 *      preflight entirely. Solana RPCs ignore the content type. It roughly halves
 *      latency and request count.
 *   3. The equity feeds publish Sunday 20:00 ET → Friday 20:00 ET continuously, at
 *      an ~11s cadence, and then freeze for exactly 48 hours. Verified by walking
 *      24,000 on-chain writes: one gap, 48.00h, Fri 19:59:53 ET → Sun 20:00:03 ET.
 */

import type { SourceReport } from './feeds';

/**
 * Shard-1 PriceUpdateV2 accounts. Shard 0 exists for each of these and is
 * ABANDONED. AAPL's is 33 days stale, TSLA's only 4.5 days and 2.2% wrong, which
 * is the one that would actually fool you. Re-derive with `npm run pyth:verify`.
 */
export const PYTH_FEEDS = [
  { under: 'AAPL', sym: 'AAPLx',
    account: 'D9uk39pqZMcnmtPP9WeC8cREUpKZmyXLga9mSQ79SphW',
    feedId: '49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688' },
  { under: 'NVDA', sym: 'NVDAx',
    account: '5VETJ8h3p4JrESYrzhjTDAWPEjDjfcnduqe9CjxgqBNd',
    feedId: 'b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593' },
  { under: 'TSLA', sym: 'TSLAx',
    account: 'FQB8c4zB8Emrp9W8bmyk6GanCLq4aRytHYPDAnaEpq9z',
    feedId: '16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1' },
  { under: 'SPY', sym: 'SPYx',
    account: 'CRDaGwcVnKdRNRtx6fjHtvrBgKM5U55AhbqBWhtPMDA',
    feedId: '19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5' },
] as const;

/** Tatum rejects text/plain; everything else prefers it. Tried in order. */
const RPCS: { url: string; plain: boolean }[] = [
  { url: 'https://solana-rpc.publicnode.com', plain: true },
  { url: 'https://api.mainnet-beta.solana.com', plain: true },
  { url: 'https://solana-mainnet.gateway.tatum.io', plain: false },
];

/** Ceiling is 48h over a weekend, 72h over a holiday weekend. Past that, refuse. */
export const MAX_AGE_SECONDS = 76 * 3600;

const DISCRIMINATOR = '22f123639d7ef4cd';

export interface PythPrice {
  under: string;
  sym: string;
  account: string;
  feedId: string;
  price: number;
  conf: number;
  expo: number;
  publishTime: number;
  prevPublishTime: number;
  postedSlot: number;
  /** conf / price, in basis points. The number the σ-vs-conf chart plots. */
  confBps: number;
}

export interface PythRead {
  fetchedAt: number;
  rpc: string;
  ms: number;
  byUnder: Record<string, PythPrice>;
  /** Accounts that answered but failed a check, with the reason. */
  rejected: { account: string; why: string }[];
  report: SourceReport;
}

const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/**
 * Decode a PriceUpdateV2 account. Returns null rather than throwing, a malformed
 * account is data, not an exception.
 *
 * The offset is NOT a constant, which is the subtle part. `verification_level` is a
 * variable-length Borsh enum at byte 40: `Full` is one byte, `Partial{u8}` is two.
 * Every feed is Full today, so hardcoding 73 works, right up until one isn't, and
 * then every field shifts by one and you render garbage with total confidence.
 */
export function decodePriceUpdateV2(buf: Uint8Array) {
  if (buf.length < 133) return null;
  if (hex(buf.subarray(0, 8)) !== DISCRIMINATOR) return null;

  const tag = buf[40];
  if (tag !== 0 && tag !== 1) return null;
  const idOff = tag === 1 ? 41 : 42;          // 1 = Full, 0 = Partial{num_signatures}
  const o = idOff + 32;
  if (buf.length < o + 36) return null;

  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const expo = dv.getInt32(o + 16, true);
  const scale = Math.pow(10, expo);
  const price = Number(dv.getBigInt64(o, true)) * scale;
  const conf = Number(dv.getBigUint64(o + 8, true)) * scale;
  if (!(price > 0) || !Number.isFinite(price)) return null;

  return {
    feedId: hex(buf.subarray(idOff, idOff + 32)),
    price, conf, expo,
    publishTime: Number(dv.getBigInt64(o + 20, true)),
    prevPublishTime: Number(dv.getBigInt64(o + 28, true)),
    postedSlot: Number(dv.getBigUint64(o + 52, true)),
    confBps: (conf / price) * 10_000,
  };
}

const b64 = (s: string) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** Never rejects. On total failure returns an empty read and a `down` report. */
export async function readPyth(): Promise<PythRead> {
  const t0 = Date.now();
  const body = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'getMultipleAccounts',
    params: [PYTH_FEEDS.map((f) => f.account), { encoding: 'base64', commitment: 'confirmed' }],
  });

  let lastErr = 'no endpoint tried';
  for (const { url, plain } of RPCS) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch(url, {
        method: 'POST',
        // text/plain is CORS-safelisted, so no preflight round trip.
        headers: { 'Content-Type': plain ? 'text/plain;charset=UTF-8' : 'application/json' },
        body, signal: ctl.signal,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const vals = j?.result?.value;
      if (!Array.isArray(vals)) throw new Error(j?.error?.message ?? 'no result');

      const byUnder: Record<string, PythPrice> = {};
      const rejected: { account: string; why: string }[] = [];
      const nowS = Date.now() / 1000;

      PYTH_FEEDS.forEach((f, i) => {
        const v = vals[i];
        if (!v?.data?.[0]) { rejected.push({ account: f.account, why: 'account not found' }); return; }
        const d = decodePriceUpdateV2(b64(v.data[0]));
        if (!d) { rejected.push({ account: f.account, why: 'failed to decode' }); return; }
        // Free, total correctness check: prove the account holds the feed we asked
        // for. This is what stops a copy-paste slip rendering another asset's price.
        if (d.feedId !== f.feedId) {
          rejected.push({ account: f.account, why: `feed_id mismatch (${d.feedId.slice(0, 12)}…)` });
          return;
        }
        // Shard 0 is abandoned and months stale. Anything past a holiday weekend is
        // not a live feed, whatever the account says.
        if (nowS - d.publishTime > MAX_AGE_SECONDS) {
          rejected.push({ account: f.account, why: `stale ${((nowS - d.publishTime) / 86400).toFixed(1)}d` });
          return;
        }
        byUnder[f.under] = { under: f.under, sym: f.sym, account: f.account, ...d };
      });

      const ms = Date.now() - t0;
      return {
        fetchedAt: Date.now(), rpc: url, ms, byUnder, rejected,
        report: {
          name: 'Pyth · Solana mainnet', url: `${url} · getMultipleAccounts`,
          status: Object.keys(byUnder).length ? 'ok' : 'degraded',
          detail: `${Object.keys(byUnder).length}/${PYTH_FEEDS.length} feeds decoded`,
          ms,
        },
      };
    } catch (e) {
      lastErr = `${url.replace('https://', '')}: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    fetchedAt: Date.now(), rpc: '—', ms: Date.now() - t0, byUnder: {}, rejected: [],
    report: {
      name: 'Pyth · Solana mainnet', url: RPCS.map((r) => r.url).join(' → '),
      status: 'down', detail: lastErr, ms: Date.now() - t0,
    },
  };
}

/**
 * Two questions that are easy to conflate and must not be.
 *
 * `is the exchange in session` comes from the calendar. `is the feed alive` comes
 * from publish_time. At 09:27 ET on a Wednesday the answer is NO and YES, the
 * exchange opens at 09:30, and Pyth has been ticking all night. Rendering
 * "MARKET CLOSED" next to a 19-second-old price reads as a bug, and for a project
 * about the hours the market is shut, getting this wrong would be embarrassing.
 */
export type FeedLiveness = 'live' | 'lagging' | 'dark' | 'down';

export function liveness(p: PythPrice | undefined, nowMs: number): FeedLiveness {
  if (!p) return 'down';
  const age = nowMs / 1000 - p.publishTime;
  if (age <= 60) return 'live';
  if (age <= 900) return 'lagging';
  return 'dark';
}
