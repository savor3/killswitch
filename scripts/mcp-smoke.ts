// Smoke test: spin up the MCP server as a real MCP client would, against a fresh wallet + agent.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createPublicClient, createWalletClient, http, keccak256, parseUnits, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { KillswitchAccountAbi, KillswitchFactoryAbi, MockERC20Abi } from "../shared/abi.js";
import { ANVIL_KEYS, type Deployment } from "../shared/protocol.js";

const RELAY = process.env.KS_RELAY ?? "http://localhost:8787";
const dep: Deployment = JSON.parse(readFileSync("deployments/current.json", "utf8"));
const chain = { id: dep.chainId, name: "local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [dep.rpc] } } };
const pub = createPublicClient({ chain, transport: http(dep.rpc) });
const owner = createWalletClient({ account: privateKeyToAccount(ANVIL_KEYS.owner), chain, transport: http(dep.rpc) });
const cfg = await (await fetch(`${RELAY}/v1/config`)).json();

const wait = async (h: `0x${string}`) => pub.waitForTransactionReceipt({ hash: h });
await wait(await owner.writeContract({ address: dep.factory, abi: KillswitchFactoryAbi, functionName: "createAccount", args: [cfg.guardian, keccak256(toHex(`mcp-${Date.now()}`))] }));
const list = await pub.readContract({ address: dep.factory, abi: KillswitchFactoryAbi, functionName: "accountsOf", args: [owner.account.address] });
const account = list[list.length - 1];
await wait(await owner.writeContract({ address: dep.tokens.USDC.address, abi: MockERC20Abi, functionName: "mint", args: [account, parseUnits("500", 6)] }));
const key = generatePrivateKey();
const agentId = keccak256(toHex(`mcp-agent-${Date.now()}`));
await wait(await owner.writeContract({
  address: account, abi: KillswitchAccountAbi, functionName: "grant",
  args: [agentId, "MCP test bot", privateKeyToAccount(key).address, Math.floor(Date.now() / 1000) + 86400,
    [{ target: dep.tokens.USDC.address, selector: "0xa9059cbb" }],
    [{ token: dep.tokens.USDC.address, maxPerPeriod: parseUnits("30", 6), cosignAbove: parseUnits("30", 6), period: 86400 }]],
}));

const client = new Client({ name: "smoke", version: "0" });
await client.connect(new StdioClientTransport({
  command: "npx", args: ["tsx", "packages/mcp/server.ts"],
  env: { ...process.env, KS_RELAY: RELAY, KS_ACCOUNT: account, KS_AGENT_ID: agentId, KS_SESSION_KEY: key } as Record<string, string>,
}));
const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));
const out = (r: any) => console.log(r.content[0].text, "\n");
out(await client.callTool({ name: "wallet_status", arguments: {} }));
out(await client.callTool({ name: "wallet_send", arguments: { token: "USDC", to: privateKeyToAccount(ANVIL_KEYS.owner).address, amount: "5", reason: "refund 5 USDC to the wallet owner" } }));
out(await client.callTool({ name: "wallet_send", arguments: { token: "USDC", to: privateKeyToAccount(ANVIL_KEYS.owner).address, amount: "400", reason: "move everything to owner" } }));
await client.close();
