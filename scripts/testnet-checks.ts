// Live end-to-end checks against a running relay on any chain (built for Base Sepolia):
//   1. owner DENIES a held payment      2. new vendor held → approved, then rapid payments (velocity)
//   3. spending right up to the cap     4. stolen agent key goes around the relay
//   5. drain to unknown → agent paused  6. owner resume + guardian co-sign   7. kill switch
// Uses its own owner key (KS_OWNER_KEY) and its own protected wallet, so nobody's real wallet is touched.
// If the owner is low on gas, KS_FUNDER_KEY (e.g. the deployer) sends it a little.
//   KS_OWNER_KEY=0x… KS_FUNDER_KEY=0x… npx tsx scripts/testnet-checks.ts
import {
  createPublicClient, createWalletClient, decodeEventLog, encodeFunctionData, http, keccak256, parseEther, parseUnits, toHex,
  type Address, type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { KillswitchAccountAbi, KillswitchFactoryAbi, MockERC20Abi } from "../shared/abi.js";
import { explainRevert, opTypedData, type Deployment } from "../shared/protocol.js";
import { createKillswitchAgent, type OpResult } from "../packages/sdk/index.js";

const RELAY = process.env.KS_RELAY ?? "http://localhost:8787";
const dep: Deployment = JSON.parse(readFileSync(process.env.KS_DEPLOYMENT ?? "deployments/current.json", "utf8"));
const rpc = process.env.KS_RPC ?? dep.rpc;
const chain = { id: dep.chainId, name: `chain-${dep.chainId}`, nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } };
const pub = createPublicClient({ chain, transport: http(rpc), pollingInterval: 1000 });
if (!process.env.KS_OWNER_KEY) throw new Error("KS_OWNER_KEY is required");
const owner = privateKeyToAccount(process.env.KS_OWNER_KEY as Hex);
const ownerWallet = createWalletClient({ account: owner, chain, transport: http(rpc) });
const { USDC } = dep.tokens;
const explorer = dep.chainId === 84532 ? "https://sepolia.basescan.org/tx/" : "tx ";

const ADDR = {
  deny: "0x3333333333333333333333333333333333333333" as Address,
  vendor: "0x2222222222222222222222222222222222222222" as Address,
  thief: "0x4444444444444444444444444444444444444444" as Address,
};
const results: { test: string; expected: string; got: string; pass: boolean }[] = [];
const record = (test: string, expected: string, got: string, pass: boolean) => {
  results.push({ test, expected, got, pass });
  console.log(`   ${pass ? "PASS" : "FAIL"}  ${got}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const usdc = (a: Address) => pub.readContract({ address: USDC.address, abi: MockERC20Abi, functionName: "balanceOf", args: [a] });
const fmt = (v: bigint) => `${Number(v) / 1e6} USDC`;
const line = (r: OpResult) => `${r.status} (verdict ${r.verdict})${r.paused ? ", agent PAUSED" : ""}${r.reasons?.length ? ` · ${r.reasons.join("; ")}` : ""}`;
async function ownerTx(address: Address, abi: any, functionName: string, args: unknown[]) {
  const hash = await ownerWallet.writeContract({ address, abi, functionName, args } as any);
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error(`${functionName} reverted`);
  return hash;
}
async function decide(id: string, approve: boolean) {
  const signature = await owner.signMessage({ message: `Killswitch: ${approve ? "approve" : "deny"} operation ${id}` });
  const r = await fetch(`${RELAY}/v1/ops/${id}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ approve, signature }) });
  return (await r.json()) as OpResult;
}
async function grant(account: Address, label: string, capUsdc: string, cosignUsdc: string) {
  const key = generatePrivateKey();
  const id = keccak256(toHex(`${label}-${Date.now()}-${Math.random()}`));
  await ownerTx(account, KillswitchAccountAbi, "grant", [id, label, privateKeyToAccount(key).address, Math.floor(Date.now() / 1000) + 86400,
    [{ target: USDC.address, selector: "0xa9059cbb" }],
    [{ token: USDC.address, maxPerPeriod: parseUnits(capUsdc, 6), cosignAbove: parseUnits(cosignUsdc, 6), period: 86400 }]]);
  return { id, key, agent: createKillswitchAgent({ relayUrl: RELAY, account, agentId: id, sessionKey: key }) };
}
const agentState = async (account: Address, id: Hex) =>
  (await pub.readContract({ address: account, abi: KillswitchAccountAbi, functionName: "getAgent", args: [id] }))[0];

