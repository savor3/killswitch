// Guardian v0: decode → simulate → rules → (LLM in grey zone) → verdict → co-sign / submit / hold / pause.
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { decodeFunctionData, recoverTypedDataAddress, type Address, type Hex } from "viem";
import { MockDEXAbi, MockERC20Abi } from "../../shared/abi.js";
import { explainRevert, fmt, json, opTypedData, short, tokenByAddress, type Call } from "../../shared/protocol.js";
import * as chain from "./chain.js";
import * as store from "./db.js";
import { review, llmEnabled, type LlmReview } from "./llm.js";
import { readFileSync, existsSync } from "node:fs";

const { dep } = chain;
export const bus = new EventEmitter();
bus.setMaxListeners(100);
export function emit(account: string, type: string, data: Record<string, unknown> = {}) {
  bus.emit("event", { account: account.toLowerCase(), type, data, at: Date.now() });
}
function alert(account: string, agentId: string | null, level: "info" | "warn" | "critical", message: string) {
  store.addAlert(account, agentId, level, message);
  emit(account, "alert", { agentId, level, message });
  console.log(`[alert:${level}] ${short(account)} ${message}`);
}

const BLOCKLIST: Set<string> = new Set(
  existsSync("data/blocklist.json") ? (JSON.parse(readFileSync("data/blocklist.json", "utf8")) as string[]).map((a) => a.toLowerCase()) : [],
);

// ------------------------------------------------------------------ decoding
type Decoded =
  | { kind: "transfer"; token: Address; to: Address; amount: bigint; text: string }
  | { kind: "approve"; token: Address; spender: Address; amount: bigint; text: string }
  | { kind: "swap"; dex: Address; tokenIn: Address; amountIn: bigint; minOut: bigint; text: string }
  | { kind: "other"; target: Address; text: string };

export function decodeCalls(calls: Call[]): Decoded[] {
  return calls.map((c) => {
    if (tokenByAddress(dep, c.target)) {
      try {
        const d = decodeFunctionData({ abi: MockERC20Abi, data: c.data });
        if (d.functionName === "transfer") {
          const [to, amount] = d.args as [Address, bigint];
          return { kind: "transfer", token: c.target, to, amount, text: `send ${fmt(dep, c.target, amount)} to ${short(to)}` };
        }
        if (d.functionName === "approve") {
          const [spender, amount] = d.args as [Address, bigint];
          return { kind: "approve", token: c.target, spender, amount, text: `approve ${short(spender)} to pull ${fmt(dep, c.target, amount)}` };
        }
      } catch {}
    }
    if (c.target.toLowerCase() === dep.dex.toLowerCase()) {
      try {
        const d = decodeFunctionData({ abi: MockDEXAbi, data: c.data });
        if (d.functionName === "swapExactIn") {
          const [tokenIn, amountIn, minOut] = d.args as [Address, bigint, bigint];
          const out = tokenByAddress(dep, tokenIn)?.symbol === "USDC" ? "WETH" : "USDC";
          return { kind: "swap", dex: c.target, tokenIn, amountIn, minOut, text: `swap ${fmt(dep, tokenIn, amountIn)} → ${out}` };
        }
      } catch {}
    }
    return { kind: "other", target: c.target, text: `call ${short(c.target)} ${c.data.slice(0, 10)}` };
  });
}

function templateText(agent: chain.AgentView, label: string) {
  const rules = agent.rules.map((r) => {
    const t = tokenByAddress(dep, r.target)?.symbol ?? (r.target.toLowerCase() === dep.dex.toLowerCase() ? "DEX" : short(r.target));
    const fn = { "0xa9059cbb": "transfer", "0x095ea7b3": "approve" }[r.selector.toLowerCase()] ?? (t === "DEX" ? "swap" : r.selector);
    return `${t}.${fn}`;
  });
  const limits = agent.limits.map((l) => `${fmt(dep, l.token, l.maxPerPeriod)} per ${Math.round(l.period / 3600)}h (co-sign above ${fmt(dep, l.token, l.cosignAbove)})`);
  return `"${label}": may call ${rules.join(", ")}; caps ${limits.join(", ")}`;
}

// ------------------------------------------------------------------ rule engine
type Signal = { points: number; text: string };

