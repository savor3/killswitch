// Killswitch MCP server: gives any MCP-capable AI agent (Claude Code, Claude Desktop, …) a wallet
// it can use ONLY within the owner's limits. Configure with env vars:
//   KS_RELAY, KS_ACCOUNT, KS_AGENT_ID, KS_SESSION_KEY
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { isAddress, type Address, type Hex } from "viem";
import { createKillswitchAgent, type OpResult } from "../sdk/index.js";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) {
    console.error(`Missing ${k}. Create an agent in the Killswitch dashboard and copy its settings.`);
    process.exit(1);
  }
  return v;
};

const agent = createKillswitchAgent({
  relayUrl: process.env.KS_RELAY ?? "http://localhost:8787",
  account: env("KS_ACCOUNT") as Address,
  agentId: env("KS_AGENT_ID") as Hex,
  sessionKey: env("KS_SESSION_KEY") as Hex,
});

const server = new McpServer({ name: "killswitch-wallet", version: "0.1.0" });

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });

function explain(r: OpResult) {
  const lines = [`status: ${r.status}`];
  if (r.status === "confirmed") lines.push(`done. tx ${r.txHash}`);
  if (r.status === "held") lines.push("The wallet owner must approve this operation. Do not retry; tell the user it is waiting for approval.");
  if (r.status === "blocked" || r.status === "rejected") lines.push("This operation is NOT allowed. Do not retry or try to work around it; report it to the user.");
  if (r.paused) lines.push("Your permission has been PAUSED by the guardian. Stop using the wallet and tell the user.");
  if (r.reasons?.length) lines.push("reasons:", ...r.reasons.map((x) => `- ${x}`));
  if (r.remaining) lines.push(`remaining allowance this period: ${Object.values(r.remaining).join(", ")}`);
  return lines.join("\n");
}

server.registerTool(
  "wallet_status",
  {
    description:
      "Show what this agent is allowed to do with the user's wallet: active/paused, allowed actions, spending caps and how much is left, plus wallet balances. Call this before spending.",
    inputSchema: {},
  },
  async () => {
    const [s, b] = await Promise.all([agent.status(), agent.balances()]);
    return text({
      agent: s.label,
      active: s.active,
      paused: s.paused,
      killed: s.killed,
      expires: new Date(s.validUntil * 1000).toISOString(),
      allowed: s.rules.map((r: any) => r.name),
      caps: s.limits.map((l: any) => `${l.text} used this period (guardian co-signs single ops above ${(Number(l.cosignAbove) / 10 ** l.decimals)} ${l.symbol})`),
      balances: b,
    });
  },
);

server.registerTool(
  "wallet_send",
  {
    description: "Send tokens from the user's wallet. Subject to the owner's caps and guardian review. Always state the real reason in `reason`.",
    inputSchema: {
      token: z.string().describe("Token symbol, e.g. USDC"),
      to: z.string().describe("Recipient address (0x…)"),
      amount: z.string().describe("Amount in whole units, e.g. \"12.5\""),
      reason: z.string().describe("Why you are sending this, in plain words"),
    },
  },
  async ({ token, to, amount, reason }) => {
    if (!isAddress(to)) return text("invalid recipient address");
    try {
      return text(explain(await agent.transfer(token, to as Address, amount, reason)));
    } catch (e) {
      return text(`error: ${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "wallet_swap",
  {
    description: "Swap one token for another on the approved exchange (e.g. USDC → WETH). Subject to the owner's caps and guardian review.",
    inputSchema: {
      from: z.string().describe("Token to sell, e.g. USDC"),
      to: z.string().describe("Token to buy, e.g. WETH"),
      amount: z.string().describe("Amount of `from` to sell, in whole units"),
      reason: z.string().describe("Why you are making this trade"),
    },
  },
  async ({ from, to, amount, reason }) => {
    try {
      return text(explain(await agent.swap(from, to, amount, reason)));
    } catch (e) {
      return text(`error: ${(e as Error).message}`);
    }
  },
);

await server.connect(new StdioServerTransport());
console.error(`killswitch-wallet MCP ready (agent key ${agent.address})`);
