/**
 * Records the demo walkthrough as a video.
 *
 *   node scripts/record-demo.mjs      →  media/noctis-demo.mp4
 *
 * Captions are injected as a page overlay so the video reads without audio.
 */
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const URL = process.env.URL ?? 'http://localhost:5273/';
const OUT = 'media';
const RAW = 'media/_raw';
mkdirSync(OUT, { recursive: true });
rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

const W = 1600, H = 1000;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: RAW, size: { width: W, height: H } },
  colorScheme: 'dark',
});
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });

await page.addStyleTag({ content: `
  #cap {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 9999;
    padding: 26px 40px 30px;
    background: linear-gradient(transparent, rgba(4,5,7,.93) 42%);
    font: 500 27px/1.35 ui-sans-serif, system-ui, -apple-system, sans-serif;
    color: #eef1f6; letter-spacing: -0.012em;
    opacity: 0; transition: opacity .32s ease; pointer-events: none;
    text-shadow: 0 2px 22px rgba(0,0,0,.95);
  }
  #cap.on { opacity: 1 }
  #cap b { color: #f0b23a; font-weight: 600 }
  #cap i { color: #8b93a2; font-style: normal; font-size: 20px; display: block; margin-top: 7px }
  #card {
    position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center;
    background: #05060a; opacity: 0; transition: opacity .45s ease; pointer-events: none;
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  }
  #card.on { opacity: 1 }
  #card .t { font-size: 66px; font-weight: 600; letter-spacing: -.03em; color: #eef1f6 }
  #card .s { font-size: 25px; color: #8b93a2; margin-top: 20px; text-align: center; max-width: 900px; line-height:1.45 }
  #card .k { color:#f0b23a }
`});
await page.evaluate(() => {
  document.body.insertAdjacentHTML('beforeend',
    '<div id="cap"></div><div id="card"><div style="text-align:center"><div class="t"></div><div class="s"></div></div></div>');
});

const wait = (ms) => page.waitForTimeout(ms);

async function card(title, sub, hold = 3400) {
  await page.evaluate(([t, s]) => {
    document.querySelector('#card .t').innerHTML = t;
    document.querySelector('#card .s').innerHTML = s;
    document.getElementById('card').classList.add('on');
  }, [title, sub]);
  await wait(hold);
  await page.evaluate(() => document.getElementById('card').classList.remove('on'));
  await wait(500);
}

async function say(html, hold = 3600) {
  await page.evaluate((h) => {
    const c = document.getElementById('cap');
    c.innerHTML = h; c.classList.add('on');
  }, html);
  await wait(hold);
}
async function hush() {
  await page.evaluate(() => document.getElementById('cap').classList.remove('on'));
  await wait(340);
}
/** Scroll a section into view, then lift it clear of the caption bar. */
const to = async (sel, lift = 190) => {
  await page.locator(sel).first().scrollIntoViewIfNeeded();
  await page.evaluate((d) => window.scrollBy({ top: d, behavior: 'instant' }), lift);
  await wait(520);
};

// ─────────────────────────────────────────────────────────────── scene 1
await card('NOCTIS',
  'Fair value, and a price for being wrong about it,<br>for the hours Wall Street isn\'t open.');

await card('168 hours in a week.',
  'US equities discover a price in <span class="k">32.5</span> of them.<br>Tokenized equities on Solana trade all 168.');

// ───────────────────────────────────────────── scene 1b: live mainnet
await page.getByRole('button', { name: 'Live mainnet' }).click();
await wait(8000);
await say('This is mainnet. Right now. No API key, no server. The browser is<br>reading Jupiter, DexScreener and Coinbase directly.', 4600);
await hush();

await to('text=WHERE THE SAME TOKEN IS PRINTING', 250);
await say('Eight live pools. The same token. The same instant.'
  + '<i>331.67 on one Raydium pool. 297.92 on Orca. Real money in both.</i>', 5600);
await say('<b>Over a thousand basis points apart</b>, and nothing closes it —<br>'
  + 'the thing you would hedge against is shut.'
  + '<i>"The on-chain price" is not one number. On a weekend it is barely a price.</i>', 6200);
await hush();

await to('text=PYTH, READ STRAIGHT OFF SOLANA MAINNET', 240);
await say('And this is Pyth, decoded out of a Solana account, in your browser.'
  + '<i>Hermes needs an API key now and equities are the $2,500-a-month tier. The same numbers are on mainnet for free.</i>', 6000);
