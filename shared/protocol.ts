// Shared protocol helpers used by the relay, SDK, MCP server, dashboard and demo.
import {
  decodeErrorResult,
  encodeAbiParameters,
  formatUnits,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { KillswitchAccountAbi } from "./abi.js";

export type Call = { target: Address; value: bigint; data: Hex };
export type WireCall = { target: Address; value: string; data: Hex };

export type TokenInfo = { symbol: string; address: Address; decimals: number };

export type Deployment = {
  chainId: number;
  rpc: string;
  factory: Address;
  dex: Address;
  tokens: Record<string, TokenInfo>;
  /** ETH is represented as address(0) in spend limits */
  deployedAt: number;
};

export const ETH: TokenInfo = {
  symbol: "ETH",
  address: "0x0000000000000000000000000000000000000000",
  decimals: 18,
};

export const SELECTORS = {
  transfer: "0xa9059cbb",
  approve: "0x095ea7b3",
  transferFrom: "0x23b872dd",
} as const;

const callTuple = [
  {
    type: "tuple[]",
    components: [
      { name: "target", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
  },
] as const;

export function callsHash(calls: Call[]): Hex {
  return keccak256(encodeAbiParameters(callTuple, [calls]));
}

export function opTypedData(p: {
  chainId: number;
  account: Address;
  agentId: Hex;
  calls: Call[];
  nonce: bigint;
  deadline: bigint;
}) {
  return {
    domain: { name: "Killswitch", version: "1", chainId: p.chainId, verifyingContract: p.account },
    types: {
      AgentOp: [
        { name: "agentId", type: "bytes32" },
        { name: "callsHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "AgentOp" as const,
    message: { agentId: p.agentId, callsHash: callsHash(p.calls), nonce: p.nonce, deadline: p.deadline },
  };
}

export const toWire = (calls: Call[]): WireCall[] =>
  calls.map((c) => ({ target: c.target, value: c.value.toString(), data: c.data }));
export const fromWire = (calls: WireCall[]): Call[] =>
  calls.map((c) => ({ target: c.target, value: BigInt(c.value), data: c.data }));

/** JSON.stringify that survives bigint */
export const json = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

export function tokenByAddress(dep: Deployment, addr: string): TokenInfo | undefined {
  if (addr.toLowerCase() === ETH.address) return ETH;
  return Object.values(dep.tokens).find((t) => t.address.toLowerCase() === addr.toLowerCase());
}

export function fmt(dep: Deployment, token: string, amount: bigint): string {
  const t = tokenByAddress(dep, token);
  if (!t) return amount.toString();
  const n = Number(formatUnits(amount, t.decimals));
  return `${n.toLocaleString("en-US", { maximumFractionDigits: t.decimals > 6 ? 6 : 2 })} ${t.symbol}`;
}

/** Turn contract revert data into a short human sentence. */
export function explainRevert(dep: Deployment, data: Hex | undefined): { name: string; human: string; args?: readonly unknown[] } {
  if (!data || data === "0x") return { name: "Unknown", human: "transaction reverted" };
  try {
    const err = decodeErrorResult({ abi: KillswitchAccountAbi, data });
    const a = (err.args ?? []) as readonly any[];
    const f = (t: string, v: bigint) => fmt(dep, t, v);
    const human: Record<string, () => string> = {
      CapExceeded: () => `over spending cap: ${f(a[0], a[1])} would be used of ${f(a[0], a[2])} allowed this period`,
      CosignRequired: () => `needs guardian co-signature: moves ${f(a[0], a[1])}, threshold ${f(a[0], a[2])}`,
      CallNotAllowed: () => `call not on the allowlist (contract ${short(a[0])}, function ${a[1]})`,
      AgentIsPaused: () => "agent is paused",
      AgentKilled: () => "all agents were killed by the owner",
      PermissionExpired: () => "permission has expired",
      UnknownAgent: () => "agent has no permission on this account (revoked or never granted)",
      DeadlinePassed: () => "operation deadline passed",
      BadAgentSignature: () => "bad agent signature or stale nonce",
      BadGuardianSignature: () => "bad guardian signature",
      DanglingAllowance: () => `leaves an open token approval to ${short(a[1])}; approve only what you spend`,
      SelfCallForbidden: () => "agents may not call the wallet itself",
      NativeValueNotAllowed: () => "agent may not send ETH",
      CallFailed: () => `call #${a[0]} failed inside the target contract`,
      Reentrancy: () => "re-entrancy blocked",
    };
    return { name: err.errorName, args: a, human: human[err.errorName]?.() ?? err.errorName };
  } catch {
    return { name: "Unknown", human: `reverted (${data.slice(0, 10)})` };
  }
}

export const short = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

/** Well-known Anvil dev keys. Local chain only — never use on a real network. */
export const ANVIL_KEYS = {
  owner: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  relayer: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  guardian: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  attacker: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  vendor: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
} as const satisfies Record<string, Hex>;