async function scoreOp(p: {
  account: Address; agentId: Hex; agent: chain.AgentView; decoded: Decoded[]; outflows: bigint[]; intent: string | null; bypass?: boolean;
}): Promise<Signal[]> {
  const s: Signal[] = [];
  const owner = (await chain.readAccount(p.account)).owner.toLowerCase();

  if (p.bypass) s.push({ points: 40, text: "submitted directly on-chain, bypassing the Killswitch relay" });

  for (const d of p.decoded) {
    if (d.kind !== "transfer") continue;
    const to = d.to.toLowerCase();
    if (BLOCKLIST.has(to)) s.push({ points: 100, text: `recipient ${short(d.to)} is on the scam/drainer blocklist` });
    else if (to !== owner && !store.isKnownRecipient(p.account, to)) s.push({ points: 30, text: `first payment to new address ${short(d.to)}` });
  }

  // cap hugging: a single op that eats most of what's left
  p.agent.limits.forEach((l, i) => {
    const out = p.outflows[i] ?? 0n;
    if (out === 0n) return;
    const usedBefore = p.bypass ? (l.used > out ? l.used - out : 0n) : l.used;
    const remaining = l.maxPerPeriod > usedBefore ? l.maxPerPeriod - usedBefore : 0n;
    if (remaining > 0n && out * 100n >= remaining * 80n) {
      s.push({ points: 25, text: `uses ${Number((out * 100n) / remaining)}% of the remaining ${fmt(dep, l.token, remaining)} cap` });
    }
  });

  const recent = store.recentOps(p.account, p.agentId, 600);
  if (recent.length >= 5) s.push({ points: 20, text: `${recent.length} operations in the last 10 minutes` });

  for (const d of p.decoded) {
    if (d.kind === "swap" && d.minOut === 0n) s.push({ points: 10, text: "swap without slippage protection (minOut = 0)" });
  }
  if (!p.intent && !p.bypass) s.push({ points: 10, text: "no stated intent" });
  return s;
}

const total = (s: Signal[]) => s.reduce((a, x) => a + x.points, 0);

// ------------------------------------------------------------------ public: submit
export type SubmitInput = { account: Address; agentId: Hex; calls: Call[]; deadline: bigint; signature: Hex; intent?: string | null };
export type SubmitResult = {
  id: string; status: string; verdict: string; reasons: string[]; txHash?: string; paused?: boolean; llm?: LlmReview | null; remaining?: Record<string, string>;
};

export class ClientError extends Error {}

export async function submit(input: SubmitInput): Promise<SubmitResult> {
  const { account, agentId, calls, deadline, signature } = input;
  const intent = input.intent?.slice(0, 500) ?? null;
  let acct;
  try {
    acct = await chain.readAccount(account);
  } catch {
    throw new ClientError("not a Killswitch account");
  }
  const agent = await chain.readAgent(account, agentId, acct.epoch);
  if (!agent.exists) throw new ClientError("agent has no permission on this account");
  const signer = await recoverTypedDataAddress({
    ...opTypedData({ chainId: dep.chainId, account, agentId, calls, nonce: agent.nonce, deadline }),
    signature,
  }).catch(() => null);
  if (!signer || signer.toLowerCase() !== agent.sessionKey.toLowerCase()) throw new ClientError("bad signature or stale nonce");

  const label = store.getLabel(account, agentId) ?? "agent";
  const id = randomUUID();
  const decoded = decodeCalls(calls);
  const summary = decoded.map((d) => d.text).join(" + ");
  store.insertOp({
    id, account, agent_id: agentId, nonce: Number(agent.nonce), calls: json(calls), deadline: Number(deadline),
    agent_sig: signature, intent, source: "relay", status: "pending", verdict: null, summary, outflows: null, llm: null, tx_hash: null, error: null,
  });
  emit(account, "op", { id });

  // ---- simulate
  const sim = await chain.simulate(account, agentId, calls);
  if (!sim.ok) return blocked(id, account, agentId, agent, decoded, sim.data, label);

  const effects = agent.limits.map((l, i) => (sim.outflows[i] > 0n ? `-${fmt(dep, l.token, sim.outflows[i])}` : "")).filter(Boolean);
  const needsCosign = agent.limits.some((l, i) => sim.outflows[i] > l.cosignAbove);
  const signals = await scoreOp({ account, agentId, agent, decoded, outflows: sim.outflows, intent });
  const score = total(signals);
  const reasons = signals.map((x) => x.text);
  store.updateOp(id, { outflows: json(sim.outflows), score, reasons: json(reasons) });

  // ---- decide
  let verdict: "allow" | "hold" | "reject";
  let llm: LlmReview | null = null;
  if (score >= 70) verdict = "reject";
  else if (score >= 30) {
    const recent = store.recentOps(account, agentId, 3600).slice(-6).reverse().filter((o) => o.id !== id).map((o) => `${o.summary} [${o.status}]`);
    llm = await review({ template: templateText(agent, label), intent, summary, effects, signals: reasons, recent });
    verdict = llm ? llm.verdict : "hold";
    if (llm) store.updateOp(id, { llm: json(llm) });
    else reasons.push(llmEnabled() ? "AI review unavailable; held for the owner" : "AI review off; held for the owner");
  } else verdict = "allow";

  if (verdict === "reject") {
    store.updateOp(id, { status: "rejected", verdict: "reject", reasons: json(reasons) });
    const tx = await chain.guardianPause(account, agentId);
    alert(account, agentId, "critical", `Guardian paused "${label}": ${summary} — ${(llm?.reasons ?? reasons).join("; ")}`);
    emit(account, "op", { id });
    return { id, status: "rejected", verdict: "reject", reasons: llm ? [...reasons, ...llm.reasons] : reasons, paused: true, llm, txHash: tx };
  }
  if (verdict === "hold") {
    store.updateOp(id, { status: "held", verdict: "hold", reasons: json(reasons) });
    alert(account, agentId, "warn", `"${label}" wants to ${summary}. Approve or deny in the dashboard.`);
    emit(account, "op", { id });
    return { id, status: "held", verdict: "hold", reasons: llm ? [...reasons, ...llm.reasons] : reasons, llm };
  }
  return execute(id, { account, agentId, calls, deadline, signature, needsCosign, verdict: needsCosign ? "cosign" : "allow", reasons, llm });
}

