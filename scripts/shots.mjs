/** Screenshot the demo in a few known states, for the README and the submission. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL ?? 'http://localhost:5273/';
const OUT = 'media';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1680, height: 1080 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

// Crypto sells off through Sunday and equity beta follows it down at the bell.
// SPYx opens 2.6% below the mark — three sigma — so the assurance actually pays.
await page.getByRole('button', { name: 'Sunday risk-off' }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^SPYx/ }).click();
await page.waitForTimeout(400);

const shot = async (name, opts = {}) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, ...opts });
  console.log('  ✓', name);
};

console.log('capturing…');
await shot('01-overview', { fullPage: true });
await page.screenshot({ path: `${OUT}/02-hero.png`, clip: { x: 0, y: 90, width: 1680, height: 640 } });
console.log('  ✓ 02-hero');

// Attribution + variance budget
const waterfall = page.locator('section', { hasText: 'WHY THE MARK IS THE MARK' }).last();
await waterfall.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await waterfall.screenshot({ path: `${OUT}/03-attribution.png` });
console.log('  ✓ 03-attribution');

// Buy with Pin cover, then run the auction.
await page.getByRole('button', { name: /^Pin/ }).click();
await page.waitForTimeout(200);
const ticket = page.locator('section', { hasText: 'TRADE THE DARK' }).last();
await ticket.scrollIntoViewIfNeeded();
await ticket.screenshot({ path: `${OUT}/04-ticket.png` });
console.log('  ✓ 04-ticket');

await page.getByRole('button', { name: /^BUY / }).last().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /^Band/ }).click();
await page.getByRole('button', { name: /^BUY / }).last().click();
await page.waitForTimeout(300);
// And a naked one, so the comparison is on screen.
await page.getByRole('button', { name: /^Raw/ }).click();
await page.getByRole('button', { name: /^BUY / }).last().click();
await page.waitForTimeout(300);

await page.getByRole('button', { name: /run the opening auction/ }).click();
await page.waitForTimeout(700);
await shot('05-settled', { fullPage: true });

const receipts = page.locator('section', { hasText: 'ASSURANCE RECEIPTS' }).last();
await receipts.scrollIntoViewIfNeeded();
await receipts.screenshot({ path: `${OUT}/06-receipts.png` });
console.log('  ✓ 06-receipts');

// Backtest
await page.getByRole('button', { name: /Run \d+-night backtest/ }).click();
await page.waitForTimeout(1500);
const cal = page.locator('section', { hasText: 'DOES ANY OF THIS ACTUALLY WORK' }).last();
await cal.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await cal.screenshot({ path: `${OUT}/07-backtest.png` });
console.log('  ✓ 07-backtest');

await browser.close();
console.log('done →', OUT);
