---
title: Roadmap
description: Five phases and one hard gate. Each phase moves on when its test is met, not on a date, and mainnet follows an independent audit and secure custody for operational keys.
---

Each phase has a scope and an exit test. We move on when the test is met, not when a date arrives, and no dates are set. Each phase adds reach and removes trust; none moves enforcement off-chain.

The order is deliberate: the test network before any real user, people before organisations, and mainnet last, behind a gate. The contract's interface stays the same throughout. A grant on the test network has the same fields as one on mainnet, and the SDK's `swap()`, `transfer()`, `send()` and `status()` don't change.

## 1. Core protocol (done)

The contracts, the relay with its guardian, AI review and bypass indexer, the viem SDK, the MCP server and the web app, working end to end and portable to any EVM chain. In the adversarial simulation on a 1,000 USDC test wallet, honest trades succeed, a prompt-injected payment is rejected and the agent paused, a drain past the cap reverts, a leaked key used directly is paused by the indexer, and kill-all stops everything.

**Exit, met:** `npm run demo` passes every attack scenario.

## 2. Test network

Deployed on Base Sepolia. Owners connect a real MetaMask and grant agents from templates, and a public demo shows attacks failing against test funds: the first test against real block times, public RPCs and wallets we don't control.

**Exit:** the attack scenarios pass on a public network, and the indexer reliably catches operations sent around the relay.

## 3. Retail beta

Killswitch Personal made easy for people who don't write code: a hosted MCP login, phone approvals through the installable web app with push notifications, and the four templates tuned from use.

**Exit:** people go from their wallet to a working agent without help, and can approve or stop agents from a phone.

## 4. Teams pilot

Pilot organisations replace their bots' hot wallets with many protected wallets, a company-wide kill switch, admin, approver and viewer roles, approval rules, and alerts to Slack, email and webhooks.

**Exit:** pilot teams run real workflows on the test network, and finance accepts each wallet's worst case as a number it can use.

## The gate

> **Before any real funds.** An external audit of `KillswitchAccount` and `KillswitchFactory`, with its findings resolved, and the guardian, relayer and hosted agent keys in a KMS or TEE.

Caps already hold if our keys leak. The gate narrows what a leak can do inside them, and confirms the contract is sound.

## 5. Mainnet

| Addition | Why |
|---|---|
| Caps in dollars, through a price oracle | One dollar limit across tokens, instead of a cap per token |
| A MetaMask Snap | Approvals inside the owner's own wallet. We don't plan a browser extension of our own |
| Production operations | Monitoring and incident response for the relay, guardian and indexer |

## Beyond mainnet

Porting `_run()` to an ERC-7579 validator and hook, so Killswitch limits can run inside standard modular accounts.

## The token

The $KILL token has its own order of steps, starting at TGE on December 9, 2026: guardian staking on the test network, a blocklist registry on the test network, an external audit of the token, staking and registry contracts, then bonds, slashing and fees on mainnet. See [the $KILL token](/docs/token).