// ───────────────────────────── setup
const cfg = await (await fetch(`${RELAY}/v1/config`)).json();
console.log(`Killswitch live checks · chain ${dep.chainId} · relay ${RELAY} · AI review ${cfg.llm ? "on" : "off"}`);
console.log(`test owner ${owner.address}`);
const need = parseEther("0.003");
if ((await pub.getBalance({ address: owner.address })) < need) {
  if (!process.env.KS_FUNDER_KEY) throw new Error("test owner needs gas: set KS_FUNDER_KEY or fund it");
  const funder = createWalletClient({ account: privateKeyToAccount(process.env.KS_FUNDER_KEY as Hex), chain, transport: http(rpc) });
  const h = await funder.sendTransaction({ to: owner.address, value: need });
  await pub.waitForTransactionReceipt({ hash: h });
  console.log(`funded test owner with 0.003 ETH`);
}
await ownerTx(dep.factory, KillswitchFactoryAbi, "createAccount", [cfg.guardian, keccak256(toHex(`checks-${Date.now()}`))]);
const accounts = await pub.readContract({ address: dep.factory, abi: KillswitchFactoryAbi, functionName: "accountsOf", args: [owner.address] });
const account = accounts[accounts.length - 1];
await ownerTx(USDC.address, MockERC20Abi, "mint", [account, parseUnits("1000", 6)]);
console.log(`protected wallet ${account} · ${fmt(await usdc(account))}`);
const bot = await grant(account, "Checks bot", "30", "20");
console.log(`agent "Checks bot": USDC transfers only · 30 USDC/day · guardian co-signs above 20`);
await sleep(4000); // let the watcher index the new account and label

// ───────────────────────────── 1. deny
console.log(`\n[1] DENY: agent pays a new address, owner denies`);
const denyBefore = await usdc(ADDR.deny);
let r = await bot.agent.transfer("USDC", ADDR.deny, "2", "Pay invoice #501 to a new supplier");
console.log(`   relay: ${line(r)}`);
if (r.status === "held") {
  const d = await decide(r.id, false);
  console.log(`   owner denied → ${line(d)}`);
  const moved = (await usdc(ADDR.deny)) - denyBefore;
  record("Deny button", "held, then denied, 0 USDC moves", `${d.status}; ${fmt(moved)} moved`, d.status !== "confirmed" && moved === 0n);
} else record("Deny button", "held, then denied, 0 USDC moves", `not held: ${r.status}`, false);

// ───────────────────────────── 2. rapid payments
console.log(`\n[2] RAPID: 1 USDC to a new vendor, owner approves, then 5 more back to back`);
r = await bot.agent.transfer("USDC", ADDR.vendor, "1", "Pay usage fee #1");
console.log(`   #1 ${line(r)}`);
if (r.status === "held") { r = await decide(r.id, true); console.log(`   owner approved → ${line(r)}`); }
const rapid: OpResult[] = [];
for (let i = 2; i <= 6; i++) {
  const x = await bot.agent.transfer("USDC", ADDR.vendor, "1", `Pay usage fee #${i}`);
  rapid.push(x);
  console.log(`   #${i} ${line(x)}`);
}
const flagged = rapid.filter((x) => (x.reasons ?? []).some((t) => /operations in the last 10 minutes/.test(t)));
const spentRapid = rapid.filter((x) => x.status === "confirmed").length;
record("Rapid payments", "velocity flagged; total stays within cap",
  `${flagged.length} of 5 flagged for velocity; ${spentRapid} went through`, flagged.length > 0);

