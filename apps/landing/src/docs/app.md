---
title: The web app
description: How to connect and disconnect your wallet, what each screen of the Killswitch web app shows, and how approvals and the emergency stop work.
---

## Connect and disconnect

Open the app and pick your wallet. It becomes the owner of your protected wallets: the only key that can change limits, approve payments or stop agents. The app asks your wallet to switch to the right network. It never sees your wallet's key, and it never asks you to type a recovery phrase.

To use another account, switch it in your wallet; the app follows. To leave, open the wallet menu and choose **Disconnect**. The site's home page shows the wallet you are connected with, so you can tell at a glance.

## Home

Home answers three questions: is everything safe, how much can my agents spend, and how do I stop them.

The black panel at the top shows the state of things in one word, with the red square that marks state everywhere in the app: all clear, payments waiting for you, an agent paused by the guardian, or every agent stopped.

**What agents can still spend today** is the most important number in the product. For each token it adds what every active agent has left under its cap, takes the smaller of that and the balance, and shows it in dollars. Even a hacked agent can't go past it. If it looks too high, lower a cap.

## Approvals

A held payment shows the agent, what it wants to do, and the guardian's reasons, such as a first payment to a new address. Nothing has moved. **Approve** or **Deny** asks your wallet to sign a message, which is free and sends nothing. The relay checks that the signature is the wallet owner's, checks the agent again, simulates the operation again, and only then submits the agent's own signed operation, unchanged.

A payment held for an agent that has since been paused, removed or stopped can't be approved, and the app says why.

## Stopping agents

- **Pause** one agent: its grant, limits and windows stay, ready to resume.
- **Remove** an agent: its grant, key and limits are deleted for good.
- **Stop all agents**, by pressing and holding: one transaction that voids every agent's permission at once. Your funds stay in your protected wallet. It works even if our servers are down, because it is your own transaction to your own contract.

See [Stopping agents](/docs/stopping-agents) for how each one works on-chain.

## Activity and alerts

Activity lists every operation by day, with its result. Filter it, search it, or export it as CSV. Open an operation to read its whole story: what was asked, what the guardian checked, the AI review, your decision and the transaction.

The bell keeps the guardian's alerts. Turn on browser notifications in Settings to hear when an agent needs you while the tab is in the background.

## Deposit and withdraw

Deposit shows the address of your protected wallet to send tokens to. Withdraw sends tokens back to your own wallet with the owner's `execute`, which no agent limit applies to: Killswitch protects you from your agents, not from yourself.

## On a phone

The app is an installable web app: add it to your home screen to approve and stop agents from your phone. Push notifications for held operations are planned.
