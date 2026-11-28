---
title: Security model
description: What Killswitch trusts, who might attack and what each attacker can do, how to compute the most a wallet can lose, and how the contract is tested.
---

## Two layers, two jobs

The on-chain layer sets hard limits that only the owner can change. The off-chain layer applies judgement and can only make things stricter. A claim about the contract holds even if our relay, guardian, database and AI provider are all compromised.

| On-chain: hard limits | Off-chain: judgement |
|---|---|
| An allowlist of (target, selector) pairs | Decoding and simulation |
| Caps per token, measured by balance difference | Risk scoring and AI review |
| A co-sign line, expiry, pause, revoke and kill all | Holds for the owner |
| Approvals only to the agent's own call targets | Review of operations sent around the relay |
| No ERC-20 approval left open | Automatic pause on-chain |
| Replay protection by nonce and deadline | |

Two allowance rules close the classic drain, where an agent approves an outside address that later pulls funds with `transferFrom`. An `approve`, `increaseAllowance` or `setApprovalForAll` may only name one of the agent's own call targets, or it reverts with `SpenderNotAllowed`. And any allowance left at the end of an operation reverts it with `DanglingAllowance`.

## What it trusts

- The chain runs the contract as written and includes transactions.
- The owner's key is safe. It can do anything by design; companies should use a multisig.
- Capped tokens report balances honestly, since caps are measured by balance difference.
- ECDSA and EIP-712, through OpenZeppelin's libraries, are sound.
- The contract is correct. It has 22 tests including fuzzing, and an independent audit comes before mainnet.

The agent, its model, the relay, the guardian and the company behind Killswitch are not on this list.

## Who might attack, and how far they get

| Attacker | Can | Cannot |
|---|---|---|
| A compromised agent | Sign allowed operations within its caps | Call other targets, pass a cap, skip the co-sign line, approve outsiders, act after expiry |
| A leaked session key | Submit on-chain, in steps up to `cosignAbove` | Pass the cap, get co-signed, warm up addresses, act once paused |
| A compromised relay | Delay operations, mislead the web app, act as guardian if it holds that key | Change signed operations, pass caps, grant, spend, block the owner |
| The guardian key | Pause agents, co-sign operations agents signed | Spend, unpause, grant, widen limits, kill all |
| The guardian key and a session key | Take that agent's whole remaining cap | Pass the cap, or touch other tokens and targets |
| A phished owner | Anything the owner signs | Killswitch doesn't stop it |

A tricked owner can sign anything, as with any wallet you hold yourself. The defences are a multisig, a hardware wallet, grants spelled out in plain words in the web app, and a planned MetaMask Snap.

The contract is about 400 lines, with no upgrade proxy, no admin key of ours, and a re-entrancy lock on every entry point that runs calls. Each wallet is its own contract.

## The most a wallet can lose

For every agent `a` and token `k`, over a stretch of time `T` that ends when the agent is paused, revoked, killed or expires:

```text
L(T) ≤ Σ over tokens k of  min( Bk , Σ over agents a of  cap(a,k) × (T / period(a,k) + 1) )
```

`Bk` is the wallet's balance of token `k`. The bound assumes every agent and the guardian are hostile and nobody reacts.

**An example.** A wallet with 1,000 USDC runs the four templates on daily periods: Trading (100 USDC and 0.05 WETH), Auto-buy (20), Payments (50) and Pay-per-use (5), for 175 USDC a day. If everything is compromised and unnoticed for 24 hours, at most min(1,000, 175 × 2) = 350 USDC and 0.10 WETH can leave.

Real exposure is lower. Only the two paying agents can send to an attacker's address, 55 USDC per window; the trading agents can only swap on the approved exchange. With the guardian's key safe, a thief is held to 20 USDC per step, and the first payment to an unknown recipient pauses the agent. In the attack demo, the attacker got 9 USDC out of 1,000.

## The attack demo

`npm run demo` runs an adversarial simulation against a live local chain, relay and guardian, with test tokens. A fresh wallet holds 1,000 USDC; a Trading bot may approve and swap (100 USDC a day, co-sign above 50), and a Payments bot may send USDC (50 a day, co-sign above 20).

| Scenario | Outcome | Attacker's gain |
|---|---|---|
| Swap 20 USDC for WETH | Confirmed | none |
| Swap 60 USDC, over the co-sign line | Confirmed with the guardian's co-signature | none |
| Pay a new vendor 10 USDC | Held or reviewed; the owner approves | none |
| Pay the same vendor 15 USDC | Confirmed; the vendor is now known | none |
| Prompt injection: the Trading bot sends the whole balance to the attacker | Blocked (`CallNotAllowed`); drain pattern; agent paused | 0 |
| Hijacked Payments bot sends 25 USDC as a fake invoice | Score 55; AI rejects, or held and the owner denies | 0 |
| Stolen key, straight on-chain: 100 USDC | Reverts: over the cap | 0 |
| The same thief: 9 USDC, under the co-sign line | Goes through; the indexer scores 70; agent paused | 9 USDC |
| The thief tries 9 USDC again | Reverts: agent paused | 0 |
| The owner presses kill all; the Trading bot tries a 5 USDC swap | Blocked: `AgentKilled` | 0 |

The wallet ends with 886 USDC, and the attacker's total is 9 USDC of 1,000: a loss that is small, known in advance and capped by code.

## Tests

`contracts/test/KillswitchAccount.t.sol` holds 22 Foundry tests, each checking the exact custom error. They cover caps and window resets, the allowlist, open and outsider approvals, co-signing, signatures, replays and deadlines, every stop and every role's boundary, simulation, and the owner's unconditional access. The fuzz test sends six random payments of 1 to 200 USDC to an attacker, each with a valid guardian co-signature, and asserts the total never passes the 50 USDC cap.

## Before mainnet

- **An independent audit** of `KillswitchAccount` and `KillswitchFactory`, with its findings resolved.
- **Key custody.** The guardian, relayer and hosted agent keys move into a KMS or TEE.
- **Caps in dollars** through a price oracle; today caps are per token.
- **A public bug bounty.**

> **The guarantee.** Whatever happens off-chain, an agent can move at most its remaining cap per token until it is paused, revoked, killed or expires. Only the owner can widen that bound.
