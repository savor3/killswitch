---
title: Grants and templates
description: A grant is everything one agent may do with one wallet. Its fields, its lifecycle, the four built-in templates, and how to work out the most a grant can lose.
---

## Anatomy of a grant

The owner creates a grant with one transaction: `grant(agentId, label, sessionKey, validUntil, rules, limits)`.

| Field | Purpose |
|---|---|
| `agentId` | A 32-byte handle for the agent on this wallet; the web app picks it at random |
| `label` | The agent's name, emitted in `AgentGranted` |
| `sessionKey` | The only key that can sign this agent's operations |
| `validUntil` | The time after which the grant stops working |
| `rules[]` | Up to 16 (target, selector) pairs: the allowlist |
| `limits[]` | Up to 8 tokens, each with `maxPerPeriod`, `period` and `cosignAbove` |

The period and the co-sign line belong to each token's limit, so one agent can have a daily USDC cap and an hourly ETH cap. The session key is made fresh in the owner's browser; the owner's own key never leaves their wallet.

A rule pins one contract and one function: allowing `USDC.approve` does not allow `USDC.transfer`. Any rule that moves a token must target a capped token, or `grant` reverts with `UncappedTokenRule`.

## Lifecycle

- **Grant.** The owner signs `grant`. The agent is stamped with the current epoch and starts unpaused. Granting again replaces the rules, limits and windows but keeps the nonce rising.
- **Pause and unpause.** The owner or the guardian can pause; only the owner can unpause. Guardians can stop agents, never start them.
- **Revoke or expire.** `revoke` deletes the grant. Expiry needs no transaction: after `validUntil`, operations fail with `PermissionExpired`.
- **Kill-all.** `killAll` bumps the wallet's epoch. Every agent granted under an older epoch fails with `AgentKilled`, at a fixed cost, in one transaction.

An agent is active when it exists, is not paused, carries the wallet's current epoch and has not passed `validUntil`.

## Templates

Most owners never write a selector by hand. The web app turns a short form (cap, co-sign line, duration) into exact rules and limits.

| Template | Allowed calls | Cap per 24 h | Co-sign above | Cannot |
|---|---|---|---|---|
| Trading | `USDC.approve`, `WETH.approve`, `DEX.swapExactIn` | 100 USDC and 0.05 WETH | 50 USDC | Send to any address, or use another app |
| Auto-buy | `USDC.approve`, `DEX.swapExactIn` | 20 USDC | 20 USDC | Sell WETH, or send funds |
| Payments | `USDC.transfer` | 50 USDC | 20 USDC | Trade, or touch WETH or ETH |
| Pay-per-use | `USDC.transfer` | 5 USDC | 2 USDC | Trade, or go past its budget |

Durations: 1 day, 1 week (the default), 1 month or 3 months.

A swap is two calls in one operation: approve the exchange for exactly the input amount, then `swapExactIn`. The exchange is on the allowlist, so the spender check passes; it pulls the tokens, the allowance is back to zero, and the open-approval check passes. The input token's outflow counts against its cap.

> **Why Auto-buy can't sell.** It has no `WETH.approve` rule and no WETH cap. To sell WETH the exchange must pull it, which needs an allowance the agent cannot create, and the owner could not add the rule without also adding a WETH cap. The restriction is structural: no prompt can talk it out of it.

Payments and Pay-per-use both use a single rule, `USDC.transfer`, and differ only in size. Recipients are not restricted on-chain, but the guardian scores a first payment to an unknown address as risky, so it is reviewed or held for you.

## Designing a policy

- **One job per agent.** Separate keys, caps and kill paths for trading and for payments.
- **Cap to the job, not the balance.** Set the cap to a normal day's need.
- **Set the co-sign line near the typical operation.** Routine work flows; outliers get a second look.
- **Prefer short expiries.** Renewing is one signature; a forgotten grant is standing risk.
- **Size for the window boundary.** Fixed windows let two full caps leave across a reset.

## The most a grant can lose

For one token, over the time `T` left until `validUntil`:

```text
Lmax(token) = maxPerPeriod × (T / period + 1)
```

Take a Trading grant with the defaults, valid for one week, and assume the key leaks, the guardian is offline and the owner is asleep. In any window at most 100 USDC and 0.05 WETH can leave, in steps of at most 50 USDC, and approvals can only go to the allowed exchange. If nobody ever reacts, a week bounds the outflow at 8 × 100 = 800 USDC and 0.4 WETH.

The real loss is far lower. The Trading agent's only way to spend is one exchange function, so its outflow buys the other token; the loss is a bad price, which the SDK's `minOut` guard limits. Meanwhile the guardian pauses hostile agents, and one owner transaction ends everything. You know the worst case before the agent's first call: it comes from the grant, not from the agent's good behaviour.
