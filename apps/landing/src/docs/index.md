---
title: Introduction
description: Killswitch gives AI agents spending power without a private key. The limits live in a wallet contract you own, so they hold even if the agent, its key or our servers are compromised.
---

## What Killswitch does

Funds sit in **KillswitchAccount**, a smart-contract wallet with no private key of its own. Its owner is the wallet you already have, such as MetaMask, or a company multisig. Each agent gets a **grant**: its own session key, the exact contract functions it may call, a cap per token per period, an expiry, and a line above which a guardian must co-sign.

On every agent operation the contract checks, in order:

1. The agent is live: it exists, is not paused or expired, and was not cut off by a kill-all.
2. Every call is allowed: each target and function is on the allowlist, and any approval names only a spender the agent may itself call.
3. The real outflow is measured: the balance of every capped token before and after the calls.
4. The caps hold. Otherwise the whole operation reverts with `CapExceeded`.
5. No approval is left open. Otherwise it reverts with `DanglingAllowance`.

Before that, an off-chain **guardian** decodes, simulates and scores each operation. Low-risk operations go through, grey-zone ones go to AI review or to you, and high-risk ones are rejected and the agent is paused on-chain. The guardian can pause and co-sign within the cap. It cannot spend, unpause or widen a limit.

> **The known worst case.** An attacker with full control of an agent can move at most that agent's remaining cap per token, until it is paused or killed. You know this number before the agent's first call.

## The five parts

Only one part holds money. The others add usability and judgement, but none can move funds past a limit.

| Part | Holds | Can move funds? |
|---|---|---|
| `KillswitchAccount` and its factory | Funds, grants, caps, spend windows | Only under its own rules |
| Relay, guardian and indexer | The relayer key, the guardian key, operation history | No |
| AI review | Nothing | No |
| Agent SDK and MCP server | The agent's session key | Only within its grant |
| Web app | Nothing | No |

## What Killswitch is not

- A custodian. It never holds your funds or your keys.
- A new wallet. MetaMask or your multisig becomes the owner of the protected wallet.
- An AI that decides what is safe. AI review only ever adds caution.
- Token-gated. No cap, pause or kill switch depends on $KILL.
- Tied to one chain. It runs on any EVM network without code changes.

## Status

Killswitch works end to end on test networks: a local Anvil chain and Base Sepolia, with test tokens. It has not been audited yet. **Do not use it with real funds.** The mainnet launch follows an independent security audit and moves the guardian and relayer keys into a KMS or TEE. See the [roadmap](/docs/roadmap).

## Where to go next

- [Quick start](/docs/quick-start): the web app on the test network, or the whole system on your machine.
- [Connect your AI](/docs/connect-your-ai): give Claude or any MCP agent a wallet it cannot empty.
- [The protected wallet](/docs/protected-wallet): how the contract enforces every limit.
- [Agent SDK](/docs/sdk): for agents you write yourself.