await say('Two questions people conflate, shown separately.'
  + '<i>The exchange session comes from Pyth’s own schedule string. Whether the feed is alive comes from publish_time. On a weeknight those disagree, and they should.</i>', 6600);
await say('We measured the feed instead of trusting the marketing.'
  + '<i>24,000 on-chain writes, one gap in five days: 48 hours exactly, Friday 20:00 to Sunday 20:00 ET. So the hole is 48 hours, not the 65.5 we had been claiming. We corrected it.</i>', 7200);
await hush();

await to('text=DATA SOURCES', 220);
await say('Where every number came from, with latency. And where it didn\'t:'
  + '<i>no free always-on dollar index, so FX reads "no source" and σ widens by the full move it would have explained. Missing data should make a model less confident, not accidentally more.</i>', 6600);
await hush();

await card('To score a mark, you need the answer.',
  'Monday hasn\'t happened.<br>So let\'s replay a weekend where we already know it.', 4200);

await page.evaluate(() => window.scrollTo({ top: 0 }));
await page.getByRole('button', { name: 'Simulation' }).click();
await wait(1200);

// ───────────────────────────────────────────── scene 2: the four answers
await page.mouse.move(800, 500);
await say('So. What is <b>AAPLx</b> worth at 10am on a Saturday?', 3600);
await say('Pyth says <b>MARKET_CLOSED</b>. The last close is Friday\'s number.<br>The 24/7 book is one $40k order and 26 bps wide.'
  + '<i>Three answers. None of them a price.</i>', 5200);
await say('Noctis answers <b>230.84 ± 2.39</b>.'
  + '<i>Not a last trade. A conditional expectation of Monday\'s opening print, published with the one number every other oracle omits.</i>', 5600);
await hush();

// ─────────────────────────────────────────────────────────────── scene 2
await to('input[type=range]');
await say('σ isn\'t decoration. Watch it breathe as the weekend runs.', 2800);
for (const v of [4, 20, 38, 55, 64, 30]) {
  await page.locator('input[type=range]').fill(String(v));
  await wait(620);
}
await say('Widest in the middle of the weekend. Far from the last real price,<br>and still far from the next one.'
  + '<i>Most models only count the time elapsed. The bell is what you are actually predicting.</i>', 5200);
await hush();

// ─────────────────────────────────────────────────────────────── scene 3
await page.evaluate(() => window.scrollTo({ top: 0 }));
await wait(400);
await page.getByRole('button', { name: 'Sunday risk-off' }).click();
await wait(700);
await page.getByRole('button', { name: /^SPYx/ }).click();
await wait(700);
await say('Sunday. Crypto is selling off and equity beta will follow it down at the bell.<br>You want to buy <b>SPYx</b> anyway.', 4600);
await hush();

await to('text=REOPEN ASSURANCE');
await say('Noctis is <b>not a venue</b>. It never touches your trade —<br>execute wherever you like. There is no order flow here to tax.', 4400);
await say('The only thing you can buy is <b>certainty about the reopening print</b>.'
  + '<i>Raw: free, you eat the gap. Band: you absorb the first 1σ. Pin: you are filled at the official open.</i>', 5600);
await say('Priced as what it is. A one-sided option on the overnight gap.<br>N × σ × E[(Z−k)⁺], plus capital scarcity, plus concentration.', 5000);
await hush();

// ─────────────────────────────────────────────────────────────── scene 4
await page.getByRole('button', { name: /^Pin/ }).click();
await wait(500);
await page.getByRole('button', { name: /^(Cover|Take the gap naked)/ }).click();
await wait(700);
await page.getByRole('button', { name: /^Band/ }).click();
await wait(400);
await page.getByRole('button', { name: /^(Cover|Take the gap naked)/ }).click();
await wait(700);
await page.getByRole('button', { name: /^Raw/ }).click();
await wait(400);
await page.getByRole('button', { name: /^(Cover|Take the gap naked)/ }).click();
await wait(800);
await say('Three identical 50-share longs. One with Pin cover, one with Band, one naked.', 3400);
await hush();

await page.evaluate(() => window.scrollTo({ top: 0 }));
await wait(500);
await page.getByRole('button', { name: /run the opening auction/ }).click();
await wait(1400);
await say('Monday, 09:30. The auction prints, <b>2.7% below the mark</b>. Three sigma.', 4400);
await say('Now there is a real price again, and a scorecard —<br>graded on where each answer stood when you actually had to act.'
  + '<i>On this particular night the thin book landed closer, and the panel says so. Over 800 nights it does not. Neither it nor the close published a band, which is why neither could have underwritten the trade.</i>', 7000);
await hush();

