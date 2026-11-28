// The visitor's wallet on the site. The web app runs at /app/ on the site's own address, so the two share their
// storage and the wallet's permission for the address: whichever connects notes the kind of wallet ("ks.wallet")
// and which one ("ks.walletRdns", from EIP-6963), and `eth_accounts` then answers silently with the account the
// site may see, or nothing once either has disconnected. The pre-sale card connects here the way the web app
// does (apps/dashboard connect.tsx), so connecting on one is connecting on both.
import { useEffect, useState } from "react";

export type Eip1193 = {
  request(a: { method: string; params?: unknown }): Promise<unknown>;
  on?(event: string, fn: (...a: never[]) => void): void;
  removeListener?(event: string, fn: (...a: never[]) => void): void;
};
type Announce = { info: { rdns: string; name: string; icon?: string }; provider: Eip1193 };
export type WalletInfo = { rdns: string; name: string; icon: string; provider: Eip1193 };

const CHANGED = "ks:wallet";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // private mode: the connection lasts for this page only
  }
};

/** Every wallet installed in this browser, MetaMask first; an old-style injected one if none announces itself. */
export function listWallets(): Promise<WalletInfo[]> {
  return new Promise((resolve) => {
    const found = new Map<string, WalletInfo>();
    const on = (e: Event) => {
      const d = (e as CustomEvent<Announce>).detail;
      if (d?.info?.rdns && d.provider) found.set(d.info.rdns, { rdns: d.info.rdns, name: d.info.name, icon: d.info.icon ?? "", provider: d.provider });
    };
    addEventListener("eip6963:announceProvider", on);
    dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      removeEventListener("eip6963:announceProvider", on);
      const list = [...found.values()].sort((a, b) => Number(b.rdns === "io.metamask") - Number(a.rdns === "io.metamask"));
      const legacy = (window as unknown as { ethereum?: Eip1193 & { isMetaMask?: boolean } }).ethereum;
      if (!list.length && legacy) list.push({ rdns: "injected", name: legacy.isMetaMask ? "MetaMask" : "Browser wallet", icon: "", provider: legacy });
      resolve(list);
    }, 300);
  });
}

/** The wallet chosen before, or the first one there is. */
async function findProvider(rdns: string | null): Promise<Eip1193 | null> {
  const all = await listWallets();
  return ((rdns ? all.find((w) => w.rdns === rdns) : undefined) ?? all[0])?.provider ?? null;
}

/** Ask the wallet for its account. `live` says whether the visitor is still waiting: a late answer after they
 *  stopped is not kept. */
export async function connectWallet(w: WalletInfo, live: () => boolean = () => true): Promise<string | null> {
  const accs = (await w.provider.request({ method: "eth_requestAccounts" })) as string[];
  if (!live()) return null;
  if (!accs?.[0]) throw Object.assign(new Error("The wallet returned no account. Unlock it and try again."), { code: "NO_ACCOUNT" });
  write("ks.wallet", "browser");
  write("ks.walletRdns", w.rdns);
  dispatchEvent(new CustomEvent(CHANGED, { detail: accs[0] }));
  return accs[0];
}

/** Ask the wallet to forget the site where it can, and forget it here (the web app too). */
export async function disconnectWallet() {
  const p = await findProvider(read("ks.walletRdns"));
  try {
    await p?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
  } catch {
    // older wallets: the site forgets the wallet on its own side
  }
  write("ks.wallet", "");
  write("ks.walletRdns", "");
  dispatchEvent(new CustomEvent(CHANGED, { detail: null }));
}

/** What went wrong with a wallet request, in words. */
export function walletError(e: unknown, name: string): { kind: "rejected" | "pending" | "failed"; text: string } {
  const err = e as { code?: number | string; message?: string } | null;
  const msg = String(err?.message ?? e);
  if (err?.code === 4001 || /user rejected|user denied|rejected the request/i.test(msg))
    return { kind: "rejected", text: `You closed the request in ${name}. Nothing was shared.` };
  if (err?.code === -32002 || /already pending|already processing/i.test(msg))
    return { kind: "pending", text: `${name} already has a request open. Open ${name} to finish it.` };
  return { kind: "failed", text: msg || "The wallet didn't answer." };
}

/** The connected address, or null (also while the page starts, and when the app chose the local test wallet).
 *  Follows a connect or disconnect on this page, in another tab, and in the wallet itself. */
export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    // a connect or disconnect on this page says the address at once; then it is read again from the wallet
    const changed = (e: Event) => {
      const a = (e as CustomEvent<string | null>).detail;
      if (a !== undefined) setAddress(a);
      setV((x) => x + 1);
    };
    const bump = () => setV((x) => x + 1);
    const storage = (e: StorageEvent) => e.key?.startsWith("ks.wallet") && bump();
    addEventListener(CHANGED, changed);
    addEventListener("storage", storage);
    return () => {
      removeEventListener(CHANGED, changed);
      removeEventListener("storage", storage);
    };
  }, []);
  useEffect(() => {
    if (read("ks.wallet") !== "browser") {
      setAddress(null);
      return;
    }
    let live = true;
    let eth: Eip1193 | null = null;
    const set = (accs: unknown) => {
      if (live) setAddress(Array.isArray(accs) && typeof accs[0] === "string" ? accs[0] : null);
    };
    findProvider(read("ks.walletRdns")).then((p) => {
      if (!live || !p) return;
      eth = p;
      p.request({ method: "eth_accounts" }).then(set, () => set([]));
      p.on?.("accountsChanged", set as (...a: never[]) => void);
    });
    return () => {
      live = false;
      eth?.removeListener?.("accountsChanged", set as (...a: never[]) => void);
    };
  }, [v]);
  return address;
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
