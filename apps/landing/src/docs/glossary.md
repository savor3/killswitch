---
title: Glossary
description: The words the Killswitch docs, web app and contract use, from agent and grant to epoch, co-sign line and dangling allowance.
---

| Term | Meaning |
|---|---|
| Agent | An AI program that acts on a protected wallet through a grant, known by its 32-byte `agentId`. |
| Owner | Your existing wallet, or a company multisig. It controls everything. |
| Protected wallet | `KillswitchAccount`: the smart-contract wallet that holds the agents' funds and enforces their limits. It has no private key. |
| Session key | The agent's own signing key. It has power only through its grant. |
| Grant | One agent's permission: its session key, its allowlist, its spend limits and its expiry. |
| Allowlist | The (target, selector) pairs an agent may call, as call rules. Up to 16. |
| Selector | The first four bytes of calldata, naming a function: `0xa9059cbb` is `transfer`. |
| Spend limit | A token's `maxPerPeriod`, `cosignAbove` and `period`. Up to 8 per agent; `address(0)` is ETH. |
| Window | The running total spent since `start`; it resets on the first outflow after a full period. |
| Outflow | The amount of a capped token that actually left, measured by balance difference. |
| Co-sign line | `cosignAbove`: a single outflow above it needs the guardian's signature. |
| Guardian | The off-chain service that reviews operations, pauses agents and co-signs. It can't spend, unpause or widen limits. |
| Relayer | Submits signed operations and pays the gas. It can't change them. |
| Epoch, kill-all | `killAll()` raises the wallet's epoch; every grant from an older epoch stops working at once. |
| EIP-712 | Typed-data signing. Agents sign `AgentOp(agentId, callsHash, nonce, deadline)`. |
| Dangling allowance | A token approval left open after an operation. Forbidden. |
| Simulation | A dry run that reverts with `SimulationResult(outflows)`, so it costs nothing and keeps nothing. |
| Held operation | A grey-zone operation waiting for the owner's decision in the web app. |
| Bypass, indexer | An operation sent straight to the chain; the indexer scores its `AgentExecuted` event and pauses the agent at 60 or more. |
| MCP | Model Context Protocol. The Killswitch server's tools are `wallet_status`, `wallet_send` and `wallet_swap`. |
| KMS, TEE | Key management services and trusted execution environments: the planned home of the guardian, relayer and hosted agent keys. |
| ERC-4337, ERC-7579 | Account abstraction and modular-account standards. Killswitch uses a standalone contract whose logic ports to an ERC-7579 validator and hook. |
| TGE | Token generation event: the day the $KILL contract is deployed and pre-sale tokens become claimable, December 9, 2026. |
