import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, keccak256, parseUnits, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { KillswitchAccountAbi, KillswitchFactoryAbi, MockDEXAbi, MockERC20Abi } from "../../../shared/abi";
import { Flows } from "./flows";
import { Toasts, toasts, type Tone } from "./kit";
import {
  api, browserOwner, chainOf, devOwner, publicClient, short, walletProvider,
  type AccountInfo, type Agent, type Config, type Op, type Owner,
} from "./lib";
import { ActivityPage, AgentsPage, HomePage, Onboarding, SettingsPage, Skeleton } from "./pages";
import { Boot, Offline, Side, Tabs, Top } from "./shell";
import { buildGrant, decOf, humanSummary, type Prices, type TemplateId } from "./ui";

export type Page = "home" | "agents" | "activity" | "settings";
export type Theme = "system" | "light" | "dark";
export type Created = { label: string; account: Address; agentId: Hex; key: Hex };
export type GrantForm = { label: string; template: TemplateId; cap: string; cosign: string; wethCap: string; days: string };
export type Alert = { id: number; account: string; agent_id: string | null; level: "info" | "warn" | "critical"; message: string; created_at: number };
/** The dialog open over the page, if any. */
export type Sheet =
  | { k: "new" }
  | { k: "connect"; c: Created }
  | { k: "kill" }
  | { k: "approve"; op: Op }
  | { k: "remove"; a: Agent }
  | { k: "resume"; a: Agent }
  | { k: "deposit" }
  | { k: "withdraw" };
/** The detail drawer, by id, so it follows live data. */
export type Panel = { k: "op"; id: string } | { k: "agent"; id: Hex };
/** An action started from a dialog, as that dialog shows it: still going (with the step it is on), or how it
 *  ended if it did not go through. */
export type Pend = { label: string; stage: "work" | "failed" | "cancelled"; step?: string; hash?: string; text?: string };

/** Everything a page needs: the data, and the owner's actions. */
export type App = {
  cfg: Config; owner: Owner; info: AccountInfo; ops: Op[]; prices: Prices; busy: string | null; held: Op[]; pend: Pend | null;
  account: Address; accounts: Address[]; alerts: Alert[]; theme: Theme; notify: boolean;
  go: (p: Page) => void;
  ask: (s: Sheet) => void;
  open: (p: Panel) => void;
  decide: (op: Op, approve: boolean) => Promise<boolean>;
  agentTx: (fn: "pause" | "unpause" | "revoke", a: Agent) => Promise<boolean>;
  faucet: () => Promise<boolean>;
  createAccount: () => Promise<void>;
  setAccount: (a: Address) => void;
  setTheme: (t: Theme) => void;
  setNotify: (on: boolean) => void;
  disconnect: () => void;
  guardianPaused: (a: Agent) => boolean;
};

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};
const PAGES: Page[] = ["home", "agents", "activity", "settings"];
const pageFromHash = (): Page => {
  const h = location.hash.replace("#", "");
  return PAGES.includes(h as Page) ? (h as Page) : "home";
};
const LEVEL: Record<string, [Tone, string]> = { critical: ["bad", "Guardian"], warn: ["wait", "Needs you"], info: ["ok", "Guardian"] };