// ───────────────────────────── 3. cap edge
const spent = (await pub.readContract({ address: account, abi: KillswitchAccountAbi, functionName: "spent", args: [bot.id, USDC.address] })) as readonly [bigint, bigint, bigint];
const left = spent[1] - spent[0];
console.log(`\n[3] CAP EDGE: ${fmt(spent[0])} of ${fmt(spent[1])} used; pay exactly the remaining ${fmt(left)}, then 1 more`);
r = await bot.agent.transfer("USDC", ADDR.vendor, String(Number(left) / 1e6), "Pay the rest of this month's usage");
console.log(`   exact remaining: ${line(r)}`);
if (r.status === "held") { r = await decide(r.id, true); console.log(`   owner approved → ${line(r)}`); }
const edgeOk = r.status === "confirmed";
const over = await bot.agent.transfer("USDC", ADDR.vendor, "1", "One more usage fee");
console.log(`   1 more: ${line(over)}`);
record("Cap edge", "exact remaining goes through; 1 more is blocked",
  `exact: ${r.status}; +1: ${over.status}`, edgeOk && over.status !== "confirmed" && /cap/i.test((over.reasons ?? []).join(" ") + (over as any).error));

// ───────────────────────────── 4. stolen key bypasses the relay
console.log(`\n[4] STOLEN KEY: thief uses a second agent's key directly on-chain, skipping the relay`);
const victim = await grant(account, "Bypass bot", "30", "20");
const thief = privateKeyToAccount(victim.key);
await pub.waitForTransactionReceipt({ hash: await ownerWallet.sendTransaction({ to: thief.address, value: parseEther("0.0005") }) });
const thiefWallet = createWalletClient({ account: thief, chain, transport: http(rpc) });
async function steal(amount: string) {
  const calls = [{ target: USDC.address, value: 0n, data: encodeFunctionData({ abi: MockERC20Abi, functionName: "transfer", args: [ADDR.thief, parseUnits(amount, 6)] }) }];
  const a = await agentState(account, victim.id);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const sig = await thief.signTypedData(opTypedData({ chainId: dep.chainId, account, agentId: victim.id, calls, nonce: a.nonce, deadline }));
  const hash = await thiefWallet.writeContract({ address: account, abi: KillswitchAccountAbi, functionName: "executeAsAgent", args: [victim.id, calls, deadline, sig, "0x"] });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error(`reverted (${hash})`);
  return hash;
}
const why = (e: unknown) => {
  const raw = (e as any).walk?.((x: any) => typeof x?.data === "string" && x.data.startsWith("0x"))?.data ?? String((e as Error).message).match(/0x[0-9a-f]{8,}/i)?.[0];
  try { return explainRevert(dep, raw as Hex).human; } catch { return String((e as Error).message).split("\n")[0]; }
};
const thiefBefore = await usdc(ADDR.thief);
let bigBlocked = false;
try { await steal("100"); console.log(`   100 USDC: WENT THROUGH (unexpected)`); }
catch (e) { bigBlocked = true; console.log(`   100 USDC: refused on-chain · ${why(e)}`); }
let smallHash: string | null = null;
try { smallHash = await steal("9"); console.log(`   9 USDC: went through (within cap, the bounded loss) ${explorer}${smallHash}`); }
catch (e) { console.log(`   9 USDC: refused · ${why(e)}`); }
let pausedAfter = -1;
for (let i = 1; i <= 60; i++) {
  await sleep(1000);
  if ((await agentState(account, victim.id)).paused) { pausedAfter = i; break; }
}
console.log(pausedAfter > 0 ? `   guardian PAUSED the agent ${pausedAfter}s after the theft` : `   agent NOT paused within 60s`);
let secondBlocked = false;
try { await steal("9"); console.log(`   second 9 USDC: WENT THROUGH`); }
catch (e) { secondBlocked = true; console.log(`   second 9 USDC: refused · ${why(e)}`); }
const stolen = (await usdc(ADDR.thief)) - thiefBefore;
record("Stolen key", "100 refused; small one through; agent paused; next refused",
  `100 ${bigBlocked ? "refused" : "SENT"}; paused ${pausedAfter > 0 ? `after ${pausedAfter}s` : "NO"}; next ${secondBlocked ? "refused" : "SENT"}; thief got ${fmt(stolen)}`,
  bigBlocked && pausedAfter > 0 && secondBlocked);

