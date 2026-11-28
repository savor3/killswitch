---
title: Agent SDK
description: createKillswitchAgent gives your own agent a capped wallet. It needs a session key and three identifiers, holds no funds and no gas, and every refusal comes back in words.
---

The SDK is one function, `createKillswitchAgent`, built on [viem](https://viem.sh), in `packages/sdk/index.ts`. Your agent needs only the four values the web app shows when you add the agent; it never holds funds or gas.

Nothing in the SDK is trusted for safety. The SDK makes the right thing easy; the contract makes the wrong thing impossible.

## Set up

```ts
import { createKillswitchAgent } from "./packages/sdk/index.js";
import type { Address, Hex } from "viem";

const agent = createKillswitchAgent({
  relayUrl: process.env.KS_RELAY!,
  account: process.env.KS_ACCOUNT as Address,
  agentId: process.env.KS_AGENT_ID as Hex,
  sessionKey: process.env.KS_SESSION_KEY as Hex,
});
```

## Use it

```ts
const s = await agent.status(); // the grant: caps, rules, nonce, paused?

const r = await agent.swap("USDC", "WETH", "20", "Weekly DCA: buy ETH with 20 USDC");

const pay = await agent.transfer("USDC", vendor, "10", "Pay invoice #1042 to Acme Hosting");
if (pay.status === "held") await agent.waitForDecision(pay.id);
```

The last argument is the agent's own reason. The guardian doesn't trust it: it compares it with the simulated effect, so say what you are really doing.

## Methods

| Method | What it does |
|---|---|
| `status()` | This agent's own grant: active, paused or killed, the allowed calls, every cap with what is used and when it resets, and the nonce. |
| `balances()` | The protected wallet's balances, in whole units. |
| `transfer(token, to, amount, reason)` | Sends `amount` (in whole units, such as `"12.5"`) of a token. |
| `swap(from, to, amount, reason, slippageBps = 100)` | Approves the exchange for exactly `amount`, then swaps, with `minOut` from a live quote less the slippage. Leaves no open approval. |
| `send(calls, reason, ttlSec = 1800)` | Signs any list of calls (one to eight) and submits them. `transfer` and `swap` use it. |
| `waitForDecision(id, timeoutMs = 120000)` | Waits for a held operation until the owner approves or denies it. |
| `config()` | The relay's settings: chain, exchange and tokens. |
| `address` | The session key's address. |

`send` signs EIP-712 typed data over the calls, the nonce and the deadline, and posts them to `POST /v1/ops`. The session key never leaves your process. See [an operation, start to finish](/docs/lifecycle) for what happens next.

## Results

Every operation resolves to a result like this:

```ts
type OpResult = {
  id: string;
  status: "confirmed" | "blocked" | "held" | "rejected" | "failed" | "denied";
  verdict: string;
  reasons: string[];
  txHash?: string;
  paused?: boolean;
  remaining?: Record<string, string>; // what is left of each cap this period
};
```

| Status | Meaning |
|---|---|
| `confirmed` | It ran on-chain; `txHash` is the transaction. |
| `held` | It waits for the owner. Don't retry: tell your user it is waiting for approval. |
| `blocked` | The contract would refuse it (for example over the cap, or a call not allowed). It was never sent. |
| `rejected` | The guardian refused it, and may have paused the agent (`paused: true`). |
| `denied` | The owner said no. |
| `failed` | It was sent and failed. |

Policy errors from simulation come back as sentences: `CapExceeded` becomes “over spending cap: … would be used of … allowed this period”. A malformed request, such as a stale nonce, throws an error that starts with `Killswitch:`.

> An agent told “no” must know why, or it will retry and look for a way around. Report the reasons to your user. Safety never depends on the agent listening: a hijacked agent that ignores them still hits the cap, and repeated blocked attempts get it paused.
