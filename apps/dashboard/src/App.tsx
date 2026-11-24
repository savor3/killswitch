import { useCallback, useEffect, useMemo, useState } from "react";
import { keccak256, parseUnits, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { KillswitchAccountAbi, KillswitchFactoryAbi, MockDEXAbi, MockERC20Abi } from "../../../shared/abi";
import {
  ago, api, browserOwner, chainOf, devOwner, publicClient, short,
  type AccountInfo, type Agent, type Config, type Op, type Owner,
} from "./lib";
import {
  Icon, Logo, TEMPLATES, agentKind, balanceUsd, buildGrant, decOf, exposureUsd, humanSummary, num, opKind, plural,
  ruleText, toNum, tpl, until, usd, type Prices, type TemplateId,
} from "./ui";

type Toast = { id: number; level: string; message: string };
type Created = { label: string; account: Address; agentId: Hex; key: Hex };
type Page = "home" | "agents" | "activity" | "settings";
type Theme = "system" | "light" | "dark";

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};
const pageFromHash = (): Page => {
  const h = location.hash.replace("#", "");
  return (["home", "agents", "activity", "settings"] as Page[]).includes(h as Page) ? (h as Page) : "home";
};

export function App() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [cfgErr, setCfgErr] = useState("");
  const [owner, setOwner] = useState<Owner | null>(null);
  const [accounts, setAccounts] = useState<Address[] | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [ops, setOps] = useState<Op[]>([]);
  const [prices, setPrices] = useState<Prices>({ USDC: 1 });
  const [busy, setBusy] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [showKill, setShowKill] = useState(false);
  const [page, setPage] = useState<Page>(pageFromHash);
  const [theme, setTheme] = useState<Theme>(() => (ls.get("ks.theme") as Theme) ?? "system");
  const pub = useMemo(() => (cfg ? publicClient(cfg) : null), [cfg]);

  useEffect(() => {
    const on = () => setPage(pageFromHash());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  const go = (p: Page) => { location.hash = p; setPage(p); window.scrollTo({ top: 0 }); };

  useEffect(() => {
    const el = document.documentElement;
    if (theme === "system") delete el.dataset.theme; else el.dataset.theme = theme;
    ls.set("ks.theme", theme);
  }, [theme]);

  const toast = useCallback((level: string, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, level, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), level === "critical" ? 12000 : 6000);
  }, []);

  // ---- boot
  useEffect(() => {
    api<Config>("/v1/config").then(setCfg).catch(() => setCfgErr("Can't reach the Killswitch relay on port 8787. Start everything with ./start.sh"));
  }, []);
  useEffect(() => {
    if (!cfg) return;
    const pref = ls.get("ks.wallet");
    if (pref === "browser") browserOwner(cfg).then(setOwner).catch(() => {});
    else if (pref === "dev" || cfg.chainId === 31337) setOwner(devOwner(cfg));
  }, [cfg]);
  // Testnet: top up a fresh MetaMask owner with a little gas so they can sign without a faucet.
  useEffect(() => {
    if (!cfg || !pub || !owner || owner.kind !== "browser" || !(cfg as any).gasDrip) return;
    pub.getBalance({ address: owner.address }).then((bal) => {
      if (bal >= 200_000_000_000_000n) return;
      return api<{ sent: boolean }>("/v1/gas", { method: "POST", body: JSON.stringify({ address: owner.address }) })
        .then((r) => r.sent && toast("info", "Sent you a little test ETH for gas."));
    }).catch((e) => toast("warn", `Couldn't send test gas: ${e.message}`));
  }, [cfg, pub, owner, toast]);
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
  useEffect(() => { loadAccounts().catch((e) => toast("warn", e.message)); }, [loadAccounts, toast]);

  const refresh = useCallback(async () => {
    if (!account) return;
    const [i, o] = await Promise.all([api<AccountInfo>(`/v1/accounts/${account}`), api<{ ops: Op[] }>(`/v1/ops?account=${account}`)]);
    setInfo(i);
    setOps(o.ops);
  }, [account]);

  useEffect(() => {
    if (!account || !owner) return;
    ls.set(`ks.account.${owner.address}`, account);
    setInfo(null);
    refresh().catch(() => {});
    const poll = setInterval(() => refresh().catch(() => {}), 5000);
    const es = new EventSource(`/v1/stream?account=${account}`);
    let t: ReturnType<typeof setTimeout> | undefined;
    es.onmessage = (m) => {
      const e = JSON.parse(m.data);
      if (e.type === "alert") toast(e.data.level, e.data.message);
      clearTimeout(t);
      t = setTimeout(() => refresh().catch(() => {}), 250);
    };
    return () => { clearInterval(poll); es.close(); clearTimeout(t); };
  }, [account, owner, refresh, toast]);

  // ---- owner actions
  async function tx(label: string, fn: () => Promise<Hex>) {
    if (!pub) return false;
    setBusy(label);
    try {
      const hash = await fn();
      const r = await pub.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("transaction reverted");
      await refresh();
      return true;
    } catch (e) {
      toast("warn", `${label} failed: ${(e as Error).message.split("\n")[0]}`);
      return false;
    } finally {
      setBusy(null);
    }
  }
  const write = (address: Address, abi: any, functionName: string, args: unknown[]) =>
    owner!.wallet.writeContract({ address, abi, functionName, args, account: owner!.wallet.account!, chain: chainOf(cfg!) } as any);

  const connectDev = () => { ls.set("ks.wallet", "dev"); setOwner(devOwner(cfg!)); };
  const connectBrowser = () =>
    browserOwner(cfg!).then((o) => { ls.set("ks.wallet", "browser"); setOwner(o); }).catch((e) => toast("warn", e.message));
  async function createAccount() {
    const salt = keccak256(toHex(`${owner!.address}-${Date.now()}`));
    const ok = await tx("Creating your protected wallet", () => write(cfg!.factory, KillswitchFactoryAbi, "createAccount", [cfg!.guardian, salt]));
    if (ok) { setAccount(null); await loadAccounts(); toast("info", "Protected wallet created."); }
  }
  const faucet = () => tx("Adding 1,000 test USDC", () => write(cfg!.tokens.USDC.address, MockERC20Abi, "mint", [account, parseUnits("1000", 6)]));
  const agentTx = (fn: "pause" | "unpause" | "revoke", a: Agent) =>
    tx(`${fn === "pause" ? "Pausing" : fn === "unpause" ? "Resuming" : "Removing"} ${a.label}`, () => write(account!, KillswitchAccountAbi, fn, [a.id]));
  async function killAll() {
    if (await tx("Stopping every agent", () => write(account!, KillswitchAccountAbi, "killAll", []))) {
      setShowKill(false);
      toast("critical", "Every agent permission is now void. Nothing can move your funds except you.");
    }
  }
  async function decide(op: Op, approve: boolean) {
    setBusy(`decide-${op.id}`);
    try {
      const signature = await owner!.wallet.signMessage({ account: owner!.wallet.account!, message: `Killswitch: ${approve ? "approve" : "deny"} operation ${op.id}` });
      const r = await api<{ status: string }>(`/v1/ops/${op.id}/decision`, { method: "POST", body: JSON.stringify({ approve, signature }) });
      toast(r.status === "confirmed" ? "info" : "warn", approve ? (r.status === "confirmed" ? "Approved and sent." : `Approved, but ${r.status}.`) : "Denied. Nothing was sent.");
      await refresh();
    } catch (e) {
      toast("warn", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function grant(f: GrantForm) {
    const key = generatePrivateKey();
    const agentId = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const { rules, limits } = buildGrant(cfg!, f.template, f.cap, f.cosign, f.wethCap);
    const validUntil = Math.floor(Date.now() / 1000) + Number(f.days) * 86400;
    const ok = await tx(`Granting ${f.label}`, () =>
      write(account!, KillswitchAccountAbi, "grant", [agentId, f.label, privateKeyToAccount(key).address, validUntil, rules, limits]),
    );
    if (ok) { setShowNew(false); setCreated({ label: f.label, account: account!, agentId, key }); }
  }

  // ---- render
  if (cfgErr) return <Center><div className="hero-ic bad"><Icon name="alert" size={28} /></div><h1>Relay offline</h1><p className="muted">{cfgErr}</p></Center>;
  if (!cfg) return <Center><span className="spin lg" /></Center>;

  if (owner && accounts === null) return <Center><span className="spin lg" /></Center>;
  if (!owner || accounts === null || accounts.length === 0) {
    return (
      <>
        <Onboarding cfg={cfg} owner={owner} loading={!!owner && accounts === null} busy={busy} onDev={connectDev} onBrowser={connectBrowser} onCreate={createAccount} />
        <Toasts toasts={toasts} />
      </>
    );
  }

  const held = ops.filter((o) => o.status === "held");
  const nav = { page, go, held: held.length };
  const p = { cfg, info, ops, prices, busy, held, account: account!, go, decide, onNew: () => setShowNew(true), onKill: () => setShowKill(true), agentTx, faucet };

  return (
    <div className="layout">
      <Sidebar {...nav} cfg={cfg} owner={owner} accounts={accounts} account={account} setAccount={setAccount} />
      <main className="main">
        <TopBar page={page} cfg={cfg} owner={owner} />
        {!info ? <Skeleton /> : (
          <>
            {page === "home" && <HomePage {...p} info={info} />}
            {page === "agents" && <AgentsPage {...p} info={info} />}
            {page === "activity" && <ActivityPage {...p} />}
            {page === "settings" && <SettingsPage cfg={cfg} info={info} owner={owner} theme={theme} setTheme={setTheme} busy={busy} onCreate={createAccount} />}
          </>
        )}
      </main>
      <TabBar {...nav} />
      {busy && !busy.startsWith("decide") && <div className="busy"><span className="spin" />{busy}…</div>}
      {showNew && <NewAgent cfg={cfg} busy={busy} onClose={() => setShowNew(false)} onSubmit={grant} />}
      {created && <ConnectModal c={created} cfg={cfg} onClose={() => { setCreated(null); go("agents"); }} />}
      {showKill && info && <KillModal agents={info.agents.filter((a) => a.exists && !a.killed)} busy={busy} onClose={() => setShowKill(false)} onConfirm={killAll} />}
      <Toasts toasts={toasts} />
    </div>
  );
}

// ======================================================= shell
function Center({ children }: { children: React.ReactNode }) {
  return <div className="center"><div className="center-in">{children}</div></div>;
}

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "activity", label: "Activity", icon: "activity" },
  { id: "settings", label: "Settings", icon: "settings" },
];

