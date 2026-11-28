---
title: An operation, start to finish
description: Every agent operation passes two independent gates, the guardian off-chain and the wallet contract on-chain. What the agent signs, how the relay scores it, and what happens next.
---

## The five steps

1. **The agent asks**, through the SDK (`swap`, `transfer`, `send`) or the MCP server (`wallet_send`, `wallet_swap`), with a reason in plain words.
2. **The SDK signs.** It builds the calls, reads the nonce, sets a deadline and signs an EIP-712 `AgentOp`.
3. **The relay verifies, simulates and scores.** It recovers the signer, previews the outflows with `simulate()`, and reaches a verdict.
4. **Submit and enforce.** The relayer sends `executeAsAgent` and pays the gas; the contract runs its five checks.
5. **Stream.** The indexer reads `AgentExecuted` and pushes it to the web app.

## What the agent signs

```ts
domain: { name: "Killswitch", version: "1", chainId, verifyingContract: account },
types: {
  AgentOp: [
    { name: "agentId", type: "bytes32" },
    { name: "callsHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
},
message: { agentId, callsHash: callsHash(calls), nonce, deadline }
```

`callsHash` is the keccak hash of the encoded (target, value, data) list, so changing one byte of any call changes the hash.

- **Nonce.** One counter per agent, raised on every success. A replay fails with `BadAgentSignature`, and granting again keeps it rising.
- **Deadline.** 30 minutes by default; after it, `DeadlinePassed`.
- **Domain.** The chain id and the wallet's address make a signature useless anywhere else.

Nonces are sequential. If a held operation is overtaken by another that executes, it carries a stale nonce and fails cleanly when approved; the agent must sign again.

## Verify, simulate, score

`POST /v1/ops` takes one to eight calls, the deadline, the signature and an intent of up to 500 characters. The relay rebuilds the typed data at the agent's on-chain nonce and recovers the signer; only a valid session-key signature is recorded.

It then calls `simulate()`. A `SimulationResult` revert gives the exact outflows. Any other revert marks the operation **blocked**, and it is never submitted. A blocked transfer of half or more of a balance to an unknown address, or three blocked attempts in ten minutes, escalates to a pause.

| Signal | Points |
|---|---|
| Recipient on the scam or drainer blocklist | +100 |
| Submitted straight to the chain, around the relay | +40 |
| First payment to an unknown address | +30 |
| Uses 80% or more of the remaining cap | +25 |
| Five or more operations in 10 minutes | +20 |
| A swap with `minOut = 0` | +10 |
| No stated intent | +10 |

Below 30 the operation is allowed. From 30 to 69 it goes to AI review, or is held for you when there is no reviewer. At 70 or more it is rejected and the agent is paused on-chain.

| Verdict | Effect |
|---|---|
| Allow | Submitted at once |
| Co-sign | Allowed with an outflow above `cosignAbove`: the guardian signs the same digest |
| Hold | Waits for the owner to approve or deny |
| Reject | Never submitted; the guardian pauses the agent on-chain |

## Your approval

To release a held operation, the owner signs `Killswitch: approve operation <id>` in their wallet (or `deny`). The relay accepts only the wallet's on-chain owner, checks the deadline and the agent's state again, simulates again, and submits with the agent's original signature. Approval releases the operation; it never changes it.

## Submission and enforcement

The relayer calls `executeAsAgent(agentId, calls, deadline, agentSig, guardianSig)` through a queue shared with the guardian, so their nonces never collide. It has no authority of its own: it can refuse to submit, but it can't change an operation without breaking the signature.

The contract ignores the relay's verdict and runs its own checks. On success it emits `AgentExecuted`; the relay marks the recipients as known and returns what is left of the allowance. The indexer polls every second, up to 2,000 blocks at a time, and the web app follows the server-sent event stream at `GET /v1/stream`, so it updates without a refresh.

## Around the relay

A leaked key can skip the relay and call `executeAsAgent` directly. Every on-chain limit still applies, and above the co-sign line the attacker is stuck. The indexer treats any `AgentExecuted` not submitted by our relayer as a bypass, scores it with 40 points added, and pauses the agent at 60 or more. A bypass never marks a recipient as known, so an attacker can't warm up an address.

In the attack demo, a thief with the Payments key tried 100 USDC directly: it reverted. A 9 USDC transfer under the co-sign line went through. The indexer paused the agent, and the next attempt reverted.

> The relay decides what to send. The contract decides what happens.
