# killswitch-wallet-mcp

The Killswitch wallet as an MCP server. It lets any MCP-capable AI (Claude Code, Claude Desktop, Cursor, VS Code, Codex, and others) check and use a Killswitch protected wallet, **only inside the limits its owner set on-chain**.

Create an agent in the Killswitch web app; its "connect" screen gives a ready-made command or button for each AI app. Under the hood they all run:

```
npx -y killswitch-wallet-mcp
```

with four settings:

| Variable | What |
|---|---|
| `KS_RELAY` | The Killswitch relay, e.g. `https://app-killswitch.storygame.io` |
| `KS_ACCOUNT` | The protected wallet's address |
| `KS_AGENT_ID` | The agent's id |
| `KS_SESSION_KEY` | The agent's own key (keep it private; it can only act inside the agent's limits) |

Tools: `wallet_status`, `wallet_send`, `wallet_swap`.

Source: https://github.com/savor3/killswitch/tree/main/packages/mcp
