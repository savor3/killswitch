---
title: Questions
description: Short answers about safety, custody, what happens when our servers or an agent's key fail, which wallets and chains work, the cost, and the $KILL token.
---

## Can I use it with real money?

Not yet. Killswitch runs on test networks with test tokens and has not been audited. Real funds wait for the gate on the [roadmap](/docs/roadmap): an external audit of the contracts, with its findings resolved, and secure custody for the operational keys.

## Do you hold my funds or my keys?

No. Your funds sit in a protected wallet that is your own contract, owned by your own wallet. Your wallet's key never leaves it. The relay holds two keys of its own: one that pays gas and can't change what an agent signed, and the guardian's, which can pause an agent and co-sign within its caps, nothing more.

## Can Killswitch move my money?

No. Only the owner can grant, revoke, unpause, change the guardian or call `execute`. The contract has no admin key of ours and no upgrade proxy.

## What if your servers go down?

Your limits keep working: they live in your contract. Agents can't spend through the relay while it is down, and you can always act directly. Pausing, revoking and stopping every agent are your own transactions to your own contract, and any tool that sends a transaction, even a block explorer, will do.

## What if an agent's key leaks?

The thief can do no more than the grant allows: call the allowed functions, in steps up to the co-sign line, until the cap is used up. The indexer sees operations that skip the relay and pauses the agent, and you can pause or remove it yourself at any time. In the attack demo a stolen key got 9 USDC out of 1,000.

## What if my own wallet is compromised?

The owner can do anything by design, as with any wallet you hold yourself, so protect it well. For a team, make a multisig the owner, so no single key can change limits or move funds.

## Which wallets and chains work?

Any browser wallet that speaks the standard (MetaMask, Coinbase Wallet, Rabby and others) can be the owner, and so can a multisig. The contracts run on any EVM chain without code changes; the hosted test network is Base Sepolia, and mainnet is planned on Base.

## Do I need $KILL?

No. A protected wallet, its caps and its kill switch work without the token. $KILL will bond the network's independent guardians and pay their review fees; see [the $KILL token](/docs/token).

## What does it cost?

On the test network, nothing: the relayer pays the gas for agents, and a new owner gets a little test ETH. The plan is a free tier with one agent, monthly plans for more, and team pricing; the prices will be set during the retail beta and the Teams pilot.

## Can I run my own guardian?

Yes. The code is open source under the MIT license. Run the relay and guardian yourself and point your wallet at your guardian with `setGuardian`; the on-chain limits work the same either way.

## Where is the code?

On [GitHub](https://github.com/savor3/killswitch): the contract, the relay and guardian, the SDK, the MCP server, the web app, the attack demo and the tests.