function Sidebar({ page, go, held, cfg, owner, accounts, account, setAccount }: {
  page: Page; go: (p: Page) => void; held: number; cfg: Config; owner: Owner; accounts: Address[]; account: Address | null; setAccount: (a: Address) => void;
}) {
  return (
    <aside className="side">
      <div className="brand"><Logo /> <span>Killswitch</span></div>
      <div className="acct-switch">
        <div className="eyebrow">Protected wallet</div>
        {accounts.length > 1 ? (
          <select value={account ?? ""} onChange={(e) => setAccount(e.target.value as Address)}>
            {accounts.map((a, i) => <option key={a} value={a}>Wallet {i + 1} · {short(a)}</option>)}
          </select>
        ) : <div className="mono">{short(account ?? "")}</div>}
      </div>
      <nav>
        {NAV.map((n) => (
          <button key={n.id} className={`navi ${page === n.id ? "on" : ""}`} onClick={() => go(n.id)}>
            <Icon name={n.icon} /> {n.label}
            {n.id === "activity" && held > 0 && <span className="badge">{held}</span>}
          </button>
        ))}
      </nav>
      <div className="side-foot">
        <div className="netpill"><span className="dot on" />{chainOf(cfg).name}</div>
        <div className="muted small">Owner · {owner.kind === "dev" ? "dev wallet" : "your wallet"}<br /><span className="mono">{short(owner.address)}</span></div>
      </div>
    </aside>
  );
}

