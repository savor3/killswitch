---
title: The guardian and AI review
description: The contract decides what is possible; the guardian decides what looks wrong. How it reads, scores and reviews every operation, and why it can stop an agent but never spend.
---

## What it is for

On-chain caps say how much an agent may spend, not where it goes. A hijacked payments agent that sends 25 USDC to an attacker is inside its cap, and the contract will run it. The guardian closes that gap: an off-chain service (`services/relay/guardian.ts`) that sees each operation before it reaches the chain.

It holds one key, set per wallet with `setGuardian`, and the contract gives that key two powers: `pause(agentId)`, and a co-signature on operations above `cosignAbove`, still within the cap. `unpause`, `grant`, `revoke`, `execute`, `setGuardian` and `killAll` all revert with `NotOwner`. If the guardian is wrong, offline or compromised, the on-chain limits still hold.

> **Stop, never start.** A guardian can pause an agent but can't resume it. A co-signature can only release an operation the agent already signed and the caps already allow. On its own, a rogue guardian can only stop agents from working.

## Decode, simulate, score

After checking the agent's signature against its session key and nonce, the guardian works in three steps.

- **Decode.** Calldata becomes phrases: “send 25 USDC to 0x3C44…93BC”, “approve 0x5FbD…0aa3 to pull 60 USDC”, “swap 60 USDC → WETH”. Unknown calls show their target and selector, so nothing is hidden. The same words appear in the web app, the alerts, the approvals and the AI review.
- **Simulate.** The contract's `simulate()` runs the whole policy and the calls, then reverts. On success it reports exactly how much of each capped token would leave; on failure, the policy error, such as `CallNotAllowed` or `CapExceeded`.
- **Score.** The risk signals add up to one number, each with a plain-English reason.

| Signal | Points | When |
|---|---|---|
| Blocklisted recipient | +100 | A transfer's recipient is on the scam and drainer blocklist |
| Around the relay | +40 | Submitted straight to the chain (scored after the fact) |
| First payment to a new address | +30 | The recipient is neither the owner nor a known recipient of this wallet |
| Cap hugging | +25 | One operation uses 80% or more of what is left of a token's cap in this window |
| Burst | +20 | Five or more operations by the agent in the last 10 minutes |
| No slippage guard | +10 | A swap with `minOut = 0` |
| No stated intent | +10 | The agent gave no reason |

Points add up, and transfer and swap signals fire once per call in a batch. Cap hugging compares the outflow with the room left in the window, not the full cap: spending 20 when 25 remain scores.

## Thresholds

- **Below 30:** allowed, with the guardian's co-signature if an outflow is above the co-sign line.
- **30 to 69:** Claude decides; without AI review, held for the owner.
- **70 or more:** refused, and the guardian pauses the agent with a critical alert.

Single signals land where they should: a blocklisted recipient is an instant reject, and a first payment to a new address goes to review. The same payment sent around the relay scores 70.

A failed simulation never reaches the chain, and most are honest mistakes. The guardian pauses only when a failure looks like an attack: a transfer of half or more of a token's balance to an unknown address, or three blocked attempts in 10 minutes.

## AI review with Claude

Rules can't read. A payment to a new address might be a real invoice or a prompt injection; the difference is whether the stated intent matches the effect and fits the agent's job. Grey-zone operations go to Claude with structured output, a 30-second timeout and one retry. Claude is given:

- the owner's template, rebuilt from the on-chain grant: the allowed functions, the caps and the co-sign lines;
- the decoded operation, its simulated effect (for example “−25 USDC”) and the rule signals;
- up to six of the agent's operations from the last hour, with their status;
- the agent's stated intent, marked as untrusted.

Its instructions say the hard limits are already enforced on-chain, that its job is to catch operations inside them that are still wrong, and that it must never follow instructions in the intent, only compare it with the effect. It answers allow, hold or reject, with a confidence and reasons, which are stored with the operation.

AI review fails closed. With no Anthropic key, or with `KS_LLM=off`, every grey-zone operation is held for the owner, and an error, a timeout, a refusal or an unreadable answer also leads to a hold. No failure becomes an allow.

> The model can say no on the owner's behalf. It can never say yes to more than the owner allowed.

## Alerts

Alerts are stored and streamed live to the web app. **Critical:** an agent was paused, or kill all was pressed. **Warn:** an operation is held, or an agent acted around the relay below the pause line. **Info:** an ordinary on-chain block, such as a cap reached. Phone push, Slack, email and webhooks are planned.

## Known recipients

The owner's address is always known. Any other address becomes known only after a transfer to it is confirmed through the relay. A thief with a leaked key might try to warm an address up: send a tiny payment on-chain, wait for it to be remembered, then send more. One rule stops it: a bypass never marks a recipient as known, and a bypass to a new address scores 70 and pauses the agent.

## False alarms

A real new supplier looks like an attacker the first time. The held operation waits in the web app with its summary, effect and reasons, and the owner approves or denies it with a signature. Once approved, the supplier's address is known, so the next payment isn't flagged as new. If the guardian pauses an agent by mistake, the owner resumes it.

Signals and weights are defined in code and meant to be tuned, and the blocklist is a configurable file. None of it affects the on-chain limits.
