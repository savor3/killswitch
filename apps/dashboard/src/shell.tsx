// The frame: the side rail (logo and network, the protected wallet and its balance, the sections, and at its
// foot the owner's wallet with its menu), the top bar (page name, the bell and its notification history), the
// phone tabs, and the two screens before the app (starting, relay offline).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Address, Hex } from "viem";
import type { Alert, Page, Panel } from "./App";
import { Aurora } from "./aurora";
import { Logo } from "./brand";
import { Btn, Identicon, Px, Sq, St, Tween, useDismiss, useNow, type Tone } from "./kit";
import { HOME_URL, ago, chainOf, ownerName, short, type Config, type Owner } from "./lib";
import { Icon, explorerAddress, netName, usd } from "./ui";

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
export function Side({ page, go, held, cfg, owner, accounts, account, setAccount, total, live, busy, onCreate, onDisconnect }: {
  page: Page; go: (p: Page) => void; held: number; cfg: Config; owner: Owner; accounts: Address[]; account: Address | null;
  setAccount: (a: Address) => void; total: number | null; live: boolean; busy: string | null; onCreate: () => void; onDisconnect: () => void;
}) {
  return (
    <aside className="side">
      <Aurora kind="rail" />
      <div className="side-top">
        <a className="logo" href="#home" onClick={(e) => { e.preventDefault(); go("home"); }} aria-label="Killswitch home">
          <Logo />
        </a>
        <span
          className={`net ${live ? "" : "is-wait"}`}
          title={live ? `${chainOf(cfg).name}. Updates arrive as they happen.` : `${chainOf(cfg).name}. Reconnecting to the relay.`}
        >
          <i aria-hidden="true" />
          {netName(cfg)}
        </span>
      </div>
      <WalletSwitch accounts={accounts} account={account} setAccount={setAccount} total={total} busy={busy} onCreate={onCreate} />
      <Nav page={page} go={go} held={held} />
      <div className="side-foot">
        <Account cfg={cfg} owner={owner} live={live} onDisconnect={onDisconnect} />
      </div>
    </aside>
  );
}

/** The sections. The one you are on sits on a highlight with a red square, and the highlight slides to the next. */
function Nav({ page, go, held }: { page: Page; go: (p: Page) => void; held: number }) {
  const ref = useRef<HTMLElement>(null);
  const placed = useRef(false);
  const [at, setAt] = useState<{ y: number; h: number; move: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    if (!el) return;
    setAt({ y: el.offsetTop, h: el.offsetHeight, move: placed.current });
    placed.current = true;
  }, [page]);
  return (
    <nav className="nav" aria-label="Sections" ref={ref}>
      {at && <span className={`nav-mark ${at.move ? "is-moving" : ""}`} style={{ height: at.h, transform: `translate3d(0, ${at.y}px, 0)` }} aria-hidden="true" />}
      {NAV.map((n) => (
        <button key={n.id} type="button" data-page={n.id} className={`nav-i ${page === n.id ? "on" : ""}`} aria-current={page === n.id ? "page" : undefined} onClick={() => go(n.id)}>
          <Icon name={n.icon} size={17} />
          {n.label}
          {n.id === "activity" && held > 0 && <span className="count" aria-label={`${held} waiting for you`}>{held}</span>}
        </button>
      ))}
    </nav>
  );
}