function TabBar({ page, go, held }: { page: Page; go: (p: Page) => void; held: number }) {
  return (
    <nav className="tabbar">
      {NAV.map((n) => (
        <button key={n.id} className={page === n.id ? "on" : ""} onClick={() => go(n.id)}>
          <span className="tb-ic"><Icon name={n.icon} size={20} />{n.id === "activity" && held > 0 && <span className="badge dot-badge">{held}</span>}</span>
          {n.label}
        </button>
      ))}
    </nav>
  );
}

function TopBar({ page, cfg, owner }: { page: Page; cfg: Config; owner: Owner }) {
  const title = { home: "Home", agents: "Agents", activity: "Activity", settings: "Settings" }[page];
  return (
    <div className="topbar">
      <div className="mobile-brand"><Logo size={22} /></div>
      <h1>{title}</h1>
      <div className="topbar-r">
        <span className="netpill sm"><span className="dot on" />{chainOf(cfg).name}</span>
        <span className="who mono">{short(owner.address)}</span>
      </div>
    </div>
  );
}

function Skeleton() {
  return <div className="stack"><div className="sk h120" /><div className="row3"><div className="sk h100" /><div className="sk h100" /><div className="sk h100" /></div><div className="sk h200" /></div>;
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.level}`}>
          <Icon name={t.level === "critical" ? "power" : t.level === "warn" ? "alert" : "check"} size={16} />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// ======================================================= onboarding
function Onboarding({ cfg, owner, loading, busy, onDev, onBrowser, onCreate }: {
  cfg: Config; owner: Owner | null; loading: boolean; busy: string | null; onDev: () => void; onBrowser: () => void; onCreate: () => void;
}) {
  const step = !owner ? 1 : 2;
  return (
    <div className="onb">
      <div className="onb-l">
        <div className="brand"><Logo /> <span>Killswitch</span></div>
        <h1 className="display">Let AI use your money.<br /><span className="accent">Never lose control of it.</span></h1>
        <p className="lead">Give any AI agent a wallet with hard limits. The blockchain enforces them, a guardian watches every move, and one tap stops everything.</p>
        <ul className="ticks">
          <li><Icon name="lock" size={16} /> Your keys stay yours. Agents get their own limited key.</li>
          <li><Icon name="shield" size={16} /> Daily caps the agent can't exceed, even if it's hacked.</li>
          <li><Icon name="power" size={16} /> One button to stop every agent at once.</li>
        </ul>
      </div>
      <div className="onb-r">
        <div className="card onb-card">
          <Steps n={step} labels={["Connect wallet", "Create protected wallet", "Add your first agent"]} />
          {step === 1 && (
            <>
              <h2>Connect your wallet</h2>
              <p className="muted">Your existing wallet becomes the master key. Only it can change limits, approve payments or stop agents.</p>
              <div className="stack sm">
                <button className="primary lg" onClick={onBrowser}><Icon name="wallet" /> Connect browser wallet</button>
                {cfg.chainId === 31337 && <button className="lg" onClick={onDev}><Icon name="terminal" /> Use the local test wallet</button>}
              </div>
              <p className="muted small">Works with MetaMask, Coinbase Wallet, Rabby and other browser wallets.</p>
            </>
          )}
          {step === 2 && (
            loading ? <div className="center-in"><span className="spin lg" /></div> : (
              <>
                <h2>Create your protected wallet</h2>
                <p className="muted">A smart wallet owned by <span className="mono">{short(owner!.address)}</span>. You move in only what your agents should be able to use.</p>
                <div className="explain">
                  <div><Icon name="wallet" /><b>Your wallet</b><span>Master key. Stays where it is.</span></div>
                  <Icon name="chevron" className="muted" />
                  <div><Icon name="shieldok" /><b>Protected wallet</b><span>Holds agent funds, enforces limits.</span></div>
                  <Icon name="chevron" className="muted" />
                  <div><Icon name="bot" /><b>AI agents</b><span>Act only inside your rules.</span></div>
                </div>
                <button className="primary lg full" disabled={!!busy} onClick={onCreate}>{busy ? <><span className="spin" /> {busy}…</> : "Create protected wallet"}</button>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function Steps({ n, labels }: { n: number; labels: string[] }) {
  return (
    <ol className="steps">
      {labels.map((l, i) => (
        <li key={l} className={i + 1 < n ? "done" : i + 1 === n ? "on" : ""}>
          <span className="stepn">{i + 1 < n ? <Icon name="check" size={13} /> : i + 1}</span><span className="stepl">{l}</span>
        </li>
      ))}
    </ol>
  );
}

// ======================================================= pages
type PageProps = {
  cfg: Config; info: AccountInfo | null; ops: Op[]; prices: Prices; busy: string | null; held: Op[]; account: Address;
  go: (p: Page) => void; decide: (o: Op, ok: boolean) => void; onNew: () => void; onKill: () => void;
  agentTx: (fn: "pause" | "unpause" | "revoke", a: Agent) => void; faucet: () => void;
};

function HomePage({ cfg, info, ops, prices, busy, held, go, decide, onNew, onKill, faucet }: PageProps & { info: AccountInfo }) {
  const agents = info.agents.filter((a) => a.exists && !a.killed);
  const active = agents.filter((a) => a.active);
  const paused = agents.filter((a) => a.paused);
  const killedAll = info.agents.some((a) => a.killed) && agents.length === 0;
  const total = balanceUsd(cfg, info.balances, prices);
  const exposure = exposureUsd(cfg, info.agents, info.balances, prices);
  const pct = total > 0 ? Math.min(100, (exposure / total) * 100) : 0;
  const funded = total > 0;
  const setupDone = funded && info.agents.length > 0 && ops.length > 0;

  let tone = "ok", headline = "Everything is safe", sub = active.length ? `${plural(active.length, "agent")} working inside your limits. The guardian is watching.` : "No agents are running right now.";
  if (held.length) { tone = "warn"; headline = `${plural(held.length, "payment")} waiting for you`; sub = "An agent tried something unusual. Nothing moves until you decide."; }
  else if (killedAll) { tone = "bad"; headline = "All agents stopped"; sub = "You used the kill switch. Add a new agent to start again."; }
  else if (paused.length) { tone = "warn"; headline = `${plural(paused.length, "agent")} paused`; sub = "The guardian paused an agent after suspicious activity. Review it on the Agents page."; }

  return (
    <div className="stack">
      <section className={`status ${tone}`}>
        <div className="status-ic"><Icon name={tone === "ok" ? "shieldok" : tone === "warn" ? "alert" : "power"} size={22} /></div>
        <div className="status-t"><b>{headline}</b><span>{sub}</span></div>
        {held.length > 0 && <button className="sm" onClick={() => document.getElementById("approvals")?.scrollIntoView({ behavior: "smooth" })}>Review</button>}
        {!held.length && paused.length > 0 && <button className="sm" onClick={() => go("agents")}>Review</button>}
      </section>

      {!setupDone && (
        <section className="card checklist">
          <div className="sec-h"><h2>Get started</h2><span className="muted small">{[funded, info.agents.length > 0, ops.length > 0].filter(Boolean).length} of 3 done</span></div>
          <ChecklistItem done={funded} title="Add funds" text="Move in only what your agents should be able to use.">
            {cfg.chainId !== 8453 && <button className="sm" disabled={!!busy} onClick={faucet}>Add 1,000 test USDC</button>}
          </ChecklistItem>
          <ChecklistItem done={info.agents.length > 0} title="Add your first agent" text="Pick what it may do and how much it may spend.">
            <button className="sm primary" disabled={!!busy || !funded} onClick={onNew}>Add agent</button>
          </ChecklistItem>
          <ChecklistItem done={ops.length > 0} title="Connect your AI" text="Paste one command into Claude, or use the SDK. Its first action shows up here." />
        </section>
      )}

      <section className="row3">
        <div className="card stat">
          <div className="eyebrow">Balance</div>
          <div className="big">{usd(total)}</div>
          <div className="tokens">
            {Object.entries(info.balances).filter(([, raw]) => BigInt(raw) > 0n).map(([sym, raw]) => (
              <span key={sym} className="tok"><TokenDot sym={sym} />{num(toNum(raw, decOf(cfg, sym)), sym === "USDC" ? 2 : 4)} {sym}</span>
            ))}
            {!funded && <span className="muted small">Empty</span>}
          </div>
          {cfg.chainId !== 8453 && funded && <button className="link" disabled={!!busy} onClick={faucet}><Icon name="plus" size={14} /> Add test USDC</button>}
        </div>
        <div className="card stat">
          <div className="eyebrow">Max your agents can spend today</div>
          <div className="big">{usd(exposure)}</div>
          <div className="meter"><div style={{ width: `${pct}%` }} /></div>
          <div className="muted small">{funded ? `${pct.toFixed(0)}% of your balance. Even a hacked agent can't go past it.` : "Add funds to see your exposure."}</div>
        </div>
        <div className="card stat killcard">
          <div className="eyebrow">Emergency stop</div>
          <button className="killbtn" disabled={!!busy || agents.length === 0} onClick={onKill}><Icon name="power" size={20} /> Stop all agents</button>
          <div className="muted small">{agents.length ? `Cuts off ${plural(agents.length, "agent")} at once, with one signature.` : "No agents to stop."}</div>
        </div>
      </section>

      {held.length > 0 && (
        <section id="approvals" className="stack sm">
          <div className="sec-h"><h2>Needs your approval</h2></div>
          {held.map((o) => <Approval key={o.id} op={o} cfg={cfg} busy={busy} onDecide={decide} paused={isPaused(info, o)} />)}
        </section>
      )}

      <section className="two-col">
        <div className="stack sm">
          <div className="sec-h"><h2>Agents</h2><button className="link" onClick={() => go("agents")}>See all <Icon name="chevron" size={14} /></button></div>
          {agents.length === 0 && <Empty icon="bot" title={info.agents.length ? "No active agents" : "No agents yet"} text="Give an AI a narrow, capped permission instead of your keys."><button className="primary sm" disabled={!!busy || !funded} onClick={onNew}><Icon name="plus" size={15} /> Add agent</button></Empty>}
          {agents.slice().reverse().slice(0, 4).map((a) => <AgentMini key={a.id} a={a} onClick={() => go("agents")} />)}
        </div>
        <div className="stack sm">
          <div className="sec-h"><h2>Recent activity</h2><button className="link" onClick={() => go("activity")}>See all <Icon name="chevron" size={14} /></button></div>
          {ops.filter((o) => o.status !== "held").length === 0 && <Empty icon="activity" title="Nothing yet" text="Everything your agents try appears here, live." />}
          <div className="list">{ops.filter((o) => o.status !== "held").slice(0, 6).map((o) => <OpItem key={o.id} op={o} cfg={cfg} compact />)}</div>
        </div>
      </section>
    </div>
  );
}

