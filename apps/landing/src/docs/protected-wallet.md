---
title: The protected wallet
description: KillswitchAccount is the only part of Killswitch that holds money. Its owner, its storage, the five checks every agent operation must pass, and its spend windows.
---

## Ownership

The protected wallet is a smart contract with no private key of its own. Its authority comes from two stored addresses: an **owner** and a **guardian**. The owner is your existing wallet: MetaMask, any other account, or a company multisig.

The owner can do everything, including any call through `execute`, with no delay and no co-signer. Killswitch protects you from your agents, not from yourself. The guardian can pause an agent and co-sign large operations, nothing more.

| Function | Caller | Effect |
|---|---|---|
| `execute` | Owner | Any calls from the wallet, with no limits |
| `grant` / `revoke` | Owner | Create, replace or delete an agent's permission |
| `killAll` | Owner | Bump the epoch: every existing agent stops working |
| `pause` | Owner or guardian | Freeze one agent |
| `unpause` / `setGuardian` | Owner | Resume an agent; replace the guardian |
| `executeAsAgent` | Anyone | Run a signed agent operation inside its grant |
| `simulate` | Anyone | Dry-run an agent operation; always reverts |

Wallets are made by `KillswitchFactory.createAccount(guardian, salt)`, and the caller becomes the owner. The factory uses CREATE2 with a salt derived from the caller, so owners never collide on an address. It keeps a list of each owner's wallets (`accountsOf`), holds no funds and has no admin.

## What it stores

- An **agent** record holds the session key, `validUntil`, the epoch it was granted under, a replay nonce, and two flags: `paused` and `exists`.
- A **call rule** is one allowed pair of contract address and function selector. Up to 16 per agent.
- A **spend limit** caps one token with its own `maxPerPeriod`, `period` and `cosignAbove`; `address(0)` means native ETH. Up to 8 per agent.
- A **window** tracks how much was used and when the current period started.

`grant` checks its input when it is written: a zero period reverts with `BadPeriod`, a rule that targets the wallet itself reverts with `SelfCallForbidden`, and a `transfer`, `approve` or `transferFrom` rule on a token without a cap reverts with `UncappedTokenRule`.

## The five checks

Every agent operation enters through `executeAsAgent`. First the agent must exist, its epoch must match the wallet's, it must not be paused and it must not have expired. Then the deadline and the EIP-712 signature are checked and the nonce is used up. Then five steps run in a fixed order:

1. **Allowlist.** Each call must match an allowed (target, selector) pair. Self-calls are refused, so an agent can never reach `grant` or `setGuardian`. An `approve`, `increaseAllowance` or `setApprovalForAll` may only name a spender that is itself one of the agent's call targets, such as the approved exchange. Sending native ETH needs an ETH cap.
2. **Snapshot.** The wallet reads its balance of every capped token.
3. **Execute.** The calls run. If any one fails, the whole operation reverts.
4. **Measure.** The wallet reads the balances again. What left counts against the token's window; if the new total passes the cap, everything reverts with `CapExceeded`, including calls that already ran. A single step above `cosignAbove` needs the guardian's signature.
5. **No open approvals.** Any allowance left on a capped token toward an allowed contract reverts the operation with `DanglingAllowance`.

Because all of it runs in one transaction, a failure at any step leaves balances, windows and the nonce as they were.

## Spend windows

Each pair of agent and token has its own window. It opens at the first outflow after the last window ended and lasts `period` seconds. `spent(agentId, token)` returns what is used, the cap and when it resets.

> **Fixed windows.** Windows are anchored to the first spend, not sliding, so up to twice the cap can move across a reset. Size caps with that in mind.

## Why it measures balances, not intent

Decoding calldata fails in practice. Routers, vaults and bridges move tokens through internal calls the calldata doesn't show, and every protocol would need its own decoder, each a new place to attack. And the intent comes from the very part that might be compromised.

Balance difference works for any protocol. It catches value that leaves by any path the allowed calls can reach, as a net figure: what the wallet actually lost. The agent describes; the wallet measures.

## Co-signing and simulation

If any single operation moves more than a limit's `cosignAbove`, a guardian signature is required. The guardian signs the same EIP-712 digest as the agent, so a co-signature can't be reused, and without it the operation reverts with `CosignRequired`. A co-signature never lifts the cap.

`simulate()` runs the same checks and calls, then always reverts so nothing is kept. On success the revert carries `SimulationResult(outflows)`, one exact figure per capped token; on failure, the policy error that would fire. The relay reads either one with a free `eth_call`.

## Why a standalone contract

One file of policy that an auditor can read end to end, no bundler or EntryPoint in the trust path, and an owner that stays a normal wallet. The policy is isolated in `_run()`, so it ports to an ERC-7579 validator and hook; that port is on the roadmap.

See the [contract reference](/docs/contract) for every function, event and error.
