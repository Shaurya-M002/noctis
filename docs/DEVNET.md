# Devnet lifecycle, every step, on a public chain

Produced by `npx tsx engine/devnet-lifecycle.ts`. Click any signature.

**Read the live state yourself:** `npx tsx engine/devnet-state.ts`, no wallet, no
setup. It prints whatever the chain says right now.

- Program: [`NoCTajFqJn1QScfX3KozwSitGzcVf6muHLKXoKQhbhE`](https://explorer.solana.com/address/NoCTajFqJn1QScfX3KozwSitGzcVf6muHLKXoKQhbhE?cluster=devnet)
- Asset is a devnet **Token-2022** stand-in for AAPLx, `4mWqeoKpepZTjiNgodKtzRznnEFiEHMUeUcPuJbJZ7mz`.
  xStocks only exist on mainnet ([`XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp`](https://explorer.solana.com/address/XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp)).
  Token-2022 on purpose: that is what the real one is, so this exercises the same interface path.
- Quote asset is a devnet stand-in for USDC, `FVKAZkYczRhdEeZXBYYW3EFhVYdtj9o1dveRwMqsESW6`

## Accounts

Every one of these is live and inspectable, with its full transaction history:

- [Config](https://explorer.solana.com/address/AXf82RjSVz3F7q752f1GD5Lxek9znNG3gcRjEMzPyTeT?cluster=devnet), authority, oracle, quote mint, protocol take
- [Vault](https://explorer.solana.com/address/95AEBKKB4sHLEsRLxc1yVB91RNWgdKrufAWviijdn1NG?cluster=devnet), TVL, the two risk legs, premiums and payouts to date
- [AssetMark](https://explorer.solana.com/address/9yaWhd39eJC7juGicwaSEQ6Z85n7tnMHFLr6KUKJbtBQ?cluster=devnet), mid, sigma, epoch, the opening print
- [Receipt](https://explorer.solana.com/address/JAkrmGsgBniWrM87nn8yjsr8W5EpsNgZ1b4uTFnCJPo5?cluster=devnet), this position, its frozen sigma, settled flag

Initialise, register-asset and the LP deposit ran on the first invocation; this
script skips them when they already exist, so they are not in the table below.
Their transactions are in the account histories above.

## This run

| step | what it proves | tx |
|---|---|---|
| publish a weekend mark WITH its uncertainty | mid 230.96, sigma 7900 ppm (0.79%), session = WEEKEND | [`2EBRq8cGuq3wWTp1…`](https://explorer.solana.com/tx/2EBRq8cGuq3wWTp1ctBAh3dDE8TJtnRtNHmmeayfGxMyYZschveshj8anNH5b8s38ys19oVYMKr5BmJhQGt5T9Bx?cluster=devnet) |
| buy Pin cover on 50 AAPLx | zero fee, zero spread. The only charge is the premium | [`49u6SNJN9YAWadfq…`](https://explorer.solana.com/tx/49u6SNJN9YAWadfqu7ph7T2AHMh8uTbuH3FRoDwLjKDfk4JMx2HYWuzMeDDpmG7aNQoRCPE4sMnW52s9yWrVDn6C?cluster=devnet) |
| Monday 09:30. The auction prints | 224.30. 2.88% below the mark, well outside the 0.79% band | [`26K2TLx3PQnByou6…`](https://explorer.solana.com/tx/26K2TLx3PQnByou6TEKPNHZ2J2Q5FLQRfgfMAF7aC2WsciMwaCGnQCSjLJr68QV1kjrNmXYVjjonZ6Tx6K3mav79?cluster=devnet) |
| settle the receipt (permissionless crank) | vault pays the gap beyond the deductible | [`382dqcSVe4TdcusR…`](https://explorer.solana.com/tx/382dqcSVe4TdcusRdsximKuyq25kxWafUFyNPzm3f4Us1cWTkxfpjrwb41nUH7No4w8cjwysYKNCYZmY67BvasUg?cluster=devnet) |

## Outcome

The auction printed 2.88% below the mark. Against a 50-share long that is a
**$333.00** move. What the holder actually experienced:

| | |
|---|---|
| position marked to the open | −$333.00 |
| vault payout | +$333.00 |
| premium paid | −$34.12 |
| **net** | **−$34.12** |

Their entire loss was the premium. The $34.12 is the whole downside of a
$333.00 gap, and it was quoted before they took the position.

The other side is real too: the vault is down **$298.88** on this one.
Someone was short that gap and they paid. That is what underwriting is.

Settled on a public chain in 4 transactions, by a permissionless crank.

## Cumulative vault state

This script has been run more than once, so the vault carries more than the single
position above:

- premiums collected **$102.35**
- payouts paid **$999.00**
- LP net **−$896.65**

Every run deliberately posts a 2.88% adverse gap, so the vault loses every time.
A realistic book sees that outcome on roughly 1 night in 9, see the backtest.