function ChecklistItem({ done, title, text, children }: { done: boolean; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className={`cl ${done ? "done" : ""}`}>
      <span className="cl-ic">{done ? <Icon name="check" size={14} /> : null}</span>
      <div className="cl-t"><b>{title}</b><span>{text}</span></div>
      {!done && children}
    </div>
  );
}

function AgentsPage({ cfg, info, busy, onNew, agentTx }: PageProps & { info: AccountInfo }) {
  const [showOld, setShowOld] = useState(false);
  const live = info.agents.filter((a) => a.exists && !a.killed).reverse();
  const old = info.agents.filter((a) => !a.exists || a.killed).reverse();
  return (
    <div className="stack">
      <div className="sec-h">
        <p className="muted">Each agent has its own key and can only do what you allowed. You can pause or remove it any time.</p>
        <button className="primary" disabled={!!busy} onClick={onNew}><Icon name="plus" size={16} /> Add agent</button>
      </div>
      {live.length === 0 && <Empty icon="bot" title="No active agents" text="Add one from a template: trading, auto-buy, payments or pay-per-use." />}
      <div className="agent-grid">{live.map((a) => <AgentCard key={a.id} a={a} cfg={cfg} busy={busy} agentTx={agentTx} />)}</div>
      {old.length > 0 && (
        <div className="stack sm">
          <button className="link" onClick={() => setShowOld(!showOld)}><Icon name={showOld ? "down" : "chevron"} size={14} /> {plural(old.length, "removed or stopped agent")}</button>
          {showOld && <div className="list">{old.map((a) => <AgentMini key={a.id} a={a} />)}</div>}
        </div>
      )}
    </div>
  );
}

