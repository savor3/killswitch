// @killswitch/agent — what an AI agent uses to act on a Killswitch wallet.
// The agent only holds a scoped session key. Every operation goes through the relay + guardian,
// and the wallet contract enforces the owner's limits no matter what.
import {
  createPublicClient,
  encodeFunctionData,
  http,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MockDEXAbi, MockERC20Abi } from "../../shared/abi.js";
import { opTypedData, toWire, type Call, type TokenInfo } from "../../shared/protocol.js";

export type AgentOptions = {
  relayUrl: string;
  account: Address;
  agentId: Hex;
  sessionKey: Hex;
};

export type OpResult = {
  id: string;
  status: "confirmed" | "blocked" | "held" | "rejected" | "failed" | "denied";
  verdict: string;
  reasons: string[];
  txHash?: string;
  paused?: boolean;
  remaining?: Record<string, string>;
};

type Config = {
  chainId: number;
  rpc: string;
  dex: Address;
  tokens: Record<string, TokenInfo>;
};

export function createKillswitchAgent(opts: AgentOptions) {
  const signer = privateKeyToAccount(opts.sessionKey);
  const base = opts.relayUrl.replace(/\/$/, "");
  let cfg: Config | null = null;

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const r = await fetch(base + path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const body = await r.json();
    if (!r.ok) throw new Error(`Killswitch: ${body.error ?? r.statusText}`);
    return body as T;
  }

  async function config(): Promise<Config> {
    cfg ??= await api<Config>("/v1/config");
    return cfg;
  }

  function token(c: Config, symbol: string): TokenInfo {
    const t = c.tokens[symbol.toUpperCase()];
    if (!t) throw new Error(`unknown token ${symbol}; known: ${Object.keys(c.tokens).join(", ")}`);
    return t;
  }

  /** This agent's own permission: status, allowed calls, caps and what's left. */
  async function status() {
    return api<any>(`/v1/accounts/${opts.account}/agents/${opts.agentId}`);
  }

  async function balances(): Promise<Record<string, string>> {
    const a = await api<any>(`/v1/accounts/${opts.account}`);
    const c = await config();
    const out: Record<string, string> = {};
    for (const [sym, raw] of Object.entries(a.balances as Record<string, string>)) {
      const dec = sym === "ETH" ? 18 : c.tokens[sym]?.decimals ?? 18;
      out[sym] = (Number(raw) / 10 ** dec).toString();
    }
    return out;
  }

  /** Sign and submit raw calls. `intent` is what the agent says it is doing; the guardian compares it with the real effect. */
  async function send(calls: Call[], intent: string, ttlSec = 1800): Promise<OpResult> {
    const c = await config();
    const st = await status();
    if (!st.exists) throw new Error("Killswitch: this agent has no permission on the wallet");
    const deadline = BigInt(Math.floor(Date.now() / 1000) + ttlSec);
    const signature = await signer.signTypedData(
      opTypedData({ chainId: c.chainId, account: opts.account, agentId: opts.agentId, calls, nonce: BigInt(st.nonce), deadline }),
    );
    return api<OpResult>("/v1/ops", {
      method: "POST",
      body: JSON.stringify({ account: opts.account, agentId: opts.agentId, calls: toWire(calls), deadline: deadline.toString(), signature, intent }),
    });
  }

  /** Send tokens. amount is human units, e.g. "12.5". */
  async function transfer(symbol: string, to: Address, amount: string, intent: string) {
    const c = await config();
    const t = token(c, symbol);
    const data = encodeFunctionData({ abi: MockERC20Abi, functionName: "transfer", args: [to, parseUnits(amount, t.decimals)] });
    return send([{ target: t.address, value: 0n, data }], intent);
  }

  /** Swap on the DEX: approve exactly amountIn, swap, with slippage protection. Leaves no open approval. */
  async function swap(fromSymbol: string, toSymbol: string, amount: string, intent: string, slippageBps = 100) {
    const c = await config();
    const tIn = token(c, fromSymbol);
    token(c, toSymbol);
    const amountIn = parseUnits(amount, tIn.decimals);
    const pub = createPublicClient({ transport: http(c.rpc) });
    const quote = await pub.readContract({ address: c.dex, abi: MockDEXAbi, functionName: "quote", args: [tIn.address, amountIn] });
    const minOut = (quote * BigInt(10_000 - slippageBps)) / 10_000n;
    return send(
      [
        { target: tIn.address, value: 0n, data: encodeFunctionData({ abi: MockERC20Abi, functionName: "approve", args: [c.dex, amountIn] }) },
        { target: c.dex, value: 0n, data: encodeFunctionData({ abi: MockDEXAbi, functionName: "swapExactIn", args: [tIn.address, amountIn, minOut] }) },
      ],
      intent,
    );
  }

  /** Poll an op until it leaves the "held" state (owner approves/denies in the dashboard). */
  async function waitForDecision(id: string, timeoutMs = 120_000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const op = await api<any>(`/v1/ops/${id}`);
      if (op.status !== "held" && op.status !== "pending") return op;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return api<any>(`/v1/ops/${id}`);
  }

  return { address: signer.address, config, status, balances, send, transfer, swap, waitForDecision };
}

export type KillswitchAgent = ReturnType<typeof createKillswitchAgent>;
