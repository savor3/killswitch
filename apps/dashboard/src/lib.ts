// Dashboard plumbing: relay API, chain clients, and the owner's wallet (dev key on Anvil, or a browser wallet).
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ANVIL_KEYS, type TokenInfo } from "../../../shared/protocol";

export type Config = {
  chainId: number;
  rpc: string;
  factory: Address;
  dex: Address;
  tokens: Record<string, TokenInfo>;
  guardian: Address;
  relayer: Address;
  llm: boolean;
};

export type Limit = {
  token: Address; symbol: string; decimals: number; maxPerPeriod: string; cosignAbove: string; period: number; used: string; resetsAt: number; text: string;
};
export type Agent = {
  id: Hex; label: string; sessionKey: Address; validUntil: number; nonce: string; paused: boolean; exists: boolean; active: boolean;
  killed: boolean; expired: boolean; rules: { target: Address; selector: Hex; name: string }[]; limits: Limit[];
};
export type AccountInfo = { address: Address; owner: Address; guardian: Address; epoch: string; balances: Record<string, string>; agents: Agent[] };
export type Op = {
  id: string; account: string; agent_id: string; label: string; source: string; status: string; verdict: string | null; score: number;
  reasons: string[]; summary: string; intent: string | null; tx_hash: string | null; error: string | null; cosigned: number;
  llm: { verdict: string; confidence: number; reasons: string[]; model: string; ms: number } | null; created_at: number;
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const b = await r.json();
  if (!r.ok) throw new Error(b.error ?? r.statusText);
  return b as T;
}

export function chainOf(cfg: Config) {
  return {
    id: cfg.chainId,
    name: cfg.chainId === 31337 ? "Local (Anvil)" : cfg.chainId === 84532 ? "Base Sepolia" : `Chain ${cfg.chainId}`,
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpc] } },
  } as const;
}

export function publicClient(cfg: Config): PublicClient {
  return createPublicClient({ chain: chainOf(cfg), transport: http(cfg.rpc), pollingInterval: 500 }) as PublicClient;
}

export type Owner = { kind: "dev" | "browser"; address: Address; wallet: WalletClient };

export function devOwner(cfg: Config): Owner {
  const account = privateKeyToAccount(ANVIL_KEYS.owner);
  return { kind: "dev", address: account.address, wallet: createWalletClient({ account, chain: chainOf(cfg), transport: http(cfg.rpc) }) };
}

export async function browserOwner(cfg: Config): Promise<Owner> {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No browser wallet found. Install MetaMask or use the dev wallet.");
  const [address] = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
  const hexId = "0x" + cfg.chainId.toString(16);
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch {
    const c = chainOf(cfg);
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: hexId, chainName: c.name, rpcUrls: [cfg.rpc], nativeCurrency: c.nativeCurrency }],
    });
  }
  return { kind: "browser", address, wallet: createWalletClient({ account: address, chain: chainOf(cfg), transport: custom(eth) }) };
}

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const amount = (raw: string | bigint, decimals: number, max = 4) =>
  Number(formatUnits(BigInt(raw), decimals)).toLocaleString("en-US", { maximumFractionDigits: max });
export const ago = (t: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - t));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
