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

// A ~2:30 cut. The three-minute cap is a stated rule, and the evidence on judge
// behaviour is consistent: show the product working inside the first fifteen
// seconds, and put everything that must land inside the first ninety. The long
// 4:33 version is kept as scripts/record-demo-long.mjs.

await card('NOCTIS',
  'Markets close. The internet\'s version of them doesn\'t.<br>'
  + '<span class="k">Somebody has to price the gap.</span>', 3200);

// ── 0:04. The product, live, immediately ──────────────────────────────
await page.getByRole('button', { name: 'Live mainnet' }).click();
await wait(7000);
await say('This is live mainnet, right now. Real prices, no API key, no server.', 3200);
await hush();

await to('text=WHERE THE SAME TOKEN IS PRINTING', 250);
await say('The same tokenised Apple, eight pools, one instant —<br><b>a thousand basis points apart</b>.'
  + '<i>Nothing closes it: the stock market is shut, so there is nothing to arbitrage against.</i>', 5000);
await hush();

// ── 0:20. Pyth, and the measurement ───────────────────────────────────
await to('text=PYTH, READ STRAIGHT OFF SOLANA MAINNET', 240);
await say('Pyth is the best price oracle there is, decoded here straight off the chain.', 3200);
await say('We measured its feed instead of trusting the marketing.'
  + '<i>24,000 on-chain writes. It runs Sunday 20:00 to Friday 20:00 ET, then stops dead for 48 hours. That silence is the hole.</i>', 5600);
await hush();

await card('So what is it worth,',
  'during the 48 hours when <span class="k">nobody</span> is quoting it?', 3000);

// ── 0:36. The answer, and the product ─────────────────────────────────
await page.evaluate(() => window.scrollTo({ top: 0 }));
await page.getByRole('button', { name: 'Simulation' }).click();
await wait(1200);
await page.getByRole('button', { name: 'Sunday risk-off' }).click();
await wait(500);
await page.getByRole('button', { name: /^SPYx/ }).click();
await wait(900);
await say('Noctis answers with a price <b>and an error bar</b>.'
  + '<i>Not a last trade. A forecast of Monday\'s opening auction, published with how wrong it is allowed to be.</i>', 5200);
await hush();

await to('text=REOPEN ASSURANCE', 200);
await say('The trade is free. The only thing you can buy is <b>certainty</b>.'
  + '<i>Pay a premium and a vault makes you whole if Monday opens outside your band.</i>', 5000);
await hush();

// ── 1:00. The money shot ──────────────────────────────────────────────
await page.getByRole('button', { name: /^Pin/ }).click();
await wait(300);
await page.getByRole('button', { name: /^(Cover|Take the gap naked)/ }).click();
await wait(500);
await page.getByRole('button', { name: /^Band/ }).click();
await wait(250);
await page.getByRole('button', { name: /^(Cover|Take the gap naked)/ }).click();
await wait(500);
await page.getByRole('button', { name: /^Raw/ }).click();
await wait(250);
await page.getByRole('button', { name: /^(Cover|Take the gap naked)/ }).click();
await wait(600);
await page.evaluate(() => window.scrollTo({ top: 0 }));
await page.getByRole('button', { name: /run the opening auction/ }).click();
await wait(1600);
await say('Monday. The auction prints <b>2.7% below the mark</b>.', 3000);
await hush();

await to('text=ASSURANCE RECEIPTS', 320);
await say('Three identical trades. Three outcomes.'
  + '<i>Naked: −$862. Band: paid $25, recovered $585. Pin: paid $118, and lost exactly that. The premium was the whole downside.</i>', 6400);
await hush();

// ── 1:30. Does it work ────────────────────────────────────────────────
await to('text=DOES ANY OF THIS ACTUALLY WORK', 200);
await page.getByRole('button', { name: /Run \d+-night backtest/ }).click();
await wait(2000);
await to('text=DOES ANY OF THIS ACTUALLY WORK', 200);
await say('200 weekends the model never saw. <b>58% better</b> than the last close.'
  + '<i>And the error bar is honest: 75% of prints land inside one sigma, 95% inside two. Which identified the distribution as a Student-t, and made the product cheaper, not dearer.</i>', 7000);
await hush();

// ── 1:52. Pre-IPO ─────────────────────────────────────────────────────
await page.evaluate(() => window.scrollTo({ top: 0 }));
await page.getByRole('button', { name: 'Pre-IPO' }).click();
await wait(11000);
await to('text=EVERY NAME, AND EVERY DISAGREEMENT', 250);
await say('Now take the bell away entirely, pre-IPO tokens have <b>no exchange at all</b>.'
  + '<i>The gap spans thirty points. And a second issuer disagrees by 56% on what Kalshi is worth. Nobody knows to within a factor of two.</i>', 6600);
await hush();

// ── 2:10. The bug ─────────────────────────────────────────────────────
await card('We went looking for holes in our own settlement path.',
  '<span class="k">We found one.</span><br><br>'
  + '<span style="font-size:19px;color:#8b93a2">The opening print stayed on the account forever, so the next weekend you could buy cover '
  + 'in whichever direction last Monday favoured, and settle instantly. Repeat until the vault is empty.</span>', 7000);

await card('Closed.',
  'Receipts now carry the window they were written in.<br>'
  + '<span class="k">18 on-chain tests. One of them runs the attack.</span>', 3600);

await card('Noctis',
  'Wall Street closes. The chain doesn\'t.<br>'
  + '<span class="k">shaurya-m002.github.io/noctis</span>', 3600);

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
