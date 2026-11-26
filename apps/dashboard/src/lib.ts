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

// Pick the wallet via EIP-6963 so another extension (Phantom, Coinbase, Rabby…) that grabbed window.ethereum
// can't stand in for MetaMask. Every request is tagged with its method so errors say which step failed.
type Provider = { request: (a: { method: string; params?: unknown }) => Promise<any>; on?: Function; removeListener?: Function };
let picked: { provider: Provider; name: string } | null = null;
export const walletProvider = () => picked;
async function pickProvider(): Promise<{ provider: Provider; name: string }> {
  if (picked) return picked;
  const found: { info: { name: string; rdns: string }; provider: Provider }[] = [];
  const onAnnounce = (e: any) => found.push(e.detail);
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((r) => setTimeout(r, 300));
  window.removeEventListener("eip6963:announceProvider", onAnnounce);
  const mm = found.find((f) => f.info.rdns === "io.metamask") ?? found.find((f) => /metamask/i.test(f.info.name));
  const chosen = mm ?? found[0];
  const raw: Provider | undefined = chosen?.provider ?? (window as any).ethereum;
  if (!raw) throw new Error("No browser wallet found. Install MetaMask or use the dev wallet.");
  const name = chosen?.info.name ?? ((window as any).ethereum?.isMetaMask ? "MetaMask (legacy)" : "unknown wallet");
  const provider: Provider = {
    request: async (args) => {
      try { return await raw.request(args); }
      catch (err: any) { err.message = `${name} → ${args.method}: ${err?.message ?? err}`; throw err; }
    },
    on: raw.on?.bind(raw),
    removeListener: raw.removeListener?.bind(raw),
  };
  picked = { provider, name };
  return picked;
}

export async function browserOwner(cfg: Config): Promise<Owner> {
  const { provider: eth } = await pickProvider();
  const [address] = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
  if (!address) throw new Error("The wallet returned no account. Unlock it and connect this site.");
  const hexId = "0x" + cfg.chainId.toString(16);
  const c = chainOf(cfg);
  if (parseInt(await eth.request({ method: "eth_chainId" }), 16) !== cfg.chainId) {
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
    } catch (err: any) {
      if (err?.code !== 4902 && !/unrecognized|not added|4902/i.test(String(err?.message))) throw err;
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: hexId, chainName: c.name, rpcUrls: [cfg.rpc], nativeCurrency: c.nativeCurrency }],
      });
    }
    const now = parseInt(await eth.request({ method: "eth_chainId" }), 16);
    if (now !== cfg.chainId) throw new Error(`Your wallet is on chain ${now}; switch it to ${c.name} (${cfg.chainId}) and try again.`);
  }
  return { kind: "browser", address, wallet: createWalletClient({ account: address, chain: c, transport: custom(eth as any) }) };
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