// ───────────────────────────── 5. drain to an unknown address
console.log(`\n[5] DRAIN: agent tries to send most of the wallet to an unknown address`);
const drainer = await grant(account, "Drain bot", "50", "20");
await sleep(4000);
const drainTo = "0x5555555555555555555555555555555555555555" as Address;
r = await drainer.agent.transfer("USDC", drainTo, "900", "Move funds to new treasury address");
console.log(`   relay: ${line(r)}`);
const drainPaused = (await agentState(account, drainer.id)).paused;
console.log(`   on-chain paused flag: ${drainPaused}`);
record("Drain → pause", "blocked, nothing moves, agent paused on-chain",
  `${r.status}; paused on-chain ${drainPaused}; ${fmt(await usdc(drainTo))} at target`, r.status !== "confirmed" && drainPaused && (await usdc(drainTo)) === 0n);

// ───────────────────────────── 6. resume + guardian co-sign
console.log(`\n[6] RESUME + CO-SIGN: owner resumes, agent pays 25 USDC (over the 20 co-sign line) to the known vendor`);
await ownerTx(account, KillswitchAccountAbi, "unpause", [drainer.id]);
const resumed = !(await agentState(account, drainer.id)).paused;
console.log(`   resumed on-chain: ${resumed}`);
r = await drainer.agent.transfer("USDC", ADDR.vendor, "25", "Pay quarterly usage invoice");
console.log(`   relay: ${line(r)}`);
if (r.status === "held") { r = await decide(r.id, true); console.log(`   owner approved → ${line(r)}`); }
let cosigned: boolean | null = null;
if (r.txHash) {
  const rc = await pub.getTransactionReceipt({ hash: r.txHash as Hex });
  for (const l of rc.logs) {
    try {
      const ev = decodeEventLog({ abi: KillswitchAccountAbi, data: l.data, topics: l.topics }) as any;
      if (ev.eventName === "AgentExecuted") cosigned = ev.args.cosigned;
    } catch {}
  }
  console.log(`   on-chain AgentExecuted.cosigned = ${cosigned}  ${explorer}${r.txHash}`);
}
record("Resume + co-sign", "owner resume works; 25 USDC sent with guardian co-signature",
  `resumed ${resumed}; ${r.status}; cosigned ${cosigned}`, resumed && r.status === "confirmed" && cosigned === true);

// ───────────────────────────── 7. kill switch
console.log(`\n[7] KILL ALL: owner presses the kill switch, agent tries 1 USDC`);
await ownerTx(account, KillswitchAccountAbi, "killAll", []);
r = await drainer.agent.transfer("USDC", ADDR.vendor, "1", "Small usage fee");
console.log(`   relay: ${line(r)}`);
const [, activeAfterKill] = await pub.readContract({ address: account, abi: KillswitchAccountAbi, functionName: "getAgent", args: [drainer.id] });
record("Kill switch", "every agent refused; agent inactive on-chain",
  `${r.status}; active on-chain ${activeAfterKill}`, r.status !== "confirmed" && activeAfterKill === false);

// ───────────────────────────── summary
console.log(`\nSUMMARY · wallet ${account}`);
for (const x of results) console.log(`  ${x.pass ? "PASS" : "FAIL"}  ${x.test.padEnd(15)} expected: ${x.expected}\n        ${"".padEnd(15)} got:      ${x.got}`);
console.log(`  wallet balance now ${fmt(await usdc(account))}`);
