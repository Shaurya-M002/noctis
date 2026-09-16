/**
 * Pre-IPO tokens: PreStocks on Solana mainnet.
 *
 * These are the same shape of problem as an xStock at the weekend, except the
 * weekend never ends. There is no exchange, no closing bell and no reopening
 * auction — the only reference is a mark the issuer publishes from off-chain
 * secondary-market data, and the token trades against it around the clock.
 *
 * Mints verified on mainnet; all eight are Token-2022 with 9 decimals.
 */

export interface PreIPOName {
  sym: string;
  company: string;
  mint: string;
  /** Loose grouping used to read the cross-section. Not a fitted sector. */
  group: 'AI' | 'Prediction' | 'Space' | 'Defense' | 'Neuro';
  /** The same company tokenised by Tessera, where one exists. */
  rival?: string;
}

export const PREIPO: PreIPOName[] = [
  { sym: 'OPENAI',     company: 'OpenAI',     group: 'AI',
    mint: 'PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF', rival: 'openai' },
  { sym: 'ANTHROPIC',  company: 'Anthropic',  group: 'AI',
    mint: 'Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw' },
  { sym: 'FIGUREAI',   company: 'Figure AI',  group: 'AI',
    mint: 'PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd' },
  { sym: 'KALSHI',     company: 'Kalshi',     group: 'Prediction',
    mint: 'PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua', rival: 'kalshi' },
  { sym: 'POLYMARKET', company: 'Polymarket', group: 'Prediction',
    mint: 'Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP' },
  { sym: 'SPACEX',     company: 'SpaceX',     group: 'Space',
    mint: 'PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh', rival: 'spacex' },
  { sym: 'ANDURIL',    company: 'Anduril',    group: 'Defense',
    mint: 'PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB' },
  { sym: 'NEURALINK',  company: 'Neuralink',  group: 'Neuro',
    mint: 'PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S' },
];

export const preBySym = (s: string) => PREIPO.find((p) => p.sym === s);
