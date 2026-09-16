/**
 * Re-derive the Pyth account set from the chain and check what we shipped.
 *
 *   npm run pyth:verify
 *
 * The addresses in app/src/lib/pyth.ts are hardcoded, which is the right call for a
 * browser client — but a hardcoded address is a claim, and claims should be
 * checkable. This finds every PriceUpdateV2 account for each feed, sorts by
 * publish_time, and exits non-zero if the one we ship is not the freshest.
 */
import { readFileSync } from 'node:fs';

// mainnet-beta, not publicnode: getProgramAccounts is an indexed call that
// publicnode gates behind a token. This is a node script with no Origin header, so
// the browser-side reason for avoiding mainnet-beta does not apply here.
const RPC = 'https://api.mainnet-beta.solana.com';
const RECEIVER = 'rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ';
const UNDERS = ['AAPL', 'NVDA', 'TSLA', 'SPY'];

const src = readFileSync('app/src/lib/pyth.ts', 'utf8');
const shipped = Object.fromEntries(
  [...src.matchAll(/under: '(\w+)',[\s\S]*?account: '([1-9A-HJ-NP-Za-km-z]+)'/g)]
    .map((m) => [m[1], m[2]]));

const rpc = async (method, params) => {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
};

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58 = (bytes) => {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b === 0) s = '1' + s; else break; }
  return s;
};

let bad = 0;
console.log(`\n  Verifying against ${RPC}\n`);

for (const under of UNDERS) {
  const meta = await (await fetch(
    `https://hermes.pyth.network/v2/price_feeds?query=${under}&asset_type=equity`)).json();
  const feed = meta.find((f) => f?.attributes?.symbol === `Equity.US.${under}/USD`);
  if (!feed) { console.log(`  ${under}: no feed metadata`); bad++; continue; }
  const feedId = feed.id;

  const accts = await rpc('getProgramAccounts', [RECEIVER, {
    encoding: 'base64', filters: [
      { dataSize: 134 },
      { memcmp: { offset: 41, bytes: b58(Buffer.from(feedId, 'hex')) } },
    ],
  }]);

  const rows = accts.map((a) => {
    const buf = Buffer.from(a.account.data[0], 'base64');
    const o = (buf[40] === 1 ? 41 : 42) + 32;
    const expo = buf.readInt32LE(o + 16);
    return {
      account: a.pubkey,
      price: Number(buf.readBigInt64LE(o)) * 10 ** expo,
      publishTime: Number(buf.readBigInt64LE(o + 20)),
    };
  }).sort((x, y) => y.publishTime - x.publishTime);

  const now = Date.now() / 1000;
  console.log(`  ${under}  (${rows.length} account${rows.length === 1 ? '' : 's'}, feed ${feedId.slice(0, 12)}…)`);
  for (const r of rows) {
    const age = now - r.publishTime;
    const mine = r.account === shipped[under];
    const fresh = r === rows[0];
    console.log(`    ${mine ? '→' : ' '} ${r.account}  $${r.price.toFixed(2).padStart(9)}  ` +
      `${(age / 86400).toFixed(1).padStart(5)}d old${fresh ? '  FRESHEST' : ''}${mine ? '  SHIPPED' : ''}`);
  }
  if (rows.length && shipped[under] !== rows[0].account) {
    console.log(`    \x1b[31mMISMATCH: we ship ${shipped[under]} but the freshest is ${rows[0].account}\x1b[0m`);
    bad++;
  }
  console.log('');
}

console.log(bad ? `  \x1b[31m${bad} problem(s)\x1b[0m\n` : '  \x1b[32mall shipped accounts are the freshest available\x1b[0m\n');
process.exit(bad ? 1 : 0);