async function execute(
  id: string,
  p: { account: Address; agentId: Hex; calls: Call[]; deadline: bigint; signature: Hex; needsCosign: boolean; verdict: string; reasons: string[]; llm?: LlmReview | null },
): Promise<SubmitResult> {
  const agent = await chain.readAgent(p.account, p.agentId);
  const guardianSig = p.needsCosign
    ? await chain.guardianCosign({ account: p.account, agentId: p.agentId, calls: p.calls, nonce: agent.nonce, deadline: p.deadline })
    : "0x";
  try {
    const { hash, receipt } = await chain.submitAgentOp({ account: p.account, agentId: p.agentId, calls: p.calls, deadline: p.deadline, agentSig: p.signature, guardianSig });
    if (receipt.status !== "success") throw new Error("reverted");
    for (const d of decodeCalls(p.calls)) if (d.kind === "transfer") store.addRecipient(p.account, d.to);
    store.updateOp(id, { status: "confirmed", verdict: p.verdict, cosigned: p.needsCosign ? 1 : 0, tx_hash: hash, reasons: json(p.reasons) });
    emit(p.account, "op", { id });
    return { id, status: "confirmed", verdict: p.verdict, reasons: p.reasons, txHash: hash, llm: p.llm, remaining: await remaining(p.account, p.agentId) };
  } catch (e) {
    const why = explainRevert(dep, chain.revertData(e)).human;
    store.updateOp(id, { status: "failed", verdict: p.verdict, error: why });
    emit(p.account, "op", { id });
    return { id, status: "failed", verdict: p.verdict, reasons: [...p.reasons, why] };
  }
}

async function blocked(id: string, account: Address, agentId: Hex, agent: chain.AgentView, decoded: Decoded[], data: Hex | undefined, label: string): Promise<SubmitResult> {
  const why = explainRevert(dep, data);
  const reasons = [`blocked on-chain: ${why.human}`];
  store.updateOp(id, { status: "blocked", verdict: "blocked", reasons: json(reasons), error: why.name });

  // escalate to a pause when the blocked attempt looks like an attack, not a mistake
  let pause = false;
  if (!["AgentIsPaused", "AgentKilled", "PermissionExpired", "UnknownAgent"].includes(why.name)) {
    const owner = (await chain.readAccount(account)).owner.toLowerCase();
    for (const d of decoded) {
      if (d.kind !== "transfer" || d.to.toLowerCase() === owner || store.isKnownRecipient(account, d.to)) continue;
      const bal = await chain.tokenBalance(account, d.token);
      if (bal > 0n && d.amount * 2n >= bal) {
        pause = true;
        reasons.push(`drain pattern: tried to send ${Number((d.amount * 100n) / bal)}% of the wallet's ${tokenByAddress(dep, d.token)?.symbol} to unknown ${short(d.to)}`);
      }
    }
    const recentBlocked = store.recentOps(account, agentId, 600).filter((o) => o.status === "blocked").length;
    if (recentBlocked >= 3) {
      pause = true;
      reasons.push(`${recentBlocked} blocked attempts in 10 minutes`);
    }
  }
  let txHash: string | undefined;
  if (pause && agent.exists && !agent.paused) {
    txHash = await chain.guardianPause(account, agentId);
    store.updateOp(id, { status: "rejected", verdict: "reject", reasons: json(reasons) });
    alert(account, agentId, "critical", `Guardian paused "${label}": ${reasons.join("; ")}`);
  } else {
    alert(account, agentId, "info", `Blocked "${label}": ${why.human}`);
  }
  emit(account, "op", { id });
  return { id, status: pause ? "rejected" : "blocked", verdict: pause ? "reject" : "blocked", reasons, paused: pause, txHash };
}