export function App() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [cfgErr, setCfgErr] = useState("");
  const [owner, setOwner] = useState<Owner | null>(null);
  const [accounts, setAccounts] = useState<Address[] | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [ops, setOps] = useState<Op[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [prices, setPrices] = useState<Prices>({ USDC: 1 });
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [pend, setPend] = useState<Pend | null>(null);
  const sheetRef = useRef<Sheet | null>(null);
  sheetRef.current = sheet;
  // a dialog's progress line belongs to that dialog: clear it when the dialog changes or closes
  useEffect(() => setPend(null), [sheet]);
  const [page, setPage] = useState<Page>(pageFromHash);
  // white unless chosen otherwise in Settings (a new key: the old one stored "system" for everybody)
  const [theme, setTheme] = useState<Theme>(() => (ls.get("ks.appearance") as Theme) ?? "light");
  const [notify, setNotifyState] = useState(() => ls.get("ks.notify") === "1");
  const [live, setLive] = useState(false);
  const [ring, setRing] = useState(0);
  const pub = useMemo(() => (cfg ? publicClient(cfg) : null), [cfg]);

  useEffect(() => {
    const on = () => setPage(pageFromHash());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  const go = useCallback((p: Page) => {
    if (location.hash !== `#${p}`) location.hash = p;
    setPage(p);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      if (theme === "dark" || (theme === "system" && mq.matches)) el.dataset.theme = "dark";
      else delete el.dataset.theme;
    };
    apply();
    ls.set("ks.appearance", theme);
    if (theme !== "system") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const say = useCallback((tone: Tone, text: string, title?: string, ms?: number) => toasts.show({ tone, text, title, ms }), []);

  // ---- boot: the relay's config, retried while the relay is unreachable
  const loadCfg = useCallback(() => {
    api<Config>("/v1/config")
      .then((c) => { setCfgErr(""); setCfg(c); })
      .catch(() => setCfgErr("Can't reach the Killswitch relay on port 8787. Start everything with ./start.sh"));
  }, []);
  useEffect(loadCfg, [loadCfg]);
  useEffect(() => {
    if (!cfg) return;
    const pref = ls.get("ks.wallet");
    if (pref === "browser") browserOwner(cfg).then(setOwner).catch(() => {});
    else if (pref === "dev" || cfg.chainId === 31337) setOwner(devOwner(cfg));
  }, [cfg]);
  // Follow MetaMask when the user switches account or network.
  useEffect(() => {
    const eth = walletProvider()?.provider as any;
    if (!cfg || !eth?.on || owner?.kind !== "browser") return;
    const onAccounts = (accs: string[]) => {
      if (!accs.length) { ls.set("ks.wallet", ""); setOwner(null); return; }
      if (accs[0].toLowerCase() !== owner.address.toLowerCase()) browserOwner(cfg).then(setOwner).catch(() => {});
    };
    const onChain = (id: string) => {
      if (parseInt(id, 16) !== cfg.chainId) say("hold", `Your wallet left ${chainOf(cfg).name}. It will switch back when you sign.`, "Network");
    };
    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => { eth.removeListener?.("accountsChanged", onAccounts); eth.removeListener?.("chainChanged", onChain); };
  }, [cfg, owner, say]);
  // Testnet: top up a fresh MetaMask owner with a little gas so they can sign without a faucet.
  useEffect(() => {
    if (!cfg || !pub || !owner || owner.kind !== "browser" || !(cfg as any).gasDrip) return;
    pub.getBalance({ address: owner.address }).then((bal) => {
      if (bal >= 200_000_000_000_000n) return;
      return api<{ sent: boolean }>("/v1/gas", { method: "POST", body: JSON.stringify({ address: owner.address }) })
        .then((r) => r.sent && say("ok", "Sent you a little test ETH for gas.", "Gas"));
    }).catch((e) => say("hold", `Couldn't send test gas: ${e.message}`, "Gas"));
  }, [cfg, pub, owner, say]);
  useEffect(() => {
    if (!cfg || !pub) return;
    pub.readContract({ address: cfg.dex, abi: MockDEXAbi as any, functionName: "quote", args: [cfg.tokens.WETH.address, 10n ** 18n] })
      .then((out) => { const p = Number(out as bigint) / 1e6; setPrices({ USDC: 1, WETH: p, ETH: p }); })
      .catch(() => {});
  }, [cfg, pub]);

  const loadAccounts = useCallback(async () => {
    if (!owner) return;
    const r = await api<{ accounts: Address[] }>(`/v1/accounts?owner=${owner.address}`);
    setAccounts(r.accounts);
    setAccount((cur) => {
      if (cur && r.accounts.includes(cur)) return cur;
      const saved = ls.get(`ks.account.${owner.address}`);
      return (r.accounts.find((a) => a === saved) ?? r.accounts[r.accounts.length - 1] ?? null) as Address | null;
    });
  }, [owner]);
  useEffect(() => { loadAccounts().catch((e) => say("hold", e.message)); }, [loadAccounts, say]);

  const refresh = useCallback(async () => {
    if (!account) return;
    const [i, o, a] = await Promise.all([
      api<AccountInfo>(`/v1/accounts/${account}`),
      api<{ ops: Op[] }>(`/v1/ops?account=${account}`),
      api<{ alerts: Alert[] }>(`/v1/alerts?account=${account}`).catch(() => null),
    ]);
    setInfo(i);
    setOps(o.ops);
    if (a) setAlerts(a.alerts);
  }, [account]);

  // live: poll every 5 s, and refresh shortly after anything the relay streams; alerts become toasts
  const goRef = useRef(go);
  goRef.current = go;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  // the relay also announces a kill-all; when it was this owner pressing it here, our own toast already says so
  const ownKill = useRef(0);
  useEffect(() => {
    if (!account || !owner) return;
    ls.set(`ks.account.${owner.address}`, account);
    setInfo(null);
    setAlerts([]);
    refresh().catch(() => {});
    const poll = setInterval(() => refresh().catch(() => {}), 5000);
    const es = new EventSource(`/v1/stream?account=${account}`);
    let t: ReturnType<typeof setTimeout> | undefined;
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (m) => {
      const e = JSON.parse(m.data);
      setLive(true);
      if (e.type === "alert" && !(/KILL ALL/.test(e.data.message) && Date.now() - ownKill.current < 60000)) {
        const [tone, title] = LEVEL[e.data.level] ?? LEVEL.info;
        const agentId = e.data.agentId as Hex | null;
        toasts.show({
          tone, title, text: e.data.message, ms: e.data.level === "critical" ? 12000 : 8000,
          action: e.data.level === "warn"
            ? { label: "Review", run: () => goRef.current("home") }
            : agentId ? { label: "See the agent", run: () => setPanel({ k: "agent", id: agentId }) } : undefined,
        });
        setRing((r) => r + 1);
        if (notifyRef.current && document.visibilityState === "hidden" && "Notification" in window && Notification.permission === "granted") {
          try { new Notification(e.data.level === "warn" ? "Killswitch: needs you" : "Killswitch", { body: e.data.message, icon: "/icon-192.png", tag: `ks-${e.at}` }); } catch {}
        }
      }
      clearTimeout(t);
      t = setTimeout(() => refresh().catch(() => {}), 250);
    };
    return () => { clearInterval(poll); es.close(); clearTimeout(t); setLive(false); };
  }, [account, owner, refresh]);

  const held = useMemo(() => ops.filter((o) => o.status === "held"), [ops]);
  useEffect(() => {
    document.title = held.length ? `(${held.length}) Killswitch` : "Killswitch";
  }, [held.length]);

  // ---- owner actions: each one a transaction, shown as it goes (sign, confirm, then done or not). Started from a
  // dialog, the dialog shows the steps itself; otherwise a toast does. A success always ends in a green toast.
  const signStep = () => (owner?.kind === "browser" ? "Waiting for your signature in your wallet" : "Signing");
  async function tx(label: string, fn: () => Promise<Hex>, done?: { title?: string; text?: string } | false) {
    if (!pub) return false;
    const inDialog = sheetRef.current !== null;
    setBusy(label);
    setPend(inDialog ? { label, stage: "work", step: signStep() } : null);
    const tid = inDialog ? null : toasts.show({ tone: "wait", busy: true, title: signStep(), text: label, sticky: true });
    try {
      const hash = await fn();
      if (inDialog) setPend({ label, stage: "work", step: "Confirming on chain", hash });
      if (tid) toasts.update(tid, { title: "Confirming on chain", text: `${label} · ${short(hash)}` });
      const r = await pub.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("transaction reverted");
      await refresh().catch(() => {});
      setPend(null);
      if (done !== false) {
        const t = { tone: "ok" as Tone, busy: false, title: done?.title ?? "Done", text: done?.text ?? label, sticky: false, ms: 5000 };
        if (tid) toasts.update(tid, t);
        else toasts.show(t);
      } else if (tid) toasts.dismiss(tid);
      return true;
    } catch (e) {
      console.error(label, e);
      const err = e as any;
      const detail = [err.shortMessage ?? err.message?.split("\n")[0], err.details].filter((x: string, i: number, a: string[]) => x && a.indexOf(x) === i).join(" | ");
      const cancelled = /user rejected|rejected the request|denied transaction|user denied/i.test(detail);
      if (inDialog) {
        setPend(cancelled
          ? { label, stage: "cancelled", text: "You didn't sign, so nothing changed." }
          : { label, stage: "failed", text: `It didn't go through: ${detail}` });
      } else if (tid) {
        toasts.update(tid, cancelled
          ? { tone: "off", busy: false, title: "Cancelled", text: "You didn't sign, so nothing changed.", sticky: false, ms: 5000 }
          : { tone: "bad", busy: false, title: "Failed", text: `${label} failed: ${detail}`, sticky: false, ms: 12000 });
      }
      return false;
    } finally {
      setBusy(null);
    }
  }
  const write = async (address: Address, abi: any, functionName: string, args: unknown[]) => {
    let o = owner!;
    if (o.kind === "browser") {
      // MetaMask only signs for the account it has connected to this site, on the right chain. Re-check right before signing.
      const fresh = await browserOwner(cfg!);
      if (fresh.address.toLowerCase() !== o.address.toLowerCase()) {
        setOwner(fresh);
        throw new Error(`MetaMask is now on ${short(fresh.address)}. Switched to it; please try again.`);
      }
      o = fresh;
    }
    return o.wallet.writeContract({ address, abi, functionName, args, account: o.wallet.account!, chain: chainOf(cfg!) } as any);
  };

  const connectDev = () => { ls.set("ks.wallet", "dev"); setOwner(devOwner(cfg!)); };
  const connectBrowser = () =>
    browserOwner(cfg!).then((o) => { ls.set("ks.wallet", "browser"); setOwner(o); }).catch((e) => say("hold", e.message, "Wallet"));
  async function createAccount() {
    const salt = keccak256(toHex(`${owner!.address}-${Date.now()}`));
    const ok = await tx("Creating your protected wallet", () => write(cfg!.factory, KillswitchFactoryAbi, "createAccount", [cfg!.guardian, salt]), { text: "Protected wallet created. You're on it now." });
    if (ok) {
      // open the new wallet, which the factory lists last
      const r = await api<{ accounts: Address[] }>(`/v1/accounts?owner=${owner!.address}`).catch(() => null);
      if (r) { setAccounts(r.accounts); setAccount(r.accounts[r.accounts.length - 1] ?? null); }
      else await loadAccounts().catch(() => {});
      go("home");
    }
  }
  const faucet = () => tx("Adding 1,000 test USDC", () => write(cfg!.tokens.USDC.address, MockERC20Abi, "mint", [account, parseUnits("1000", 6)]), { text: "1,000 test USDC added." });
  const agentTx = (fn: "pause" | "unpause" | "revoke", a: Agent) =>
    tx(`${fn === "pause" ? "Pausing" : fn === "unpause" ? "Resuming" : "Removing"} ${a.label}`, () => write(account!, KillswitchAccountAbi, fn, [a.id]), {
      text: fn === "pause" ? `${a.label} is paused. Nothing it signs will go through.` : fn === "unpause" ? `${a.label} is working again, inside its limits.` : `${a.label} is removed. Its key no longer works.`,
    });
  async function killAll() {
    ownKill.current = Date.now();
    const ok = await tx("Stopping every agent", () => write(account!, KillswitchAccountAbi, "killAll", []), {
      title: "All agents stopped", text: "Every agent permission is now void. Nothing can move your funds except you.",
    });
    if (ok) setSheet(null);
  }
  async function decide(op: Op, approve: boolean) {
    const label = `${approve ? "Approve" : "Deny"}: ${humanSummary(cfg!, op.summary)}`;
    const inDialog = sheetRef.current !== null;
    setBusy(`decide-${op.id}`);
    setPend(inDialog ? { label, stage: "work", step: signStep() } : null);
    const tid = inDialog ? null : toasts.show({ tone: "wait", busy: true, title: signStep(), text: label, sticky: true });
    try {
      const signature = await owner!.wallet.signMessage({ account: owner!.wallet.account!, message: `Killswitch: ${approve ? "approve" : "deny"} operation ${op.id}` });
      const step = approve ? "Sending the payment" : "Recording your answer";
      if (inDialog) setPend({ label, stage: "work", step });
      if (tid) toasts.update(tid, { title: step, text: label });
      const r = await api<{ status: string }>(`/v1/ops/${op.id}/decision`, { method: "POST", body: JSON.stringify({ approve, signature }) });
      await refresh().catch(() => {});
      setPend(null);
      const t = approve
        ? r.status === "confirmed"
          ? { tone: "ok" as Tone, title: "Approved", text: "Approved and sent." }
          : { tone: "hold" as Tone, title: "Approved", text: `Approved, but ${r.status}.`, ms: 9000 }
        : { tone: "off" as Tone, title: "Denied", text: "Denied. Nothing was sent." };
      if (tid) toasts.update(tid, { ...t, busy: false, sticky: false });
      else toasts.show(t);
      return true;
    } catch (e) {
      const m = (e as Error).message;
      const cancelled = /user rejected|rejected the request|user denied/i.test(m);
      if (inDialog) {
        setPend(cancelled ? { label, stage: "cancelled", text: "You didn't sign, so nothing changed." } : { label, stage: "failed", text: m });
      } else if (tid) {
        toasts.update(tid, cancelled
          ? { tone: "off", busy: false, title: "Cancelled", text: "You didn't sign, so nothing changed.", sticky: false }
          : { tone: "bad", busy: false, title: "Not done", text: m, sticky: false, ms: 12000 });
      }
      return false;
    } finally {
      setBusy(null);
    }
  }
  async function grant(f: GrantForm) {
    const key = generatePrivateKey();
    const agentId = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const { rules, limits } = buildGrant(cfg!, f.template, f.cap, f.cosign, f.wethCap);
    const validUntil = Math.floor(Date.now() / 1000) + Number(f.days) * 86400;
    // no toast on success: the next dialog ("… is ready") says it
    const ok = await tx(`Granting ${f.label}`, () =>
      write(account!, KillswitchAccountAbi, "grant", [agentId, f.label, privateKeyToAccount(key).address, validUntil, rules, limits]),
    false);
    if (ok) setSheet({ k: "connect", c: { label: f.label, account: account!, agentId, key } });
  }
  /** The owner moves funds out of the protected wallet, back to the owner's own address. */
  async function withdraw(sym: string, amount: string) {
    const raw = parseUnits(amount, decOf(cfg!, sym));
    const t = sym === "ETH" ? null : cfg!.tokens[sym];
    const call = t
      ? { target: t.address, value: 0n, data: encodeFunctionData({ abi: MockERC20Abi, functionName: "transfer", args: [owner!.address, raw] }) }
      : { target: owner!.address, value: raw, data: "0x" as Hex };
    const ok = await tx(`Moving ${amount} ${sym} to your wallet`, () => write(account!, KillswitchAccountAbi, "execute", [[call]]), {
      text: `${amount} ${sym} is back in your wallet.`,
    });
    if (ok) setSheet(null);
    return ok;
  }
  const setNotify = (on: boolean) => {
    const apply = (v: boolean) => { setNotifyState(v); ls.set("ks.notify", v ? "1" : ""); };
    if (!on) return apply(false);
    if (!("Notification" in window)) return say("hold", "This browser can't show notifications.", "Notifications");
    Notification.requestPermission().then((p) => {
      if (p === "granted") { apply(true); say("ok", "You'll get a notification when an agent needs you and this tab is in the background.", "Notifications"); }
      else say("hold", "Notifications are blocked for this site. Allow them in the browser's site settings.", "Notifications");
    });
  };
  const disconnect = () => { ls.set("ks.wallet", ""); setOwner(null); setAccounts(null); setAccount(null); setInfo(null); setOps([]); };

  // ---- screens before the app
  if (cfgErr) return <><Offline onRetry={loadCfg} /><Toasts /></>;
  if (!cfg) return <Boot />;
  if (owner && accounts === null) return <Boot />;
  if (!owner || accounts === null || accounts.length === 0) {
    return (
      <>
        <Onboarding cfg={cfg} owner={owner} loading={!!owner && accounts === null} busy={busy} onDev={connectDev} onBrowser={connectBrowser} onCreate={createAccount} />
        <Toasts />
      </>
    );
  }

  const guardianPaused = (a: Agent) =>
    a.paused && ops.some((o) => o.agent_id.toLowerCase() === a.id.toLowerCase() && (o.status === "rejected" || (o.source === "bypass" && o.verdict === "reject")));
  const app: App | null = info && account
    ? {
        cfg, owner, info, ops, prices, busy, held, pend, account, accounts, alerts, theme, notify,
        go, ask: setSheet, open: setPanel, decide, agentTx, faucet, createAccount, setAccount, setTheme, setNotify, disconnect, guardianPaused,
      }
    : null;

  return (
    <div className="app">
      <Side page={page} go={go} held={held.length} cfg={cfg} owner={owner} accounts={accounts} account={account} setAccount={setAccount} live={live} busy={busy} onCreate={createAccount} />
      <main className="main">
        <div className="main-in">
          <Top
            page={page} cfg={cfg} owner={owner} live={live} alerts={alerts} account={account} ring={ring} go={go} open={setPanel}
            accounts={accounts} setAccount={setAccount} busy={busy} onCreate={createAccount}
          />
          {!app ? <Skeleton /> : (
            <div className="page" key={page}>
              {page === "home" && <HomePage app={app} />}
              {page === "agents" && <AgentsPage app={app} />}
              {page === "activity" && <ActivityPage app={app} />}
              {page === "settings" && <SettingsPage app={app} />}
            </div>
          )}
        </div>
      </main>
      <Tabs page={page} go={go} held={held.length} />
      {app && <Flows app={app} sheet={sheet} panel={panel} setSheet={setSheet} setPanel={setPanel} grant={grant} killAll={killAll} withdraw={withdraw} />}
      <Toasts />
    </div>
  );
}