await to('text=ASSURANCE RECEIPTS', 320);
await say('Same trade, three outcomes.'
  + '<i>Naked: the whole gap. Band: absorbed one sigma, the vault paid the rest. Pin: made whole to the print.</i>', 5800);
await say('The Pin holder\'s entire loss <b>is the premium</b>.<br>That is the product.', 4200);
await hush();

// ─────────────────────────────────────────────────────────────── scene 5
await to('text=UNDERWRITING VAULT');
await say('Somebody was short that gap. The vault paid, and the demo says so.'
  + '<i>100% of premiums go to LPs. Noctis takes 10% of the vault\'s net profit, nothing on your volume.</i>', 5800);
await say('Mis-estimate σ and the vault loses money and we earn <b>zero</b>.<br>The incentive to be calibrated is the business model.', 4800);
await hush();

// ─────────────────────────────────────────────────────────────── scene 6
await to('text=DOES ANY OF THIS ACTUALLY WORK');
await say('Every demo asserts this. Here it is measured.', 2600);
await page.getByRole('button', { name: /Run \d+-night backtest/ }).click();
await wait(2200);
await to('text=DOES ANY OF THIS ACTUALLY WORK');
await say('200 independent weekends. The model never sees the latent path it is scored against.', 3800);
await say('<b>58% better</b> than the last close. Better than the 24/7 book too.', 3400);
await say('And look at the shape, not just the width.'
  + '<i>75% inside 1σ, 95% inside 2σ. A normal predicts 68% and 95%. A Student-t with four degrees of freedom predicts 77% and 95%. That is what the gap distribution is, so that is what we price off.</i>', 7000);
await say('Which made the product <b>cheaper</b>, not dearer.'
  + '<i>At a one-sigma deductible the taller peak beats the fatter tail. Pin fell 11%. We could have kept the Gaussian and called the difference prudence.</i>', 6400);
await hush();

// ───────────────────────────────────────────── scene 7: the bug we found
// ───────────────────────────────────────── pre-IPO
await page.evaluate(() => window.scrollTo({ top: 0 }));
await page.getByRole('button', { name: 'Pre-IPO' }).click();
await wait(13000);
await say('Now take the bell away entirely.', 3000);
await say('Pre-IPO tokens have <b>no exchange at all</b>. No close, no auction, ever —'
  + '<br>only a mark the issuer publishes, and a token that disagrees with it.'
  + '<i>It is the weekend, permanently.</i>', 6200);
await hush();

await to('text=EVERY NAME, AND EVERY DISAGREEMENT', 250);
await say('Across xStocks the weekend gap spans about one and a half points.<br>Here it spans <b>thirty</b>.', 4400);
await say('And a second issuer tokenises three of the same companies.'
  + '<i>They disagree by 21% on OpenAI. 56% on Kalshi. 59% on SpaceX. Nobody knows what these are worth to within a factor of two. And that is not noise to smooth away, it is the honest width of the answer.</i>', 7400);
await hush();

await card('One more thing.',
  'We went looking for holes in our own settlement path.<br><span class="k">We found one.</span>', 4000);

await card('The exploit',
  '<span style="font-size:20px;line-height:1.7;display:block;text-align:left;max-width:820px">'
  + 'The opening print stayed on the account forever.<br><br>'
  + 'So the <i>next</i> weekend, buy Pin cover in whichever direction<br>'
  + 'last Monday\'s print favoured, then call the permissionless<br>'
  + 'settle immediately. No waiting. No risk. Repeat until the vault<br>'
  + 'is empty.</span>', 8000);

await card('Closed.',
  'Receipts now carry the window they were written in,<br>'
  + 'and settlement refuses to cross one.<br><br>'
  + '<span class="k">18 on-chain tests. One of them runs the attack.</span>', 5200);

await card('Noctis',
  'Wall Street closes. The chain doesn\'t.<br><span class="k">Somebody has to price the gap.</span>', 4200);

await ctx.close();
await browser.close();

// stitch
const raw = readdirSync(RAW).find((f) => f.endsWith('.webm'));
const webm = join(RAW, raw);
const mp4 = join(OUT, 'noctis-demo.mp4');
execFileSync('ffmpeg', [
  '-y', '-i', webm,
  '-vf', 'scale=1600:-2,fps=30', '-c:v', 'libx264', '-preset', 'slow',
  '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4,
], { stdio: 'inherit' });
renameSync(webm, join(OUT, 'noctis-demo.webm'));
rmSync(RAW, { recursive: true, force: true });
console.log('\n→', mp4);