const FILTERS: { id: string; label: string; match: (o: Op) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "held", label: "Needs you", match: (o) => o.status === "held" },
  { id: "stopped", label: "Blocked", match: (o) => ["blocked", "rejected", "denied", "failed"].includes(o.status) || o.source === "bypass" },
  { id: "done", label: "Completed", match: (o) => o.status === "confirmed" && o.source !== "bypass" },
];

function ActivityPage({ cfg, info, ops, busy, decide }: PageProps) {
  const [f, setF] = useState("all");
  const filter = FILTERS.find((x) => x.id === f)!;
  const shown = ops.filter(filter.match);
  return (
    <div className="stack">
      <div className="chips-row">
        {FILTERS.map((x) => {
          const n = ops.filter(x.match).length;
          return <button key={x.id} className={`fchip ${f === x.id ? "on" : ""}`} onClick={() => setF(x.id)}>{x.label}{x.id !== "all" && n > 0 && <span className="fcount">{n}</span>}</button>;
        })}
      </div>
      {shown.length === 0 && <Empty icon="activity" title="Nothing here" text={f === "all" ? "Everything your agents try appears here, live." : "No activity matches this filter."} />}
      <div className="list">
        {shown.map((o) => o.status === "held" ? <Approval key={o.id} op={o} cfg={cfg} busy={busy} onDecide={decide} paused={isPaused(info, o)} /> : <OpItem key={o.id} op={o} cfg={cfg} />)}
      </div>
    </div>
  );
}

