export const usd = (n: number, dp = 2) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const usdSigned = (n: number, dp = 2) =>
  (n >= 0 ? '+' : '−') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const pct = (n: number, dp = 2) => `${(n * 100).toFixed(dp)}%`;
export const pctSigned = (n: number, dp = 2) => `${n >= 0 ? '+' : '−'}${(Math.abs(n) * 100).toFixed(dp)}%`;
export const bps = (n: number) => `${n.toFixed(1)} bps`;
export const compact = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${n.toFixed(0)}`;
