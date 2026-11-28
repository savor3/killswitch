---
title: Stopping agents
description: Four ways to stop an agent, from a pause you can undo to one transaction that voids every permission, how kill-all works, and what to do in an incident.
---

## Four ways to stop

Each one is a check that runs before every agent operation and every simulation.

| | Pause | Revoke | Expire | Kill all |
|---|---|---|---|---|
| Call | `pause(agentId)` | `revoke(agentId)` | none: time passes `validUntil` | `killAll()` |
| Who | Owner or guardian | Owner | Nobody | Owner |
| Scope | One agent | One agent | One agent | Every agent |
| The agent then fails with | `AgentIsPaused` | `UnknownAgent` | `PermissionExpired` | `AgentKilled` |
| Undo | `unpause`, by the owner | A new grant | A new grant | A new grant for each agent |

**Pause** is for suspicion: the grant, its limits and its windows stay, ready to resume. **Revoke** retires one agent for good, clearing its rules, limits, windows and session key. **Expiry** bounds exposure by default, even for an agent you forgot. **Kill all** is for emergencies when you don't know how far the damage goes.

None of these touch the owner. `execute()` skips every agent check, and a contract test presses kill all and then withdraws everything as the owner.

## How kill all works

Looping over every agent would cost gas per agent and could fail on a busy wallet, exactly when it matters. Killswitch uses a counter:

```sol
/// The big red button: every agent permission dies in one transaction.
function killAll() external onlyOwner {
    unchecked { epoch++; }
    emit KilledAll(epoch);
}
```

Every grant stamps the agent with the epoch of its day. After `killAll()` no older stamp matches, so every agent reverts with `AgentKilled`. The cost is the same however many agents there are, and it needs no relay and no web app: any tool that sends a transaction, even a block explorer, will do.

## Work in flight

Checks run when an operation executes, so work in motion stops too. A signed operation still with the relay, or waiting in the mempool, reverts if the stop landed first. A held operation can't be released once its agent is revoked, killed or paused, and a held operation past its signed deadline can't run at all. Operations already mined are final; that is why caps exist.

## When the guardian pauses on its own

The guardian pauses an agent on-chain, without waiting, when:

- an operation through the relay scores 70 or more, or AI review rejects it;
- a blocked operation tries to send half or more of a token's balance to an unknown address;
- an agent has three blocked attempts in 10 minutes;
- an operation that went around the relay scores 60 or more.

Each pause raises a critical alert. Only the owner can resume, so the guardian can afford to be cautious.

## In an incident

Stop first, investigate second.

1. **Stop.** Pause the agent you suspect. If you aren't sure which, or your machine may be compromised, stop all agents.
2. **Look and contain.** Read the decoded operations and the alerts. Deny any held operation you don't recognise. If the guardian's key may be exposed, replace the guardian with `setGuardian`.
3. **Fix and recover.** Remove the cause, then grant again with fresh keys and the tightest template that works.

For a company: agree in advance who signs kill all on the owner multisig, name one person to own the incident and record the transaction hashes, size the loss against each wallet's known worst case, rotate the guardian and relayer keys if the relay's host is in doubt, and grant agents again one by one.

## After kill all

Kill all is final for the grants it voids. To start again, grant agents anew: new grants carry the current epoch and work at once. Always use fresh session keys, since the old ones may be the cause. If you reuse an `agentId`, its nonce keeps rising, so old signed operations can't be replayed. The funds never moved: they stayed in the same protected wallet the whole time.

A company-wide stop, one approved action that stops every agent on every wallet of an organisation, is planned for Killswitch for Teams.