/** Who signs: the owner's wallet at the foot of the rail; what you can do with it opens above it. */
function Account({ cfg, owner, live, onDisconnect }: { cfg: Config; owner: Owner; live: boolean; onDisconnect: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  return (
    <div className="acct" ref={ref}>
      {open && (
        <div className="menu up" role="menu" aria-label="Your wallet">
          <OwnerItems cfg={cfg} owner={owner} close={() => setOpen(false)} onDisconnect={onDisconnect} />
        </div>
      )}
      <button type="button" className="acct-btn" aria-haspopup="menu" aria-expanded={open} title={owner.address} onClick={() => setOpen(!open)}>
        <Identicon address={owner.address} size={32} />
        <span className="acct-t">
          <b>{short(owner.address)}</b>
          <span>
            {live ? (
              ownerName(owner)
            ) : (
              <>
                <Px /> Reconnecting
              </>
            )}
          </span>
        </span>
        <Icon name="updown" size={15} />
      </button>
    </div>
  );
}

/** The owner's wallet: copy its address, see it on the explorer, go to the website, disconnect. */
function OwnerItems({ cfg, owner, head, close, onDisconnect }: { cfg: Config; owner: Owner; head?: boolean; close: () => void; onDisconnect: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);
  const link = explorerAddress(cfg, owner.address);
  return (
    <>
      {head && (
        <div className="menu-h">
          <Identicon address={owner.address} size={28} />
          <span>
            <b>{short(owner.address)}</b>
            <span>
              {ownerName(owner)} · {chainOf(cfg).name}
            </span>
          </span>
        </div>
      )}
      <button
        type="button"
        role="menuitem"
        className="menu-i add"
        onClick={() => navigator.clipboard?.writeText(owner.address).then(() => setCopied(true), () => {})}
      >
        <Icon name={copied ? "check" : "copy"} size={15} /> {copied ? "Copied" : "Copy address"}
      </button>
      {link && (
        <a role="menuitem" className="menu-i add" href={link} target="_blank" rel="noopener noreferrer" onClick={close}>
          <Icon name="external" size={15} /> View on explorer
        </a>
      )}
      <a role="menuitem" className="menu-i add" href={HOME_URL}>
        <Icon name="globe" size={15} /> Killswitch website
      </a>
      <div className="menu-sep" />
      <button type="button" role="menuitem" className="menu-i add bad" onClick={() => { close(); onDisconnect(); }}>
        <Icon name="power" size={15} /> Disconnect
      </button>
    </>
  );
}

type WalletProps = {
  accounts: Address[]; account: Address | null; setAccount: (a: Address) => void; busy: string | null; onCreate: () => void;
  total?: number | null; compact?: boolean; live?: boolean; extra?: (close: () => void) => ReactNode;
};
/** The protected wallet this page is about, its balance, and a menu of the others. `compact` is the phone's
 *  chip in the top bar, whose menu also holds the owner's wallet (`extra`). */
function WalletSwitch({ accounts, account, setAccount, busy, onCreate, total, compact, live, extra }: WalletProps) {
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
          <span className="lbl">Protected wallet</span>
          <span className="wsw-r">
            {accounts.length > 1 && <span className="wsw-n" aria-label={`wallet ${i + 1} of ${accounts.length}`}>{i + 1}/{accounts.length}</span>}
            <Icon name="down" size={16} />
          </span>
          <b className="wsw-bal">{total == null ? <span className="wsw-skel" /> : <Tween value={total} format={(n) => usd(n)} />}</b>
          <span className="wsw-a" title={account ?? ""}>{short(account ?? "")}</span>
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
          {extra && (
            <>
              <div className="menu-sep" />
              {extra(() => setOpen(false))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ top bar
export function Top({ page, cfg, owner, live, alerts, account, ring, go, open, accounts, setAccount, busy, onCreate, onDisconnect }: {
  page: Page; cfg: Config; owner: Owner; live: boolean; alerts: Alert[]; account: Address | null; ring: number;
  go: (p: Page) => void; open: (p: Panel) => void;
  accounts: Address[]; setAccount: (a: Address) => void; busy: string | null; onCreate: () => void; onDisconnect: () => void;
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
          <WalletSwitch
            compact
            live={live}
            accounts={accounts}
            account={account}
            setAccount={setAccount}
            busy={busy}
            onCreate={onCreate}
            extra={(close) => <OwnerItems head cfg={cfg} owner={owner} close={close} onDisconnect={onDisconnect} />}
          />
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