function SettingsPage({ cfg, info, owner, theme, setTheme, busy, onCreate }: {
  cfg: Config; info: AccountInfo; owner: Owner; theme: Theme; setTheme: (t: Theme) => void; busy: string | null; onCreate: () => void;
}) {
  return (
    <div className="stack settings">
      <section className="card">
        <h2>Wallets</h2>
        <Row k="Protected wallet" v={info.address} copy />
        <Row k="Owner (master key)" v={owner.address} copy note={owner.kind === "dev" ? "Local test wallet" : "Your browser wallet"} />
        <Row k="Network" v={chainOf(cfg).name} />
        <div className="row-end"><button className="sm" disabled={!!busy} onClick={onCreate}><Icon name="plus" size={14} /> Create another protected wallet</button></div>
      </section>
      <section className="card">
        <h2>Guardian</h2>
        <p className="muted">The guardian checks every agent action before it happens{cfg.llm ? " (rules, simulation and AI review)" : " (rules and simulation)"}. It can <b>pause</b> an agent or add an <b>extra check</b> on big payments. It can never spend your money or raise a limit.</p>
        <Row k="Guardian address" v={info.guardian} copy />
        <Row k="AI review" v={cfg.llm ? "On" : "Off: unusual payments are held for you instead"} />
      </section>
      <section className="card">
        <h2>Appearance</h2>
        <div className="seg">
          {(["system", "light", "dark"] as Theme[]).map((t) => (
            <button key={t} className={theme === t ? "on" : ""} onClick={() => setTheme(t)}>
              <Icon name={t === "light" ? "sun" : t === "dark" ? "moon" : "monitor"} size={15} /> {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>How you're protected</h2>
        <div className="layers">
          <div><span className="ln">1</span><b>On-chain limits</b><span>Caps, allowed apps and expiry live in the wallet contract. Nobody can bypass them, not even us.</span></div>
          <div><span className="ln">2</span><b>Guardian</b><span>Checks every action, holds unusual ones for you and pauses agents that misbehave.</span></div>
          <div><span className="ln">3</span><b>Kill switch</b><span>One signature voids every agent's access at once.</span></div>
        </div>
      </section>
    </div>
  );
}

function Row({ k, v, copy, note }: { k: string; v: string; copy?: boolean; note?: string }) {
  const [c, setC] = useState(false);
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v"><span className={v.startsWith("0x") ? "mono" : ""}>{v.startsWith("0x") ? short(v) : v}</span>{note && <span className="muted small"> · {note}</span>}
        {copy && <button className="icon-btn" aria-label={`Copy ${k}`} onClick={() => { navigator.clipboard.writeText(v); setC(true); setTimeout(() => setC(false), 1200); }}><Icon name={c ? "check" : "copy"} size={14} /></button>}
      </span>
    </div>
  );
}

function Empty({ icon, title, text, children }: { icon: string; title: string; text: string; children?: React.ReactNode }) {
  return <div className="card empty"><div className="empty-ic"><Icon name={icon} size={22} /></div><b>{title}</b><span className="muted">{text}</span>{children}</div>;
}

function TokenDot({ sym }: { sym: string }) {
  return <span className={`tdot t-${sym.toLowerCase()}`}>{sym[0]}</span>;
}

// ======================================================= agents
function agentStatus(a: Agent): [string, string] {
  if (!a.exists) return ["Removed", "off"];
  if (a.killed) return ["Stopped", "bad"];
  if (a.paused) return ["Paused", "warn"];
  if (a.expired) return ["Expired", "off"];
  return ["Active", "ok"];
}
const kindIcon = (a: Agent) => tpl(agentKind(a) as TemplateId).icon;

function AgentMini({ a, onClick }: { a: Agent; onClick?: () => void }) {
  const [label, cls] = agentStatus(a);
  const l = a.limits[0];
  const pct = l && Number(l.maxPerPeriod) ? Math.min(100, (Number(l.used) / Number(l.maxPerPeriod)) * 100) : 0;
  return (
    <button className={`card mini ${a.exists && !a.killed ? "" : "dim"}`} onClick={onClick} disabled={!onClick}>
      <span className={`av ${cls}`}><Icon name={kindIcon(a)} size={17} /></span>
      <span className="mini-t">
        <b>{a.label}</b>
        {l && a.exists ? <span className="muted small">{num(toNum(l.used, l.decimals), 2)} of {num(toNum(l.maxPerPeriod, l.decimals), 2)} {l.symbol} today</span> : <span className="muted small">{label}</span>}
        {l && a.exists && !a.killed && <span className="thin"><span style={{ width: `${pct}%` }} className={pct > 80 ? "hot" : ""} /></span>}
      </span>
      <span className={`pill ${cls}`}>{label}</span>
    </button>
  );
}

function AgentCard({ a, cfg, busy, agentTx }: { a: Agent; cfg: Config; busy: string | null; agentTx: PageProps["agentTx"] }) {
  const [label, cls] = agentStatus(a);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className={`card agent ${cls}`}>
      <div className="agent-h">
        <span className={`av lg ${cls}`}><Icon name={kindIcon(a)} size={20} /></span>
        <div className="agent-t">
          <b>{a.label}</b>
          <span className="muted small">{tpl(agentKind(a) as TemplateId).title} · {a.expired ? "expired" : `expires in ${until(a.validUntil)}`}</span>
        </div>
        <span className={`pill ${cls}`}>{label}</span>
      </div>

      {a.limits.map((l) => {
        const used = toNum(l.used, l.decimals), max = toNum(l.maxPerPeriod, l.decimals), cos = toNum(l.cosignAbove, l.decimals);
        const pct = max ? Math.min(100, (used / max) * 100) : 0;
        return (
          <div key={l.token} className="cap">
            <div className="cap-t"><span>{l.symbol} spent today</span><span><b>{num(used, 4)}</b> <span className="muted">/ {num(max, 4)}</span></span></div>
            <div className="bar"><div className={`fill ${pct > 80 ? "hot" : ""}`} style={{ width: `${pct}%` }} />{cos < max && <div className="cosline" style={{ left: `${(cos / max) * 100}%` }} title="Extra guardian check above this amount" />}</div>
            <div className="muted small">{cos < max ? `Single payments over ${num(cos, 4)} ${l.symbol} get an extra guardian check · ` : ""}resets in {until(l.resetsAt)}</div>
          </div>
        );
      })}

      <div className="perm">
        <div className="eyebrow">Allowed</div>
        {a.rules.filter((r) => !(r.name.endsWith(".approve") && a.rules.some((x) => x.name === "DEX.swap"))).map((r) => (
          <div key={r.name} className="perm-i"><Icon name="check" size={14} className="tx-ok" />{ruleText(r.name)}</div>
        ))}
        <div className="perm-i muted"><Icon name="x" size={14} className="tx-bad" />Everything else</div>
      </div>

      <div className="agent-f">
        <span className="mono muted small" title={a.sessionKey}>key {short(a.sessionKey)}</span>
        <span className="actions">
          {a.paused
            ? <button className="sm" disabled={!!busy || a.killed} onClick={() => agentTx("unpause", a)}><Icon name="play" size={14} /> Resume</button>
            : <button className="sm ghost" disabled={!!busy || a.killed} onClick={() => agentTx("pause", a)}><Icon name="pause" size={14} /> Pause</button>}
          {confirm
            ? <button className="sm danger-solid" disabled={!!busy} onClick={() => { setConfirm(false); agentTx("revoke", a); }}>Confirm remove</button>
            : <button className="sm ghost danger" disabled={!!busy} onClick={() => { setConfirm(true); setTimeout(() => setConfirm(false), 4000); }}><Icon name="trash" size={14} /> Remove</button>}
        </span>
      </div>
    </div>
  );
}

// ======================================================= activity
const OP_STATUS: Record<string, [string, string, string]> = {
  confirmed: ["Done", "ok", "check"],
  held: ["Needs approval", "warn", "alert"],
  blocked: ["Blocked", "bad", "x"],
  rejected: ["Stopped · agent paused", "bad", "power"],
  failed: ["Not sent", "bad", "x"],
  denied: ["Denied by you", "off", "x"],
  pending: ["Checking…", "off", "clock"],
};

function OpItem({ op, cfg, compact }: { op: Op; cfg: Config; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const bypass = op.source === "bypass";
  let [txt, cls] = OP_STATUS[op.status] ?? [op.status, "off", "zap"];
  if (bypass) { txt = op.verdict === "reject" ? "Bypass · agent paused" : "Outside Killswitch"; cls = op.verdict === "reject" ? "bad" : "warn"; }
  const hasMore = op.reasons.length > 0 || !!op.llm || !!op.error || !!op.tx_hash || op.cosigned > 0 || !!op.intent;
  return (
    <div className={`item ${cls} ${open ? "open" : ""}`}>
      <button className="item-h" onClick={() => hasMore && setOpen(!open)} aria-expanded={open}>
        <span className={`av sm ${cls}`}><Icon name={opKind(op)} size={15} /></span>
        <span className="item-t">
          <b>{humanSummary(cfg, op.summary)}</b>
          <span className="muted small">{op.label} · {ago(op.created_at)}{!compact && op.llm ? " · AI reviewed" : ""}</span>
        </span>
        <span className={`pill ${cls}`}>{txt}</span>
        {hasMore && !compact && <Icon name="down" size={16} className="chev muted" />}
      </button>
      {open && <OpDetails op={op} />}
    </div>
  );
}

function OpDetails({ op }: { op: Op }) {
  return (
    <div className="item-d">
      {op.intent && <div className="quote"><span className="eyebrow">Agent said</span>“{op.intent}”</div>}
      {(op.reasons.length > 0 || op.cosigned > 0) && (
        <div><span className="eyebrow">Guardian</span>
          <ul className="reasons">
            {op.cosigned > 0 && <li>Extra check passed (above the co-sign amount)</li>}
            {op.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
      {op.llm && (
        <div className="ai">
          <div className="ai-h"><Icon name="sparkle" size={14} /> AI review: <b className={op.llm.verdict}>{op.llm.verdict}</b> <span className="muted small">{Math.round(op.llm.confidence * 100)}% sure · {(op.llm.ms / 1000).toFixed(1)}s</span></div>
          <ul>{op.llm.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
      {op.error && <div className="err"><Icon name="x" size={14} /> {op.error}</div>}
      {op.tx_hash && <div className="muted small">Transaction <span className="mono">{short(op.tx_hash)}</span></div>}
    </div>
  );
}

const isPaused = (info: AccountInfo | null, o: Op) => !!info?.agents.find((a) => a.id.toLowerCase() === o.agent_id.toLowerCase())?.paused;

function Approval({ op, cfg, busy, onDecide, paused }: { op: Op; cfg: Config; busy: string | null; onDecide: (o: Op, ok: boolean) => void; paused?: boolean }) {
  const deciding = busy === `decide-${op.id}`;
  return (
    <div className="card approval">
      <div className="appr-h">
        <span className="av warn"><Icon name={opKind(op)} size={18} /></span>
        <div className="appr-t">
          <span className="muted small">{op.label} wants to</span>
          <b>{humanSummary(cfg, op.summary)}</b>
        </div>
        <span className="muted small">{ago(op.created_at)}</span>
      </div>
      <div className="flags">{op.reasons.map((r, i) => <span key={i} className="flag"><Icon name="alert" size={13} />{r}</span>)}</div>
      <OpDetails op={{ ...op, reasons: [] }} />
      <div className="appr-f">
        <span className="muted small">{paused ? "This agent is paused. Resume it on the Agents page to approve, or deny now." : "Nothing has moved. Your signature decides."}</span>
        <span className="actions">
          <button disabled={!!busy} onClick={() => onDecide(op, false)}><Icon name="x" size={15} /> Deny</button>
          <button className="primary" disabled={!!busy || paused} onClick={() => onDecide(op, true)}>{deciding ? <span className="spin" /> : <Icon name="check" size={15} />} Approve</button>
        </span>
      </div>
    </div>
  );
}

// ======================================================= modals
function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose?: () => void; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal" onClick={onClose}>
      <div className={`sheet ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {onClose && <button className="icon-btn close" aria-label="Close" onClick={onClose}><Icon name="x" /></button>}
        {children}
      </div>
    </div>
  );
}

type GrantForm = { label: string; template: TemplateId; cap: string; cosign: string; wethCap: string; days: string };
const DAYS = [["1", "1 day"], ["7", "1 week"], ["30", "1 month"], ["90", "3 months"]];

function NewAgent({ cfg, busy, onClose, onSubmit }: { cfg: Config; busy: string | null; onClose: () => void; onSubmit: (f: GrantForm) => void }) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState<GrantForm>({ label: "", template: "trader", cap: "", cosign: "", wethCap: "", days: "7" });
  const t = tpl(f.template);
  const pick = (id: TemplateId) => {
    const x = tpl(id);
    setF({ ...f, template: id, label: x.label, cap: x.cap, cosign: x.cosign, wethCap: x.wethCap ?? "" });
    setStep(2);
  };
  const valid = !!f.label.trim() && Number(f.cap) > 0 && Number(f.cosign) >= 0 && Number(f.days) > 0 && (f.template !== "trader" || Number(f.wethCap) >= 0);
  return (
    <Modal onClose={onClose} wide>
      <Steps n={step} labels={["What it does", "Limits", "Review"]} />
      {step === 1 && (
        <>
          <h2>What should this agent do?</h2>
          <p className="muted">Pick a starting point. You'll set the limits next.</p>
          <div className="tpls">
            {TEMPLATES.map((x) => (
              <button key={x.id} className="tplc" onClick={() => pick(x.id)}>
                <span className="av"><Icon name={x.icon} size={18} /></span>
                <b>{x.title}</b><span className="muted small">{x.blurb}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <h2>Set the limits</h2>
          <p className="muted">The wallet contract enforces these. The agent can't change them.</p>
          <label className="field"><span>Name</span><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} maxLength={40} autoFocus /></label>
          <div className="field"><span>{f.template === "dca" ? "Most it can spend on buys per day" : "Most it can spend per day"}</span>
            <div className="presets">
              {t.caps.map((c) => <button key={c} className={`pre ${f.cap === c ? "on" : ""}`} onClick={() => setF({ ...f, cap: c, cosign: String(Math.min(Number(f.cosign || c), Number(c))) })}>${c}</button>)}
              <div className="pre-in"><span>$</span><input value={f.cap} onChange={(e) => setF({ ...f, cap: e.target.value })} inputMode="decimal" aria-label="Custom daily cap in USDC" /><span className="muted">USDC</span></div>
            </div>
          </div>
          <label className="field"><span>Extra guardian check for single payments over</span>
            <div className="pre-in wide"><span>$</span><input value={f.cosign} onChange={(e) => setF({ ...f, cosign: e.target.value })} inputMode="decimal" /><span className="muted">USDC</span></div>
          </label>
          {f.template === "trader" && (
            <label className="field"><span>Most WETH it can sell per day</span>
              <div className="pre-in wide"><input value={f.wethCap} onChange={(e) => setF({ ...f, wethCap: e.target.value })} inputMode="decimal" /><span className="muted">WETH</span></div>
            </label>
          )}
          <div className="field"><span>Access ends after</span>
            <div className="seg">{DAYS.map(([d, l]) => <button key={d} className={f.days === d ? "on" : ""} onClick={() => setF({ ...f, days: d })}>{l}</button>)}</div>
          </div>
          <div className="sheet-f">
            <button className="ghost" onClick={() => setStep(1)}>Back</button>
            <button className="primary" disabled={!valid} onClick={() => setStep(3)}>Review</button>
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <h2>Review “{f.label}”</h2>
          <div className="review">
            <div className="rv can">
              <div className="eyebrow">It can</div>
              {t.can.map((c) => <div key={c}><Icon name="check" size={15} />{c}</div>)}
              <div><Icon name="check" size={15} /><span>Spend up to <b>${f.cap} USDC</b> a day{f.template === "trader" ? <> and sell up to <b>{f.wethCap} WETH</b></> : null}</span></div>
              <div><Icon name="check" size={15} /><span>Keep working for <b>{DAYS.find((d) => d[0] === f.days)?.[1]}</b></span></div>
            </div>
            <div className="rv cant">
              <div className="eyebrow">It can't</div>
              {t.cant.map((c) => <div key={c}><Icon name="x" size={15} />{c}</div>)}
              <div><Icon name="x" size={15} />Go over the daily limit, even if hacked</div>
              <div><Icon name="x" size={15} />Change its own limits or touch your master key</div>
            </div>
          </div>
          <div className="note"><Icon name="shield" size={15} /> Single payments over ${f.cosign} get an extra guardian check. Unusual ones wait for your approval.</div>
          <div className="sheet-f">
            <button className="ghost" onClick={() => setStep(2)}>Back</button>
            <button className="primary" disabled={!!busy} onClick={() => onSubmit(f)}>{busy ? <><span className="spin" /> Waiting for signature…</> : "Sign & create agent"}</button>
          </div>
          <p className="muted small center-t">You'll sign once with your wallet on {chainOf(cfg).name}.</p>
        </>
      )}
    </Modal>
  );
}

function ConnectModal({ c, cfg, onClose }: { c: Created; cfg: Config; onClose: () => void }) {
  const [tab, setTab] = useState<"code" | "desktop" | "sdk">("code");
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState("");
  const local = ["localhost", "127.0.0.1"].includes(location.hostname) && location.port === "5175";
  const relay = local ? `${location.protocol}//${location.hostname}:8787` : location.origin;
  const hosted = !!(cfg as any).hosted;
  const root = hosted ? "~/killswitch" : (cfg as any).root ?? "/path/to/killswitch";
  const key = reveal ? c.key : `${c.key.slice(0, 6)}${"•".repeat(20)}${c.key.slice(-4)}`;
  const envPairs = [["KS_RELAY", relay], ["KS_ACCOUNT", c.account], ["KS_AGENT_ID", c.agentId], ["KS_SESSION_KEY", c.key]] as const;
  const snippets = {
    code: (k: string) => `claude mcp add killswitch-wallet \\\n${envPairs.map(([n, v]) => `  -e ${n}=${n === "KS_SESSION_KEY" ? k : v} \\`).join("\n")}\n  -- npx --prefix ${root} tsx ${root}/packages/mcp/server.ts`,
    desktop: (k: string) => JSON.stringify({ mcpServers: { "killswitch-wallet": { command: "npx", args: ["--prefix", root, "tsx", `${root}/packages/mcp/server.ts`], env: Object.fromEntries(envPairs.map(([n, v]) => [n, n === "KS_SESSION_KEY" ? k : v])) } } }, null, 2),
    sdk: (k: string) => envPairs.map(([n, v]) => `${n}=${n === "KS_SESSION_KEY" ? k : v}`).join("\n"),
  };
  const help = {
    code: "Run this in your terminal. Then ask Claude: “check my wallet” or “swap 10 USDC to ETH”.",
    desktop: "Paste into Claude Desktop → Settings → Developer → Edit config, then restart Claude.",
    sdk: "Put these in your agent's environment and use createKillswitchAgent() from packages/sdk.",
  };
  const copy = () => { navigator.clipboard.writeText(snippets[tab](c.key)); setCopied(tab); setTimeout(() => setCopied(""), 1500); };
  return (
    <Modal wide>
      <div className="done-h"><span className="av ok lg"><Icon name="check" size={20} /></span><div><h2>“{c.label}” is ready</h2><p className="muted">Now connect it to your AI.</p></div></div>
      <div className="seg tabs">
        <button className={tab === "code" ? "on" : ""} onClick={() => setTab("code")}><Icon name="terminal" size={15} /> Claude Code</button>
        <button className={tab === "desktop" ? "on" : ""} onClick={() => setTab("desktop")}><Icon name="monitor" size={15} /> Claude Desktop</button>
        <button className={tab === "sdk" ? "on" : ""} onClick={() => setTab("sdk")}><Icon name="code" size={15} /> SDK</button>
      </div>
      {hosted && tab !== "sdk" && <p className="muted small">First, once: <code>git clone https://github.com/savor3/killswitch ~/killswitch &amp;&amp; cd ~/killswitch &amp;&amp; npm install</code></p>}
      <p className="muted small">{help[tab]}</p>
      <div className="code">
        <div className="code-h">
          <button className="icon-btn" onClick={() => setReveal(!reveal)}><Icon name="eye" size={14} /> {reveal ? "Hide key" : "Show key"}</button>
          <button className="icon-btn" onClick={copy}><Icon name={copied === tab ? "check" : "copy"} size={14} /> {copied === tab ? "Copied" : "Copy"}</button>
        </div>
        <pre>{snippets[tab](key)}</pre>
      </div>
      <div className="note warn"><Icon name="lock" size={15} /> The agent key is shown only once. It can only act inside the limits you set, but keep it private. Lost it? Remove the agent and add a new one.</div>
      <div className="sheet-f"><span /><button className="primary" onClick={onClose}>Done</button></div>
    </Modal>
  );
}

function KillModal({ agents, busy, onClose, onConfirm }: { agents: Agent[]; busy: string | null; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal onClose={busy ? undefined : onClose}>
      <div className="kill-h"><span className="av bad lg"><Icon name="power" size={22} /></span><h2>Stop all agents?</h2></div>
      <p className="muted">Every agent loses access immediately, in one signature. Your funds stay in your protected wallet, and only you can move them.</p>
      <div className="list">{agents.map((a) => <div key={a.id} className="kill-i"><Icon name={kindIcon(a)} size={15} />{a.label}<span className="muted small">will stop</span></div>)}</div>
      <p className="muted small">This can't be undone for these agents. You can add new ones afterwards.</p>
      <div className="sheet-f">
        <button className="ghost" disabled={!!busy} onClick={onClose}>Cancel</button>
        <button className="danger-solid" disabled={!!busy} onClick={onConfirm}>{busy ? <><span className="spin" /> Stopping…</> : <><Icon name="power" size={15} /> Stop all agents now</>}</button>
      </div>
    </Modal>
  );
}