async function remaining(account: Address, agentId: Hex) {
  const a = await chain.readAgent(account, agentId);
  const out: Record<string, string> = {};
  for (const l of a.limits) out[tokenByAddress(dep, l.token)?.symbol ?? l.token] = fmt(dep, l.token, l.maxPerPeriod - l.used);
  return out;
}

// ------------------------------------------------------------------ owner decision on a held op
export async function decide(id: string, approve: boolean, ownerSig: Hex): Promise<SubmitResult> {
  const op = store.getOp(id);
  if (!op) throw new ClientError("unknown op");
  if (op.status !== "held") throw new ClientError(`op is ${op.status}, not held`);
  const account = op.account as Address;
  const { owner } = await chain.readAccount(account);
  const msg = `Killswitch: ${approve ? "approve" : "deny"} operation ${id}`;
  const { recoverMessageAddress } = await import("viem");
  const signer = await recoverMessageAddress({ message: msg, signature: ownerSig }).catch(() => null);
  if (!signer || signer.toLowerCase() !== owner.toLowerCase()) throw new ClientError("signature is not from the account owner");

  const reasons: string[] = JSON.parse(op.reasons);
  if (!approve) {
    store.updateOp(id, { status: "denied", verdict: "hold", reasons: json([...reasons, "denied by owner"]) });
    emit(account, "op", { id });
    return { id, status: "denied", verdict: "hold", reasons };
  }
  if (Date.now() / 1000 > op.deadline) {
    store.updateOp(id, { status: "failed", error: "deadline passed before approval" });
    throw new ClientError("operation deadline passed; ask the agent to retry");
  }
  const calls = (JSON.parse(op.calls) as any[]).map((c) => ({ target: c.target, value: BigInt(c.value), data: c.data })) as Call[];
  const agent = await chain.readAgent(account, op.agent_id as Hex);
  if (!agent.exists) throw new ClientError("this agent's permission was revoked; the operation can't run");
  if (agent.killed) throw new ClientError("all agents were killed; grant a new permission first");
  if (agent.paused) throw new ClientError("this agent is paused; resume it first, then approve");
  const sim = await chain.simulate(account, op.agent_id as Hex, calls);
  const needsCosign = sim.ok ? agent.limits.some((l, i) => sim.outflows[i] > l.cosignAbove) : false;
  return execute(id, {
    account, agentId: op.agent_id as Hex, calls, deadline: BigInt(op.deadline), signature: op.agent_sig as Hex,
    needsCosign, verdict: needsCosign ? "cosign" : "allow", reasons: [...reasons, "approved by owner"],
  });
}

// ------------------------------------------------------------------ post-hoc review of on-chain ops that skipped the relay
export async function reviewBypass(p: { account: Address; agentId: Hex; nonce: number; txHash: Hex; calls: Call[]; outflows: bigint[]; submitter: Address }) {
  const agent = await chain.readAgent(p.account, p.agentId);
  const label = store.getLabel(p.account, p.agentId) ?? "agent";
  const decoded = decodeCalls(p.calls);
  const summary = decoded.map((d) => d.text).join(" + ");
  const signals = await scoreOp({ account: p.account, agentId: p.agentId, agent, decoded, outflows: p.outflows, intent: null, bypass: true });
  const score = total(signals);
  const reasons = signals.map((s) => s.text);
  const id = randomUUID();
  store.insertOp({
    id, account: p.account, agent_id: p.agentId, nonce: p.nonce, calls: json(p.calls), deadline: 0, agent_sig: null, intent: null,
    source: "bypass", status: "confirmed", verdict: score >= 60 ? "reject" : "flag", summary, outflows: json(p.outflows), llm: null,
    tx_hash: p.txHash, error: null, score, reasons: json(reasons),
  });
  // never mark a recipient as known from a bypass: that would let an attacker "warm up" an address
  if (score >= 60 && agent.exists && !agent.paused) {
    await chain.guardianPause(p.account, p.agentId);
    alert(p.account, p.agentId, "critical", `Guardian paused "${label}" after an on-chain op that bypassed the relay: ${summary} — ${reasons.join("; ")}`);
  } else {
    alert(p.account, p.agentId, "warn", `"${label}" executed outside the relay: ${summary}`);
  }
  emit(p.account, "op", { id });
}
