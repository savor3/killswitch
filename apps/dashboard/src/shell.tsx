// The frame: the side rail (logo, wallet, sections, live state), the top bar (page name, network, the bell and
// its notification history), the phone tabs, and the two screens before the app (starting, relay offline).
import { useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import type { Alert, Page, Panel } from "./App";
import { Blocks } from "./blocks";
import { Logo } from "./brand";
import { Btn, Px, Sq, St, useDismiss, useNow, type Tone } from "./kit";
import { ago, chainOf, short, type Config, type Owner } from "./lib";
import { Icon } from "./ui";

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "activity", label: "Activity", icon: "activity" },
  { id: "settings", label: "Settings", icon: "settings" },
];
const TITLE: Record<Page, string> = { home: "Home", agents: "Agents", activity: "Activity", settings: "Settings" };

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};

// ------------------------------------------------------------------ side rail
export function Side({ page, go, held, cfg, owner, accounts, account, setAccount, live, busy, onCreate }: {
  page: Page; go: (p: Page) => void; held: number; cfg: Config; owner: Owner; accounts: Address[]; account: Address | null;
  setAccount: (a: Address) => void; live: boolean; busy: string | null; onCreate: () => void;
}) {
  return (
    <aside className="side">
      <Blocks />
      <a className="logo" href="#home" onClick={(e) => { e.preventDefault(); go("home"); }} aria-label="Killswitch home">
        <Logo />
      </a>
      <WalletSwitch accounts={accounts} account={account} setAccount={setAccount} busy={busy} onCreate={onCreate} />
      <nav className="nav" aria-label="Sections">
        {NAV.map((n) => (
          <button key={n.id} type="button" className={`nav-i ${page === n.id ? "on" : ""}`} aria-current={page === n.id ? "page" : undefined} onClick={() => go(n.id)}>
            <Icon name={n.icon} size={17} />
            {n.label}
            {n.id === "activity" && held > 0 && <span className="count" aria-label={`${held} waiting for you`}>{held}</span>}
          </button>
        ))}
      </nav>
      <div className="side-foot">
        <div className="conn" aria-label="Connection">
          <div className="conn-r">
            <St s={live ? "ok" : "wait"}>{live ? "Live" : "Reconnecting"}</St>
            <span className="k">{chainOf(cfg).name}</span>
          </div>
          <div className="conn-r">
            <b title={owner.address}>{short(owner.address)}</b>
            <span className="k">{owner.kind === "dev" ? "Dev wallet" : "Your wallet"}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

type WalletProps = {
  accounts: Address[]; account: Address | null; setAccount: (a: Address) => void; busy: string | null; onCreate: () => void;
  compact?: boolean; live?: boolean;
};
/** The wallet this page is about, and a menu of the others. `compact` is the phone's chip in the top bar. */
function WalletSwitch({ accounts, account, setAccount, busy, onCreate, compact, live }: WalletProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const i = account ? accounts.indexOf(account) : -1;
  return (
    <div className={`wsw ${compact ? "compact" : ""}`} ref={ref}>
      {compact ? (
        <button type="button" className="wsw-chip" aria-haspopup="menu" aria-expanded={open} aria-label={`Protected wallet ${short(account ?? "")}, ${live ? "live" : "reconnecting"}`} onClick={() => setOpen(!open)}>
          <Sq s={live ? "ok" : "wait"} />
          <b>{short(account ?? "")}</b>
          <Icon name="down" size={14} />
        </button>
      ) : (
        <button type="button" className="wsw-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="wsw-t">
            <span className="lbl">Protected wallet</span>
            <b title={account ?? ""}>{short(account ?? "")}</b>
          </span>
          <span className="wsw-r">
            {accounts.length > 1 && <span className="wsw-n" aria-label={`wallet ${i + 1} of ${accounts.length}`}>{i + 1}/{accounts.length}</span>}
            <Icon name="down" size={16} />
          </span>
        </button>
      )}
      {open && (
        <div className="menu" role="menu">
          {accounts.map((a, k) => (
            <button
              key={a}
              type="button"
              role="menuitemradio"
              aria-checked={a === account}
              className={`menu-i ${a === account ? "on" : ""}`}
              onClick={() => { setAccount(a); setOpen(false); }}
            >
              <Sq s="ok" />
              {short(a)}
              <span className="k">Wallet {k + 1}</span>
            </button>
          ))}
          <div className="menu-sep" />
          <button type="button" role="menuitem" className="menu-i add" disabled={!!busy} onClick={() => { setOpen(false); onCreate(); }}>
            <Icon name="plus" size={15} /> Create another wallet
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ top bar
export function Top({ page, cfg, live, alerts, account, ring, go, open, accounts, setAccount, busy, onCreate }: {
  page: Page; cfg: Config; owner: Owner; live: boolean; alerts: Alert[]; account: Address | null; ring: number;
  go: (p: Page) => void; open: (p: Panel) => void;
  accounts: Address[]; setAccount: (a: Address) => void; busy: string | null; onCreate: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  return (
    <header className="top" data-scrolled={scrolled ? "" : undefined}>
      <a className="logo m-logo" href="#home" onClick={(e) => { e.preventDefault(); go("home"); }} aria-label="Killswitch home">
        <Logo />
      </a>
      <h1>{TITLE[page]}</h1>
      <div className="top-r">
        <span className="chip net" title={chainOf(cfg).name}>
          <Sq s={live ? "ok" : "wait"} />
          {chainOf(cfg).name}
        </span>
        <div className="m-wallet">
          <WalletSwitch compact live={live} accounts={accounts} account={account} setAccount={setAccount} busy={busy} onCreate={onCreate} />
        </div>
        <Bell alerts={alerts} account={account} ring={ring} go={go} open={open} />
      </div>
    </header>
  );
}

const ALERT_TONE: Record<string, Tone> = { critical: "bad", warn: "hold", info: "ok" };

/** The bell: what the guardian has said about this wallet, newest first; unread ones until you look. */
function Bell({ alerts, account, ring, go, open }: { alerts: Alert[]; account: Address | null; ring: number; go: (p: Page) => void; open: (p: Panel) => void }) {
  useNow(30000);
  const key = `ks.seen.${(account ?? "").toLowerCase()}`;
  const [seen, setSeen] = useState(() => Number(ls.get(key) ?? 0));
  const [snap, setSnap] = useState(0);
  const [show, setShow] = useState(false);
  const [ringing, setRinging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, show, () => setShow(false));
  useEffect(() => setSeen(Number(ls.get(key) ?? 0)), [key]);
  useEffect(() => {
    if (!ring) return;
    setRinging(true);
    const t = setTimeout(() => setRinging(false), 950);
    return () => clearTimeout(t);
  }, [ring]);
  const top = alerts.reduce((m, a) => Math.max(m, a.id), 0);
  const unread = alerts.filter((a) => a.id > seen).length;
  // while the list is open, new alerts count as read
  useEffect(() => {
    if (show && top > seen) {
      setSeen(top);
      ls.set(key, String(top));
    }
  }, [show, top, seen, key]);
  const toggle = () => {
    if (!show) setSnap(seen);
    setShow(!show);
  };
  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button type="button" className={`bell ${ringing ? "ring" : ""}`} aria-label={unread ? `Notifications, ${unread} new` : "Notifications"} aria-expanded={show} onClick={toggle}>
        <Icon name="bell" size={17} />
        {unread > 0 && !show && <span className="count">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {show && (
        <div className="notes" role="dialog" aria-label="Notifications">
          <div className="notes-h">
            <h2>Notifications</h2>
            <span className="lbl">{alerts.length ? `${alerts.length} from the guardian` : ""}</span>
          </div>
          <div className="notes-list">
            {alerts.length === 0 && (
              <div className="notes-empty">
                <Sq s="off" lg />
                <p>Nothing yet. When the guardian blocks, holds or pauses something, it shows up here.</p>
              </div>
            )}
            {alerts.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`note-i ${a.id > snap ? "unread" : ""}`}
                onClick={() => {
                  setShow(false);
                  if (a.agent_id) open({ k: "agent", id: a.agent_id as Hex });
                  else go("activity");
                }}
              >
                <Sq s={ALERT_TONE[a.level] ?? "ok"} />
                <p>{a.message}</p>
                <span className="lbl">
                  {ago(a.created_at)}
                  {a.id > snap && <span className="new">· New</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ phone tabs
export function Tabs({ page, go, held }: { page: Page; go: (p: Page) => void; held: number }) {
  return (
    <nav className="tabs" aria-label="Sections">
      {NAV.map((n) => (
        <button key={n.id} type="button" className={`tab ${page === n.id ? "on" : ""}`} aria-current={page === n.id ? "page" : undefined} onClick={() => go(n.id)}>
          <Icon name={n.icon} size={20} />
          {n.label}
          {n.id === "activity" && held > 0 && <span className="count">{held}</span>}
        </button>
      ))}
    </nav>
  );
}

// ------------------------------------------------------------------ before the app
export function Boot() {
  return (
    <div className="screen">
      <div className="boot">
        <Logo />
        <span className="lbl">
          <Px /> Connecting
        </span>
      </div>
    </div>
  );
}

/** The relay can't be reached: say so plainly, and keep trying every few seconds. */
export function Offline({ onRetry }: { onRetry: () => void }) {
  const [left, setLeft] = useState(5);
  useEffect(() => {
    if (left <= 0) {
      onRetry();
      setLeft(5);
      return;
    }
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left, onRetry]);
  return (
    <div className="screen">
      <div className="screen-in">
        <St s="bad">Relay offline</St>
        <h1>Can't reach the Killswitch relay.</h1>
        <p>
          The app talks to the relay on port 8787. Start everything with <code>./start.sh</code>, then it connects by itself.
        </p>
        <Btn kind="ink" arrow="→" onClick={onRetry}>Try again now</Btn>
        <span className="lbl">Trying again in {left}s</span>
      </div>
    </div>
  );
}
