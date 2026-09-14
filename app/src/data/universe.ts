/**
 * Demo universe: xStocks-style tokenized equities that trade 24/7 on Solana
 * while their primary venue keeps banker's hours.
 *
 * Closes, betas and residual vols are DEMO DATA calibrated to plausible values,
 * not a live feed. See docs/MODEL.md for how the real thing sources them.
 */

export type FactorId = 'MKT' | 'SECT' | 'CRYPTO' | 'FX' | 'RATES';

export interface Factor {
  id: FactorId;
  name: string;
  /** Where this signal comes from while the NYSE is shut. */
  source: string;
  /** Is this factor itself observable right now? */
  alwaysOn: boolean;
}

export const FACTORS: Factor[] = [
  { id: 'MKT',    name: 'Broad market',   source: 'SPYx on-chain tape + CME e-mini basis',      alwaysOn: true },
  { id: 'SECT',   name: 'Sector',         source: 'Tokenized sector basket, volume-weighted',   alwaysOn: true },
  { id: 'CRYPTO', name: 'Risk appetite',  source: 'BTC/ETH return since ET close',              alwaysOn: true },
  { id: 'FX',     name: 'Dollar',         source: 'DXY / USDC-EURC cross',                      alwaysOn: true },
  { id: 'RATES',  name: 'Rates',          source: 'Tokenized T-bill yield drift',               alwaysOn: true },
];

export interface Asset {
  sym: string;          // AAPLx
  under: string;        // AAPL
  name: string;
  sector: string;
  mint: string;         // Solana SPL mint (real xStocks mints where public)
  /** Last official regular-session close, USD. */
  close: number;
  /** Factor loadings. */
  beta: Record<FactorId, number>;
  /** Annualised idiosyncratic vol, decimal. */
  idioVol: number;
  /** Annualised TOTAL vol, decimal. Drives how far the name can still travel
   *  between now and the opening bell. */
  totalVol: number;
  /** USDC depth within 1% on-chain, demo value. */
  depth: number;
  /** Days until next earnings. 0 = tonight. */
  earningsInDays: number;
}

export const UNIVERSE: Asset[] = [
  {
    sym: 'AAPLx', under: 'AAPL', name: 'Apple', sector: 'Mega-cap tech',
    mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp',
    close: 231.04,
    beta: { MKT: 1.05, SECT: 0.62, CRYPTO: 0.06, FX: -0.18, RATES: -0.22 },
    idioVol: 0.19, totalVol: 0.25, depth: 240_000, earningsInDays: 12,
  },
  {
    sym: 'NVDAx', under: 'NVDA', name: 'NVIDIA', sector: 'Semis',
    mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh',
    close: 178.62,
    beta: { MKT: 1.42, SECT: 1.18, CRYPTO: 0.34, FX: -0.24, RATES: -0.41 },
    idioVol: 0.38, totalVol: 0.47, depth: 310_000, earningsInDays: 0,
  },
  {
    sym: 'TSLAx', under: 'TSLA', name: 'Tesla', sector: 'Autos / growth',
    mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB',
    close: 402.17,
    beta: { MKT: 1.38, SECT: 0.44, CRYPTO: 0.52, FX: -0.11, RATES: -0.48 },
    idioVol: 0.46, totalVol: 0.58, depth: 195_000, earningsInDays: 21,
  },
  {
    sym: 'MSTRx', under: 'MSTR', name: 'Strategy', sector: 'BTC proxy',
    mint: 'XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ',
    close: 318.90,
    beta: { MKT: 0.71, SECT: 0.20, CRYPTO: 2.34, FX: -0.05, RATES: -0.30 },
    idioVol: 0.61, totalVol: 0.82, depth: 88_000, earningsInDays: 30,
  },
  {
    sym: 'SPYx', under: 'SPY', name: 'S&P 500 ETF', sector: 'Index',
    mint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W',
    close: 651.88,
    beta: { MKT: 1.00, SECT: 0.00, CRYPTO: 0.04, FX: -0.14, RATES: -0.19 },
    idioVol: 0.03, totalVol: 0.14, depth: 520_000, earningsInDays: 999,
  },
  {
    sym: 'COINx', under: 'COIN', name: 'Coinbase', sector: 'Crypto financials',
    mint: 'Xs7ZdzSHLU9ftNJsOu2BEw7vtsUsr8HuMSFAiRBHYaC',
    close: 289.44,
    beta: { MKT: 1.15, SECT: 0.30, CRYPTO: 1.62, FX: -0.08, RATES: -0.35 },
    idioVol: 0.52, totalVol: 0.66, depth: 140_000, earningsInDays: 18,
  },
  {
    sym: 'METAx', under: 'META', name: 'Meta Platforms', sector: 'Mega-cap tech',
    mint: 'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu',
    close: 604.31,
    beta: { MKT: 1.18, SECT: 0.71, CRYPTO: 0.09, FX: -0.20, RATES: -0.29 },
    idioVol: 0.27, totalVol: 0.33, depth: 165_000, earningsInDays: 9,
  },
  {
    sym: 'GOOGLx', under: 'GOOGL', name: 'Alphabet', sector: 'Mega-cap tech',
    mint: 'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN',
    close: 246.72,
    beta: { MKT: 1.08, SECT: 0.66, CRYPTO: 0.07, FX: -0.17, RATES: -0.25 },
    idioVol: 0.23, totalVol: 0.29, depth: 180_000, earningsInDays: 14,
  },
];

export const bySym = (s: string) => UNIVERSE.find((a) => a.sym === s)!;
