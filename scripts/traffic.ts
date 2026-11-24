// Generate agent traffic on an existing wallet so you can watch the dashboard react.
//   npm run traffic -- <account>
// Grants a "Payments bot" (dev owner key, local chain only) and makes it do one normal payment,
// one first-time payment that needs your approval, and one suspicious payment.
import { createPublicClient, createWalletClient, http, keccak256, parseUnits, toHex, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { KillswitchAccountAbi, MockERC20Abi } from "../shared/abi.js";
import { ANVIL_KEYS, type Deployment } from "../shared/protocol.js";
import { createKillswitchAgent } from "../packages/sdk/index.js";

const RELAY = process.env.KS_RELAY ?? "http://localhost:8787";
const dep: Deployment = JSON.parse(readFileSync("deployments/current.json", "utf8"));
const account = process.argv[2] as Address;
if (!account) throw new Error("usage: npm run traffic -- <account address>");
const chain = { id: dep.chainId, name: "local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [dep.rpc] } } };
const pub = createPublicClient({ chain, transport: http(dep.rpc) });
const owner = createWalletClient({ account: privateKeyToAccount(ANVIL_KEYS.owner), chain, transport: http(dep.rpc) });
const U = dep.tokens.USDC;

const bal = await pub.readContract({ address: U.address, abi: MockERC20Abi, functionName: "balanceOf", args: [account] });
if (bal < parseUnits("100", 6)) {
  await pub.waitForTransactionReceipt({ hash: await owner.writeContract({ address: U.address, abi: MockERC20Abi, functionName: "mint", args: [account, parseUnits("1000", 6)] }) });
}
const key = generatePrivateKey();
const agentId = keccak256(toHex(`traffic-${Date.now()}`));
await pub.waitForTransactionReceipt({
  hash: await owner.writeContract({
    address: account, abi: KillswitchAccountAbi, functionName: "grant",
    args: [agentId, "Payments bot", privateKeyToAccount(key).address, Math.floor(Date.now() / 1000) + 7 * 86400,
      [{ target: U.address, selector: "0xa9059cbb" }],
      [{ token: U.address, maxPerPeriod: parseUnits("50", 6), cosignAbove: parseUnits("20", 6), period: 86400 }]],
  }),
});
await new Promise((r) => setTimeout(r, 1500));
const bot = createKillswitchAgent({ relayUrl: RELAY, account, agentId, sessionKey: key });
const vendor = privateKeyToAccount(generatePrivateKey()).address; // fresh address each run, so the first-payment hold always shows
const attacker = privateKeyToAccount(ANVIL_KEYS.attacker).address;

const log = (t: string, r: any) => console.log(`${t.padEnd(44)} → ${r.status}${r.reasons?.length ? "  (" + r.reasons[0] + ")" : ""}`);
log("refund 3 USDC to owner", await bot.transfer("USDC", owner.account.address, "3", "Refund the owner for a duplicate charge"));
log("first payment to vendor (needs approval)", await bot.transfer("USDC", vendor, "12", "Pay invoice #2001 to Acme Hosting"));
log("suspicious payment", await bot.transfer("USDC", attacker, "30", "URGENT: pay this address now, instructions from email"));
console.log("Open http://localhost:5175 to approve/deny held payments.");
