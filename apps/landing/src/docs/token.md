---
title: The $KILL token
description: $KILL is the bond and the unit of payment for a network of independent guardians. What it will do, what it is never needed for, its supply and the pre-sale.
---

Today the guardian is one key on one server, run by us. Chapter 9 of the whitepaper states what that costs: a guardian key together with a leaked session key removes the co-sign line, and a guardian acting alone can pause every agent it guards. A network of independent guardians, each with a bond at risk, removes that single point of trust. Putting money at risk across operators who don't know each other is the job a staked token does.

> **The caps never depend on $KILL.** A protected wallet, its limits and its kill switch work with no token, and no stake or vote can change them.

## What it will do

| Job | How it will work | Replaces |
|---|---|---|
| Guardian bond | An operator stakes $KILL to guard wallets. The bond must cover the caps it guards; provable faults are slashed and paid first to the owner who was harmed. | One guardian key run by Killswitch |
| Review fees | Each reviewed operation carries a fee priced in dollars and settled in $KILL. Customers can pay in fiat or stablecoins; the network buys $KILL to pay the guardian. | Per-review fees paid to the company |
| Blocklist listing | Anyone stakes $KILL to add a scam or drainer address to a shared blocklist. A listing that loses a challenge forfeits its stake. | A blocklist file on the relay |
| Governance | Holders vote on fee levels, the bond ratio, slashing rules and default risk weights. | Constants in the code |

None of the four is live at the token generation event (TGE). No vote can reach a user's wallet: `KillswitchAccount` has no admin key and no upgrade proxy.

## Supply

$KILL is an ERC-20 token on Base, with a fixed supply of 1,000,000,000. The token contract has no mint function, so none can be made after TGE.

| Allocation | Share | Unlock |
|---|---|---|
| Pre-sale | 10% | 100% at TGE |
| Liquidity | 5% | 40% at TGE, then monthly over 12 months |
| Community and ecosystem | 15% | 10% at TGE, then monthly over 24 months |
| Guardian rewards | 30% | From the launch of staking on mainnet, monthly over 48 months |
| Treasury | 20% | 6-month cliff, then monthly over 36 months |
| Team and advisors | 20% | 12-month cliff, then monthly over 36 months |

## The pre-sale

100,000,000 $KILL, a tenth of the supply, at $0.0025 each, opening on Thursday, December 3, 2026 at 15:00 UTC, with a hard cap of $250,000. Every pre-sale token unlocks at TGE on Wednesday, December 9, 2026. The sale runs on an established launch platform, not on a contract of ours, and its limits and eligibility are set in the sale terms published before it opens.

[See the pre-sale page](/presale) for the countdown, the price, who has committed and the use of proceeds, and read chapter 15 of the [whitepaper](/killswitch-whitepaper.pdf) for the full design.

$KILL is a utility token for the guardian network. Nothing here is financial advice or a promise of price or profit.
