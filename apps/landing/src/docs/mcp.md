---
title: MCP server
description: The Killswitch MCP server gives Claude, ChatGPT or any MCP-capable assistant three tools for a capped wallet: wallet_status, wallet_send and wallet_swap.
---

`packages/mcp/server.ts` wraps the [Agent SDK](/docs/sdk) as tools for AI assistants. It runs over stdio as `killswitch-wallet`, holds only the agent's session key, and needs no funds or gas of its own.

## Run it

```sh
npm run mcp           # straight from the source, with tsx
npm run mcp:build     # or bundle it once into dist/mcp/server.mjs
node dist/mcp/server.mjs
```

The bundle starts faster than the source, which matters when an assistant waits only a short time for its tools to connect. [Connect your AI](/docs/connect-your-ai) shows the exact commands for Claude Code and Claude Desktop.

## Settings

| Variable | What it is |
|---|---|
| `KS_RELAY` | The relay's address. Defaults to `http://localhost:8787`. |
| `KS_ACCOUNT` | The protected wallet the agent acts on. |
| `KS_AGENT_ID` | The agent's id on that wallet. |
| `KS_SESSION_KEY` | The agent's session key. Keep it secret. |

## Tools

### wallet_status

What the agent may do: active or paused, its label, when the grant expires, the allowed actions, each cap with what is used this period and the co-sign line, and the wallet's balances. The model is told to call it before spending. It takes no input.

### wallet_send

Sends tokens from the wallet, subject to the owner's caps and the guardian's review.

| Input | Example |
|---|---|
| `token` | `"USDC"` |
| `to` | `"0x15d3…6A65"` |
| `amount` | `"12.5"`, in whole units |
| `reason` | `"Pay invoice #1044"`. The real reason, in plain words. |

### wallet_swap

Swaps one token for another on the approved exchange, subject to the same caps and review.

| Input | Example |
|---|---|
| `from` | `"USDC"` |
| `to` | `"WETH"` |
| `amount` | `"10"`, of `from`, in whole units |
| `reason` | `"Buy ETH for the weekly plan"` |

## What the model hears back

Each result is plain text the model can act on: the status, then an instruction, then the reasons and what is left of the caps.

```text
status: held
The wallet owner must approve this operation. Do not retry; tell the user it is waiting for approval.
reasons:
- first payment to new address 0x15d3…6A65
- uses 100% of the remaining 25 USDC cap
```

For a blocked or rejected operation the instruction is “This operation is NOT allowed. Do not retry or try to work around it; report it to the user.”, and once the guardian pauses the agent, “Your permission has been PAUSED by the guardian. Stop using the wallet and tell the user.”

## Check it works

```sh
npm run mcp:smoke
```

Starts the server as an MCP client would and calls its tools against your local relay.

A hosted MCP connection with a login, so you don't run the server yourself, is planned for the retail beta.
