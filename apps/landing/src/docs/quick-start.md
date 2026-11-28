---
title: Quick start
description: Try Killswitch in the web app on the Base Sepolia test network, or run the whole system on your own machine against a local chain.
---

## In the web app

The web app runs on Base Sepolia with test tokens, so nothing here costs real money.

1. **Connect your wallet.** MetaMask, Coinbase Wallet, Rabby or another browser wallet. It becomes the owner: the only key that can change limits, approve payments or stop agents. The app asks it to switch to Base Sepolia, and sends a new owner a little test ETH for gas.
2. **Create a protected wallet.** One signature calls `KillswitchFactory.createAccount`. The new wallet is a contract that you own.
3. **Add test USDC** with the button on Home, or move some in with Deposit.
4. **Add an agent** from a template: Trading, Auto-buy, Payments or Pay-per-use. Set the daily cap and the co-sign line, choose how long the grant lasts, and sign once. The app makes a fresh session key in your browser.
5. **Connect your AI.** The app shows the command for Claude Code, the config block for Claude Desktop and the variables for the SDK, with your values filled in. See [Connect your AI](/docs/connect-your-ai).
6. **Watch and decide.** Unusual payments wait for you under approvals, and stopping every agent is one press and hold away.

> The agent's key is shown once. If you lose it, remove the agent and add a new one. A leaked agent key is an inconvenience, not a disaster: it can do no more than its grant allows.

## On your machine

You need Node.js 22 or later and [Foundry](https://book.getfoundry.sh) for `anvil` and `forge`.

```sh
git clone https://github.com/savor3/killswitch
cd killswitch
npm install
./start.sh          # chain, contracts, relay with guardian, web app
npm run demo        # honest work and four attacks on a 1,000 USDC wallet
./stop.sh
```

`./start.sh` starts a local Anvil chain, deploys the contracts, and runs the relay with the guardian and indexer on port 8787 and the web app on port 5175. On the local chain the web app signs in with a local test wallet by itself.

`./start.sh` needs a Linux or macOS shell. On Windows without WSL, start the pieces one by one from the repo root, each in its own terminal:

```sh
anvil --block-time 1 --state data/chain-state.json
npx tsx scripts/deploy.ts           # once, on a fresh chain
npx tsx services/relay/index.ts
npm run dashboard
```

## See it react

```sh
npm run traffic -- 0xYourProtectedWallet
```

A Payments bot makes a normal payment, a first payment to a new address and a suspicious one, so you can watch the app go through, hold for you and reject.

## Run the tests

```sh
npm test
```

Runs the 22 contract tests with Foundry, including a fuzz test that the cap can never be exceeded.

## AI review

Grey-zone operations go to Claude when the relay has an `ANTHROPIC_API_KEY` (put it in `.env`; see `.env.example`). Without one, they are held for you to decide.
