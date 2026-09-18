/**
 * Judging-time kill switch.
 *
 * Append `?pyth=off` to the URL and every Pyth code path goes quiet, leaving the
 * rest of live mode exactly as it was. No redeploy, no rebuild, a judge can do it
 * from their own address bar if an RPC is having a bad afternoon.
 *
 * Reads `false` under node, deliberately: `engine/*.ts` runs the backtest and the
 * forecast recorder, and neither should ever reach a network call added for the
 * browser.
 */
export const PYTH_ENABLED: boolean =
  typeof location === 'undefined'
    ? false
    : new URLSearchParams(location.search).get('pyth') !== 'off';
