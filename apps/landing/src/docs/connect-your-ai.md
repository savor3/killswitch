---
title: Connect your AI
description: Give Claude, ChatGPT or any MCP agent a wallet it cannot empty through the Killswitch MCP server, or connect your own agent with the SDK.
---

When you add an agent, the web app shows how to connect it with your values filled in: the relay, your protected wallet, the agent's id and its session key. There are three ways.

## Claude Code

The MCP server runs on your own machine, from your own copy of the code. Get it once:

```sh
git clone https://github.com/savor3/killswitch ~/killswitch
cd ~/killswitch && npm install && npm run mcp:build
```

Then add the server with the values from the app:

```sh
claude mcp add killswitch-wallet \
  -e KS_RELAY=https://app-killswitch.storygame.io \
  -e KS_ACCOUNT=0xYourProtectedWallet \
  -e KS_AGENT_ID=0xAgentId \
  -e KS_SESSION_KEY=0xSessionKey \
  -- node ~/killswitch/dist/mcp/server.mjs
```

Ask Claude to “check my wallet” or “swap 10 USDC to ETH”, and watch the operation arrive in the app.

## Claude Desktop

Open Settings, then Developer, then Edit config. Add the block from the app and restart Claude:

```json
{
  "mcpServers": {
    "killswitch-wallet": {
      "command": "node",
      "args": ["/Users/you/killswitch/dist/mcp/server.mjs"],
      "env": {
        "KS_RELAY": "https://app-killswitch.storygame.io",
        "KS_ACCOUNT": "0xYourProtectedWallet",
        "KS_AGENT_ID": "0xAgentId",
        "KS_SESSION_KEY": "0xSessionKey"
      }
    }
  }
}
```

On Windows the path looks like `C:\\Users\\you\\killswitch\\dist\\mcp\\server.mjs`.

## Your own agent

Put the four values in your agent's environment and use the [Agent SDK](/docs/sdk):

```sh
KS_RELAY=https://app-killswitch.storygame.io
KS_ACCOUNT=0xYourProtectedWallet
KS_AGENT_ID=0xAgentId
KS_SESSION_KEY=0xSessionKey
```

## What the agent gets

| Tool | What it does |
|---|---|
| `wallet_status` | Active or paused, the allowed actions, every cap with what is used, and the balances. The model is told to call it before spending. |
| `wallet_send` | Sends tokens within the caps. Takes `token`, `to`, `amount` and `reason`. |
| `wallet_swap` | Swaps on the approved exchange. Takes `from`, `to`, `amount` and `reason`. |

The `reason` is the agent's own description of what it is doing. The guardian never trusts it: it compares it with what the operation really does.

## When the answer is no

Every result says what happened and why, in words the model can repeat to you:

- **Held:** “The wallet owner must approve this operation. Do not retry; tell the user it is waiting for approval.”
- **Blocked or rejected:** “This operation is NOT allowed. Do not retry or try to work around it; report it to the user.”
- **Paused:** “Your permission has been PAUSED by the guardian. Stop using the wallet and tell the user.”

Safety never depends on the model listening. A hijacked model that ignores these still hits the cap, and repeated blocked attempts get it paused.

> **Keep the session key secret.** It is the agent's only key and works only for its own grant. If it leaks, pause or remove the agent in the app. The most it can cost you is the agent's remaining cap.
