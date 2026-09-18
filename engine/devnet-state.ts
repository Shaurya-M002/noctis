/**
 * Read the live devnet deployment. No wallet, no setup, just look.
 *
 *   npx tsx engine/devnet-state.ts
 *
 * Everything printed here is public chain state. The point of having this as a
 * script rather than a screenshot is that you can run it yourself and get whatever
 * the chain says now, not what it said when we wrote the README.
 */
import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import type { Noctis } from '../target/types/noctis';
(async () => {
const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync('.keys/deployer.json','utf8'))));
const conn = new Connection('https://api.devnet.solana.com','confirmed');
anchor.setProvider(new anchor.AnchorProvider(conn, new anchor.Wallet(kp), {commitment:'confirmed'}));
const program = anchor.workspace.noctis as Program<Noctis>;
const P = (s:string)=>PublicKey.findProgramAddressSync([Buffer.from(s)],program.programId)[0];
const M=1e6;
const cfg = await program.account.config.fetch(P('config'));
const v   = await program.account.vault.fetch(P('vault'));
const assets = await program.account.assetMark.all();
const receipts = await program.account.receipt.all();
console.log('CONFIG');
console.log('  authority       ', cfg.authority.toBase58());
console.log('  oracle          ', cfg.oracle.toBase58());
console.log('  protocol take   ', cfg.protocolTakeBps/100+'% of vault NET PROFIT');
console.log('  paused          ', cfg.paused);
console.log('\nVAULT');
console.log('  TVL             $'+(v.tvl.toNumber()/M).toLocaleString());
console.log('  long / short    $'+(v.longRisk.toNumber()/M).toFixed(2)+' / $'+(v.shortRisk.toNumber()/M).toFixed(2));
console.log('  exposure        $'+(v.exposure.toNumber()/M).toFixed(2));
console.log('  premiums        $'+(v.premiumsCollected.toNumber()/M).toFixed(2));
console.log('  payouts         $'+(v.payoutsPaid.toNumber()/M).toFixed(2));
console.log('  LP net          $'+((v.premiumsCollected.toNumber()-v.payoutsPaid.toNumber())/M).toFixed(2));
console.log('  receipts opened ', v.receiptsOpened.toNumber());
for (const a of assets) {
  console.log('\nASSET '+a.publicKey.toBase58());
  console.log('  mint            ', a.account.mint.toBase58());
  console.log('  mid / sigma      '+(a.account.mid.toNumber()/M).toFixed(2)+'  /  '+(a.account.sigmaPpm/10000).toFixed(2)+'%');
  console.log('  last close      ', (a.account.lastClose.toNumber()/M).toFixed(2));
  console.log('  open print      ', (a.account.openPrint.toNumber()/M).toFixed(2));
  console.log('  epoch / printEp  '+a.account.epoch.toNumber()+' / '+a.account.openPrintEpoch.toNumber());
  console.log('  open receipts   ', a.account.openReceipts.toNumber());
}
console.log('\nRECEIPTS ('+receipts.length+')');
for (const r of receipts) {
  const t=['RAW','BAND','PIN'][r.account.tier];
  console.log('  '+r.publicKey.toBase58().slice(0,8)+'…  '+(r.account.isBuy?'LONG ':'SHORT')+' '+(r.account.qtyMicro.toNumber()/M)+
    ' @ '+(r.account.fillPrice.toNumber()/M).toFixed(2)+'  '+t.padEnd(4)+
    '  premium $'+(r.account.premium.toNumber()/M).toFixed(2)+
    '  σ±'+(r.account.sigmaAbs.toNumber()/M).toFixed(2)+
    '  epoch '+r.account.epoch.toNumber()+'  settled '+r.account.settled);
}

})();
