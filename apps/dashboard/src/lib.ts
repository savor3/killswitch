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
  nonce?: number; deadline?: number; updated_at?: number;
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

// ------------------------------------------------------------------ the owner's browser wallet
// Wallets announce themselves through EIP-6963, so the visitor picks the one they mean, and another extension
// that grabbed window.ethereum can't stand in for it. The choice is remembered ("ks.wallet" and
// "ks.walletRdns"), and the site at the same address reads it to show the connected wallet. Every request is
// tagged with its method, so an error says which step failed.
type Provider = { request: (a: { method: string; params?: unknown }) => Promise<any>; on?: Function; removeListener?: Function };
export type WalletInfo = { rdns: string; name: string; icon: string; provider: Provider };
let picked: { provider: Provider; name: string; rdns: string } | null = null;
export const walletProvider = () => picked;
/** What the owner signs with, in words: the browser wallet's own name, or the local test wallet. */
export const ownerName = (o: Owner) => (o.kind === "dev" ? "Local test wallet" : picked?.name ?? "Browser wallet");
/** Forget the chosen wallet, so the next connection can use another. */
export const forgetWallet = () => {
  picked = null;
};

/** The wallets installed in this browser, MetaMask first; an old-style injected wallet if none announces. */
export async function listWallets(): Promise<WalletInfo[]> {
  const found = new Map<string, WalletInfo>();
  const onAnnounce = (e: any) => {
    const d = e.detail;
    if (d?.info?.rdns && d.provider) found.set(d.info.rdns, { rdns: d.info.rdns, name: d.info.name, icon: d.info.icon ?? "", provider: d.provider });
  };
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((r) => setTimeout(r, 350));
  window.removeEventListener("eip6963:announceProvider", onAnnounce);
  const list = [...found.values()].sort((a, b) => Number(b.rdns === "io.metamask") - Number(a.rdns === "io.metamask"));
  const legacy = (window as any).ethereum as Provider | undefined;
  if (!list.length && legacy)
    list.push({ rdns: "injected", name: (legacy as any).isMetaMask ? "MetaMask" : "Browser wallet", icon: "", provider: legacy });
  return list;
}

async function pickProvider(rdns?: string): Promise<{ provider: Provider; name: string; rdns: string }> {
  if (picked && (!rdns || picked.rdns === rdns)) return picked;
  const all = await listWallets();
  const want = rdns ?? localStorage.getItem("ks.walletRdns") ?? "";
  const chosen = all.find((w) => w.rdns === want) ?? all[0];
  if (!chosen) throw Object.assign(new Error("No wallet in this browser."), { code: "NO_WALLET" });
  const raw = chosen.provider;
  const provider: Provider = {
    request: async (args) => {
      try { return await raw.request(args); }
      catch (err: any) { err.message = `${chosen.name} → ${args.method}: ${err?.message ?? err}`; throw err; }
    },
    on: raw.on?.bind(raw),
    removeListener: raw.removeListener?.bind(raw),
  };
  picked = { provider, name: chosen.name, rdns: chosen.rdns };
  return picked;
}

/** What went wrong with a wallet request, in words for the person at the screen. */
export function walletError(e: any, name = "your wallet"): { kind: "rejected" | "pending" | "missing" | "failed"; text: string } {
  const msg = String(e?.message ?? e);
  if (e?.code === 4001 || /user rejected|user denied|rejected the request/i.test(msg))
    return { kind: "rejected", text: `You closed the request in ${name}. Nothing was shared.` };
  if (e?.code === -32002 || /already pending|already processing/i.test(msg))
    return { kind: "pending", text: `${name} already has a request open. Open ${name} to finish it.` };
  if (e?.code === "NO_WALLET") return { kind: "missing", text: "There is no wallet in this browser." };
  return { kind: "failed", text: msg.replace(/^[^→]*→\s*[\w_]+:\s*/, "") || "The wallet didn't answer." };
}

/**
 * The owner's browser wallet. `silent` only checks whether this site may already see an account (no prompt,
 * no network switch: used when the app opens); otherwise the wallet is asked to connect and to move to the
 * app's network, and `step` reports which of the two is waiting on the person.
 */
export async function browserOwner(
  cfg: Config,
  opts: { rdns?: string; silent?: boolean; step?: (s: "account" | "network") => void; live?: () => boolean } = {},
): Promise<Owner> {
  const { provider: eth } = await pickProvider(opts.rdns);
  opts.step?.("account");
  const [address] = (await eth.request({ method: opts.silent ? "eth_accounts" : "eth_requestAccounts" })) as Address[];
  if (!address) throw Object.assign(new Error("The wallet returned no account. Unlock it and connect this site."), { code: "NO_ACCOUNT" });
  // the person stopped waiting on the connect screen: a late answer is not followed by another request
  if (opts.live && !opts.live()) throw Object.assign(new Error("Stopped waiting."), { code: "STOPPED" });
  const hexId = "0x" + cfg.chainId.toString(16);
  const c = chainOf(cfg);
  if (!opts.silent && parseInt(await eth.request({ method: "eth_chainId" }), 16) !== cfg.chainId) {
    opts.step?.("network");
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

/** Ask the wallet to forget this site, where it can (MetaMask can); quietly nothing where it can't. */
export async function revokeWallet() {
  try {
    await picked?.provider.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
  } catch {
    // older wallets: the app forgets the wallet on its own side
  }
  forgetWallet();
}

/** The site's home page: the app runs at /app/ beside it (the dev server's site is on port 5230). */
export const HOME_URL = import.meta.env.DEV
  ? "http://localhost:5230/"
  : import.meta.env.BASE_URL !== "/"
    ? "/"
    : "https://app-killswitch.storygame.io/";

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
