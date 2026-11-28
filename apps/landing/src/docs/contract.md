---
title: Contract reference
description: Every external function, event and custom error of KillswitchAccount, the order of its checks, its limits and its gas costs.
---

The contracts are in `contracts/src`: `KillswitchAccount.sol` (the protected wallet) and `KillswitchFactory.sol`. They compile with Solidity 0.8.28, the optimizer at 200 runs and `via_ir = true`.

## Functions

| Function | Caller | What it does |
|---|---|---|
| `execute(calls)` | Owner | Runs calls with no policy checks |
| `grant(agentId, label, sessionKey, validUntil, rules, limits)` | Owner | Creates or replaces a grant at the current epoch; refuses self-calls and token-moving rules on uncapped tokens |
| `revoke(agentId)` | Owner | Deletes a grant |
| `killAll()` | Owner | Raises `epoch`, voiding every grant |
| `pause(agentId)` | Owner or guardian | Stops one agent |
| `unpause(agentId)` | Owner | Resumes an agent |
| `setGuardian(address)` | Owner | Replaces the guardian |
| `executeAsAgent(agentId, calls, deadline, agentSig, guardianSig)` | Anyone | Checks the agent, deadline and signatures, uses the nonce, runs the five checks, returns the outflows |
| `simulate(agentId, calls)` | Anyone | Dry run; always reverts |
| `opDigest(…)` | View | The EIP-712 digest to sign |
| `getAgent`, `getRules`, `getLimits`, `agentIds` | View | An agent's state, its allowlist, its limits, every agent id |
| `spent(agentId, token)` | View | `used`, `max` and `resetsAt` |
| `owner`, `guardian`, `epoch`, `MAX_LIMITS`, `MAX_RULES`, `eip712Domain` | View | Public state, the limits (8 and 16) and the ERC-5267 signing domain |
| `receive()` | Anyone | Accepts ETH |

`KillswitchFactory.createAccount(guardian, salt)` deploys a wallet owned by the caller, through CREATE2, and emits `AccountCreated`. `accountsOf(owner)` lists an owner's wallets.

## Order of checks

`executeAsAgent` first checks the agent: it must exist, its epoch must match the wallet's, it must not be paused, and it must not be past `validUntil`. Then it checks the deadline, recovers the session key from `opDigest` and uses up the nonce. `_run()` follows:

1. **Allowlist.** Every call must match a rule. Self-calls are refused, approvals may only name one of the agent's call targets, and native value needs an ETH cap.
2. **Snapshot.** The balance of every capped token.
3. **Execute.** Any failing call reverts the whole operation.
4. **Measure.** Outflow by balance difference; the window rolls if a period has passed; `CapExceeded` past the cap; co-sign flagged above `cosignAbove`.
5. **Allowances.** `DanglingAllowance` if any approval to a rule target remains.

If a co-signature is required and no valid one was given, the operation reverts with `CosignRequired`.

## Events

| Event | Emitted when |
|---|---|
| `AgentGranted(agentId, sessionKey, validUntil, label)` | A grant is created or replaced |
| `AgentRevoked(agentId)` | A grant is revoked |
| `AgentPaused(agentId, by)` | The owner or the guardian pauses an agent |
| `AgentUnpaused(agentId)` | An agent is resumed |
| `KilledAll(newEpoch)` | Kill all |
| `GuardianChanged(guardian)` | At deployment, and on `setGuardian` |
| `AgentExecuted(agentId, nonce, submitter, cosigned, outflows)` | An agent operation succeeded |
| `OwnerExecuted(calls)` | The owner ran `execute` |

The chain is the independent record: from these events anyone can rebuild a wallet's history without trusting our database.

## Errors

| Error | Raised when |
|---|---|
| `NotOwner`, `NotOwnerOrGuardian` | The caller lacks the role |
| `UnknownAgent` | The agent is missing or revoked |
| `AgentIsPaused` | The agent is paused |
| `AgentKilled` | The grant's epoch is stale |
| `PermissionExpired` | Past `validUntil` |
| `DeadlinePassed` | The signed deadline has passed |
| `BadAgentSignature` | Not signed by the session key, or a stale nonce |
| `CallNotAllowed(target, selector)` | A call is not on the allowlist |
| `SelfCallForbidden` | A rule or a call targets the wallet itself |
| `NativeValueNotAllowed` | ETH sent without an ETH cap |
| `UncappedTokenRule(token)` | A `transfer`, `approve` or `transferFrom` rule on an uncapped token |
| `SpenderNotAllowed(token, spender)` | An approval names a spender that is not one of the agent's call targets |
| `CapExceeded(token, used, max)` | The window would pass `maxPerPeriod` |
| `CosignRequired(token, outflow, threshold)` | Above `cosignAbove` without a co-signature |
| `BadGuardianSignature` | The co-signature is not the guardian's |
| `DanglingAllowance(token, spender)` | An approval remains after the operation |
| `CallFailed(index, reason)` | An inner call reverted |
| `TooMany`, `BadPeriod` | Over 16 rules or 8 limits; a zero period |
| `Reentrancy` | A guarded function was entered again |
| `SimulationResult(outflows)` | The end of every successful `simulate` |

## Size and gas

| Measure | Value |
|---|---|
| Runtime size | 10,120 bytes (14,456 under the 24,576 limit) |
| `executeAsAgent`, median | 144,018 gas |
| `grant`, median | 264,621 gas |
| `pause` / `killAll` | 29,766 / 29,662 gas |
| `createAccount` | 2,178,659 gas |

From `forge build --sizes` and `forge test --gas-report`, with test tokens; real tokens will differ.
