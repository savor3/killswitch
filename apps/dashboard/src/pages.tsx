// The four pages and the first run. Home leads with where things stand and what needs you; Agents and Activity
// are lists you open into the detail drawer; Settings is grouped rows.
import { useMemo, useState, type ReactNode } from "react";
import type { App } from "./App";
import { Aurora } from "./aurora";
import { Logo } from "./brand";
import { ConnectStep } from "./connect";
import { Btn, Copy, Empty, Identicon, Meter, Seg, Sq, St, Tween, useArrivals, useNow, type Tone } from "./kit";
import { HOME_URL, ago, chainOf, ownerName, short, type Agent, type Config, type Op, type Owner, type WalletInfo } from "./lib";
import {
  Icon, agentKind, agentState, balanceUsd, dayKey, dayLabel, decOf, exposureUsd, humanSummary, num, opState, opsCsv,
  plural, toNum, tpl, until, usd, type TemplateId,
} from "./ui";

// ------------------------------------------------------------------ shared rows
/** One operation: its square, what it was, who and when, then its state in words. */
export function OpRow({ app, op, mark }: { app: App; op: Op; mark?: "new" | "flash" }) {
  const [label, tone] = opState(op);
  return (
    <button type="button" className={`row op ${mark ?? ""} ${tone === "off" ? "dim" : ""}`} onClick={() => app.open({ k: "op", id: op.id })}>
      <Sq s={tone} />
      <span className="t">
        <b>{humanSummary(app.cfg, op.summary)}</b>
        <span className="lbl">
          {op.label} · {ago(op.created_at)}
          {op.llm ? " · AI reviewed" : ""}
        </span>
      </span>
      <span className={`st ${tone}`}>{label}</span>
      <Icon name="chevron" size={14} className="go" />
    </button>
  );
}

function spentToday(a: Agent) {
  const l = a.limits[0];
  return l ? { l, used: toNum(l.used, l.decimals), max: toNum(l.maxPerPeriod, l.decimals), cos: toNum(l.cosignAbove, l.decimals) } : null;
}

/** One agent in the full list: its name and kind, today's budget as squares, how long it has left, its state. */
export function AgentRow({ app, a, mark }: { app: App; a: Agent; mark?: "new" | "flash" }) {
  const [label, tone] = agentState(a);
  const live = a.exists && !a.killed;
  const s = spentToday(a);
  return (
    <button type="button" className={`row ag ${live ? "" : "gone"} ${mark ?? ""}`} onClick={() => app.open({ k: "agent", id: a.id })}>
      <span className="t">
        <b>{a.label}</b>
        <span className="lbl">{tpl(agentKind(a) as TemplateId).title}</span>
      </span>
      <span className="bud">
        {s && live ? (
          <>
            <Meter used={s.used} max={s.max} cos={s.cos} label={`${a.label}: spent today`} />
            <span className="lbl">
              <b>{num(s.used, 2)}</b>&nbsp;/ {num(s.max, 2)} {s.l.symbol} today
            </span>
          </>
        ) : (
          <span className="lbl">{a.killed ? "Stopped by the kill switch" : "No longer has access"}</span>
        )}
      </span>
      <span className="lbl exp">{!live ? "" : a.expired ? "Expired" : `${until(a.validUntil)} left`}</span>
      <St s={tone}>{app.guardianPaused(a) ? "Paused by guardian" : label}</St>
      <Icon name="chevron" size={14} className="go" />
    </button>
  );
}

/** One agent on Home: a card with its state, today's budget and how long it has left. */
function AgentCard({ app, a, mark }: { app: App; a: Agent; mark?: "new" | "flash" }) {
  const [label, tone] = agentState(a);
  const s = spentToday(a);
  return (
    <button type="button" className={`ag-card ${mark ?? ""}`} onClick={() => app.open({ k: "agent", id: a.id })}>
      <span className="ag-card-h">
        <span>
          <b>{a.label}</b>
          <span className="lbl">{tpl(agentKind(a) as TemplateId).title}</span>
        </span>
        <St s={tone}>{app.guardianPaused(a) ? "Paused by guardian" : label}</St>
      </span>
      {s && <Meter used={s.used} max={s.max} cos={s.cos} label={`${a.label}: spent today`} />}
      <span className="foot">
        {s && (
          <span className="lbl">
            <b>{num(s.used, 2)}</b>&nbsp;/ {num(s.max, 2)} {s.l.symbol} today
          </span>
        )}
        <span className="lbl">{a.expired ? "Expired" : `${until(a.validUntil)} left`}</span>
      </span>
    </button>
  );
}

/** Why a held payment can no longer be approved, if it can't: its agent was paused, stopped or removed since. */
export function cantApprove(app: App, o: Op): string | null {
  const a = app.info.agents.find((x) => x.id.toLowerCase() === o.agent_id.toLowerCase());
  if (!a || !a.exists) return "This agent was removed, so the payment can't go through. Deny it to clear it.";
  if (a.killed) return "The kill switch stopped this agent, so the payment can't go through. Deny it to clear it.";
  if (a.paused) return "This agent is paused. Resume it on the Agents page to approve, or deny now.";
  return null;
}

/** A payment the guardian held for you: who asked and what, why it was held, what the agent said; deny here,
 *  approve after one more look. The blinking square sits beside who asked. */
export function Approval({ app, op }: { app: App; op: Op }) {
  const [denying, setDenying] = useState(false);
  const blocked = cantApprove(app, op);
  return (
    <article className="appr" aria-label="Payment waiting for your approval">
      <div className="appr-h">
        <div className="appr-t">
          <span className="st wait">
            <Sq s="wait" />
            {op.label} wants to
          </span>
          <h3>{humanSummary(app.cfg, op.summary)}</h3>
        </div>
        <span className="lbl">{ago(op.created_at)}</span>
      </div>
      {op.reasons.length > 0 && (
        <div className="flags">
          {op.reasons.map((r, i) => (
            <span key={i} className="flag">
              <Sq s="hold" />
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </span>
          ))}
        </div>
      )}
      {op.intent && (
        <div className="said">
          <span className="lbl">Agent said</span>
          <q>{op.intent}</q>
        </div>
      )}
      <div className="appr-f">
        <p>{blocked ?? "Nothing has moved. Your signature decides."}</p>
        <div className="acts">
          <Btn kind="ghost" onClick={() => app.open({ k: "op", id: op.id })}>Details</Btn>
          <Btn
            kind="grey"
            disabled={!!app.busy}
            busy={denying && app.busy === `decide-${op.id}` ? "Denying" : null}
            onClick={() => {
              setDenying(true);
              app.decide(op, false).finally(() => setDenying(false));
            }}
          >
            Deny
          </Btn>
          <Btn kind="ink" arrow="→" disabled={!!app.busy || !!blocked} onClick={() => app.ask({ k: "approve", op })}>
            Approve
          </Btn>
        </div>
      </div>
    </article>
  );
}

function SecHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="sec-h">
      <h2>{title}</h2>
      {children && <div className="r">{children}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ home
export function HomePage({ app }: { app: App }) {
  const { cfg, info, ops, prices, busy, held } = app;
  useNow(30000);
  const agents = info.agents.filter((a) => a.exists && !a.killed);
  const active = agents.filter((a) => a.active);
  const paused = agents.filter((a) => a.paused);
  const killedAll = info.agents.some((a) => a.killed) && agents.length === 0;
  const total = balanceUsd(cfg, info.balances, prices);
  const exposure = exposureUsd(cfg, info.agents, info.balances, prices);
  const pct = total > 0 ? Math.min(100, (exposure / total) * 100) : 0;
  const funded = total > 0;
  const setupDone = funded && info.agents.length > 0 && ops.length > 0;
  const testnet = cfg.chainId !== 8453;
  const recent = ops.filter((o) => o.status !== "held").slice(0, 6);
  const marks = useArrivals(recent);
  const agentMarks = useArrivals(agents.map((a) => ({ id: a.id, status: agentState(a)[0] })));

  let tone: Tone = "ok";
  let label = "All clear";
  let headline = "Everything is safe.";
  let sub = active.length ? `${plural(active.length, "agent")} working inside your limits. The guardian is watching.` : "No agents are running right now.";
  if (held.length) {
    tone = "wait";
    label = `${held.length} waiting for you`;
    headline = `${plural(held.length, "payment")} waiting for you.`;
    sub = "An agent tried something unusual. Nothing moves until you decide.";
  } else if (killedAll) {
    tone = "bad";
    label = "All stopped";
    headline = "All agents stopped.";
    sub = "You used the kill switch. Add a new agent to start again.";
  } else if (paused.length) {
    tone = "hold";
    label = `${paused.length} paused`;
    headline = `${plural(paused.length, "agent")} paused.`;
    sub = paused.some(app.guardianPaused)
      ? "The guardian paused an agent after suspicious activity. Review it before you resume it."
      : "You paused it. Resume it on the Agents page when you're ready.";
  }

  const tokens = Object.entries(info.balances).filter(([, raw]) => BigInt(raw) > 0n);
  return (
    <div className="stack">
      <section className="inst on-ink" data-tone={tone} aria-label="Where things stand">
        <div className="cell cell-status">
          <St s={tone}>{label}</St>
          <h2>{headline}</h2>
          <p>{sub}</p>
          {held.length > 0 && (
            <div className="acts">
              <Btn kind="red" size="sm" arrow="↓" className="down" onClick={() => document.getElementById("approvals")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                Review
              </Btn>
            </div>
          )}
          {!held.length && paused.length > 0 && (
            <div className="acts">
              <Btn kind="glass" size="sm" arrow="→" onClick={() => app.go("agents")}>Review agents</Btn>
            </div>
          )}
        </div>
        <div className="cell">
          <span className="lbl">Balance</span>
          <div className="big">
            <Tween value={total} format={(n) => usd(n)} />
          </div>
          <div className="toks">
            {tokens.length === 0 && <span>Empty</span>}
            {tokens.map(([sym, raw]) => (
              <span key={sym}>
                {num(toNum(raw, decOf(cfg, sym)), sym === "USDC" ? 2 : 4)} {sym}
              </span>
            ))}
            {testnet && (
              <button type="button" className="link" disabled={!!busy} onClick={app.faucet} title="Test tokens, no value">
                + Add test USDC
              </button>
            )}
          </div>
          <div className="acts">
            <Btn kind="glass" size="sm" onClick={() => app.ask({ k: "deposit" })}>Deposit</Btn>
            <Btn kind="glass" size="sm" disabled={!funded || !!busy} onClick={() => app.ask({ k: "withdraw" })}>Withdraw</Btn>
          </div>
        </div>
        <div className="cell">
          <span className="lbl">Agents can spend today</span>
          <div className="big">
            <Tween value={exposure} format={(n) => usd(n)} />
          </div>
          <Meter used={exposure} max={total} n={24} label="Share of your balance agents could still move today" />
          <p className="foot">{funded ? `${pct.toFixed(0)}% of your balance. Even a hacked agent can't go past it.` : "Add funds to see your exposure."}</p>
        </div>
        <div className="cell cell-stop">
          <span className="lbl">Emergency stop</span>
          <Btn kind="red" full arrow="→" disabled={!!busy || agents.length === 0} onClick={() => app.ask({ k: "kill" })}>
            Stop all agents
          </Btn>
          <p className="foot">{agents.length ? `Cuts off ${plural(agents.length, "agent")} at once, with one signature.` : "No agents to stop."}</p>
        </div>
      </section>

      {held.length > 0 && (
        <section className="sec" id="approvals" style={{ scrollMarginTop: 96 }}>
          <SecHead title="Needs your approval">
            <span className="st wait">{held.length} waiting</span>
          </SecHead>
          {held.map((o) => <Approval key={o.id} app={app} op={o} />)}
        </section>
      )}

      {!setupDone && (
        <section className="sec">
          <SecHead title="Get started">
            <span className="lbl">{[funded, info.agents.length > 0, ops.length > 0].filter(Boolean).length} of 3 done</span>
          </SecHead>
          <div className="setup">
            <Step n={1} done={funded} title="Add funds" text="Move in only what your agents should be able to use.">
              {testnet ? (
                <Btn kind="ink" size="sm" arrow="→" disabled={!!busy} onClick={app.faucet}>Add 1,000 test USDC</Btn>
              ) : (
                <Btn kind="ink" size="sm" arrow="→" onClick={() => app.ask({ k: "deposit" })}>Deposit</Btn>
              )}
            </Step>
            <Step n={2} done={info.agents.length > 0} title="Add your first agent" text="Pick what it may do and how much it may spend.">
              <Btn kind="ink" size="sm" arrow="→" disabled={!!busy || !funded} onClick={() => app.ask({ k: "new" })}>Add agent</Btn>
            </Step>
            <Step n={3} done={ops.length > 0} title="Connect your AI" text="Paste one command into Claude, or use the SDK. Its first action shows up here." />
          </div>
        </section>
      )}

      <section className="sec">
        <SecHead title="Agents">
          <button type="button" className="link" onClick={() => app.go("agents")}>
            See all <span className="arr">→</span>
          </button>
        </SecHead>
        <div className="ag-cards">
          {agents.slice().reverse().slice(0, 3).map((a) => <AgentCard key={a.id} app={app} a={a} mark={agentMarks.get(a.id)} />)}
          <button type="button" className="ag-add" disabled={!!busy || !funded} onClick={() => app.ask({ k: "new" })}>
            <Icon name="plus" size={18} />
            {agents.length ? "Add another agent" : info.agents.length ? "Add a new agent" : "Add your first agent"}
          </button>
        </div>
      </section>

      <section className="sec">
        <SecHead title="Recent activity">
          <button type="button" className="link" onClick={() => app.go("activity")}>
            See all <span className="arr">→</span>
          </button>
        </SecHead>
        {recent.length === 0 ? (
          <Empty title="Nothing yet" text="Everything your agents try appears here, live." />
        ) : (
          <div className="list">
            {recent.map((o) => <OpRow key={o.id} app={app} op={o} mark={marks.get(o.id)} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function Step({ n, done, title, text, children }: { n: number; done: boolean; title: string; text: string; children?: ReactNode }) {
  return (
    <div className={`setup-i ${done ? "done" : ""}`}>
      <St s={done ? "ok" : "off"}>{done ? "Done" : `Step ${n}`}</St>
      <b>{title}</b>
      <p>{text}</p>
      {!done && children}
    </div>
  );
}

// ------------------------------------------------------------------ agents
export function AgentsPage({ app }: { app: App }) {
  const [showOld, setShowOld] = useState(false);
  useNow(30000);
  const live = app.info.agents.filter((a) => a.exists && !a.killed).reverse();
  const old = app.info.agents.filter((a) => !a.exists || a.killed).reverse();
  const marks = useArrivals(app.info.agents.map((a) => ({ id: a.id, status: agentState(a)[0] })));
  return (
    <div className="stack" style={{ gap: 28 }}>
      <div className="page-h">
        <h1>Agents</h1>
      </div>
      <div className="sec-h">
        <p className="intro">Each agent has its own key and can only do what you allowed. Open one to see its limits and history, pause it or remove it.</p>
        <Btn kind="ink" arrow="+" disabled={!!app.busy} onClick={() => app.ask({ k: "new" })}>Add agent</Btn>
      </div>
      {live.length === 0 ? (
        <Empty title="No active agents" text="Add one from a template: trading, auto-buy, payments or pay-per-use." />
      ) : (
        <div className="list">
          {live.map((a) => <AgentRow key={a.id} app={app} a={a} mark={marks.get(a.id)} />)}
        </div>
      )}
      {old.length > 0 && (
        <section className="sec">
          <button type="button" className="link" aria-expanded={showOld} onClick={() => setShowOld(!showOld)}>
            <span className="arr" style={{ display: "inline-block", transform: showOld ? "rotate(90deg)" : "none" }}>→</span>
            {plural(old.length, "removed or stopped agent")}
          </button>
          {showOld && (
            <div className="list page">
              {old.map((a) => <AgentRow key={a.id} app={app} a={a} />)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ activity: the history
type FilterId = "all" | "held" | "stopped" | "done";
const FILTERS: { id: FilterId; label: string; match: (o: Op) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "held", label: "Needs you", match: (o) => o.status === "held" },
  { id: "stopped", label: "Blocked", match: (o) => ["blocked", "rejected", "denied", "failed"].includes(o.status) || o.source === "bypass" },
  { id: "done", label: "Completed", match: (o) => o.status === "confirmed" && o.source !== "bypass" },
];

export function ActivityPage({ app }: { app: App }) {
  const { ops, cfg } = app;
  const [f, setF] = useState<FilterId>(() => (app.held.length ? "held" : "all"));
  const [q, setQ] = useState("");
  const [agent, setAgent] = useState("");
  useNow(30000);
  const filter = FILTERS.find((x) => x.id === f)!;
  const agents = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of ops) m.set(o.agent_id, o.label);
    return Array.from(m.entries());
  }, [ops]);
  const needle = q.trim().toLowerCase();
  const shown = ops.filter(
    (o) =>
      filter.match(o) &&
      (!agent || o.agent_id === agent) &&
      (!needle || [humanSummary(cfg, o.summary), o.label, o.intent ?? "", o.reasons.join(" "), o.tx_hash ?? ""].join(" ").toLowerCase().includes(needle)),
  );
  const marks = useArrivals(ops);
  const days: [string, Op[]][] = [];
  for (const o of shown) {
    const k = dayKey(o.created_at);
    const last = days[days.length - 1];
    if (last && last[0] === k) last[1].push(o);
    else days.push([k, [o]]);
  }
  const download = () => {
    const blob = new Blob([opsCsv(cfg, shown)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `killswitch-activity-${short(app.account).replace("…", "-")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-h">
        <h1>Activity</h1>
      </div>
      <div className="toolbar">
        <Seg
          label="Show"
          value={f}
          onChange={setF}
          options={FILTERS.map((x) => {
            const n = ops.filter(x.match).length;
            return { id: x.id, label: x.label, n: x.id === "all" ? undefined : n, sq: x.id === "held" && n > 0 ? ("wait" as Tone) : undefined };
          })}
        />
        <label className="search">
          <Icon name="search" size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activity" aria-label="Search activity" />
        </label>
        {agents.length > 1 && (
          <select className="select" value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Agent">
            <option value="">Every agent</option>
            {agents.map(([id, label]) => (
              <option key={id} value={id}>
                {label} · {short(id)}
              </option>
            ))}
          </select>
        )}
        <span className="grow" />
        <Btn kind="ghost" size="sm" disabled={!shown.length} onClick={download}>
          <Icon name="download" size={14} /> Export CSV
        </Btn>
      </div>
      {shown.length === 0 ? (
        <Empty
          title={ops.length ? "Nothing here" : "Nothing yet"}
          text={ops.length ? "No activity matches. Try another filter or clear the search." : "Everything your agents try appears here, live: what was sent, what the guardian held, what was blocked."}
        />
      ) : (
        <div key={f}>
          {days.map(([k, list]) => (
            <section key={k} aria-label={dayLabel(list[0].created_at)}>
              <div className="day">
                <span className="lbl">{dayLabel(list[0].created_at)}</span>
                <span className="lbl faint">{list.length}</span>
              </div>
              <div className="list">
                {list.map((o) => <OpRow key={o.id} app={app} op={o} mark={marks.get(o.id)} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ settings
export function SettingsPage({ app }: { app: App }) {
  const { cfg, info, owner } = app;
  return (
    <div>
      <div className="page-h">
        <h1>Settings</h1>
      </div>
      <Set title="Wallets" text="The protected wallet holds what your agents may use. Your own wallet is the master key.">
        <div className="group kvs">
          <Kv k="Protected wallet" mono={info.address} />
          <Kv k={owner.kind === "dev" ? "Owner · local test wallet" : "Owner · your browser wallet"} mono={owner.address} />
          <Kv k="Network">
            <p>{chainOf(cfg).name}</p>
          </Kv>
        </div>
        <div className="acts">
          <Btn kind="grey" size="sm" onClick={() => app.ask({ k: "deposit" })}>Deposit</Btn>
          <Btn kind="grey" size="sm" disabled={!!app.busy} onClick={() => app.ask({ k: "withdraw" })}>Withdraw</Btn>
          <Btn kind="grey" size="sm" disabled={!!app.busy} onClick={app.createAccount}>
            <Icon name="plus" size={13} /> Create another wallet
          </Btn>
          <Btn kind="ghost" size="sm" onClick={app.disconnect}>Disconnect</Btn>
        </div>
      </Set>
      <Set title="Guardian" text="It checks every agent action before it happens. It can pause an agent or add an extra check on big payments. It can never spend your money or raise a limit.">
        <div className="group kvs">
          <Kv k="Guardian address" mono={info.guardian} />
          <Kv k="Checks">
            <p>{cfg.llm ? "Rules, simulation and AI review" : "Rules and simulation"}</p>
          </Kv>
          <Kv k="AI review">
            <St s={cfg.llm ? "ok" : "off"}>{cfg.llm ? "On" : "Off: unusual payments wait for you"}</St>
          </Kv>
        </div>
      </Set>
      <Set title="Notifications" text="Alerts always show in the app and under the bell. A browser notification reaches you when this tab is in the background.">
        <div className="group kvs">
          <Kv k="When an agent needs you">
            <button type="button" className="toggle" role="switch" aria-checked={app.notify} aria-label="Browser notifications" onClick={() => app.setNotify(!app.notify)} />
          </Kv>
        </div>
      </Set>
      <Set title="Appearance" text="Light by default. Dark, or follow the system, if you prefer.">
        <Seg
          label="Theme"
          value={app.theme}
          onChange={app.setTheme}
          options={[
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark" },
            { id: "system", label: "System" },
          ]}
        />
      </Set>
      <Set title="How you're protected" text="Three layers, each on its own.">
        <div className="layers">
          <Layer n={1} title="On-chain limits" text="Caps, allowed apps and expiry live in the wallet contract. Nobody can bypass them, not even us." />
          <Layer n={2} title="Guardian" text="Checks every action, holds unusual ones for you and pauses agents that misbehave." />
          <Layer n={3} title="Kill switch" text="One signature voids every agent's access at once." />
        </div>
      </Set>
    </div>
  );
}

function Set({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <section className="set">
      <div className="set-h">
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

export function Kv({ k, mono, children }: { k: string; mono?: string; children?: ReactNode }) {
  return (
    <div className="kv">
      <span className="lbl">{k}</span>
      <span className="v">
        {mono ? (
          <>
            <span className="mono" title={mono}>{mono}</span>
            <Copy text={mono} />
          </>
        ) : (
          children
        )}
      </span>
    </div>
  );
}

function Layer({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="layer">
      <span className="lbl">
        <Sq /> Layer {n}
      </span>
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}

// ------------------------------------------------------------------ loading
export function Skeleton() {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading">
      <div className="skel skel-inst" />
      <div className="ag-cards">
        {[0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 126 }} />)}
      </div>
      <div className="sec">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skel skel-row" />)}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ first run
export function Steps({ n, labels }: { n: number; labels: string[] }) {
  return (
    <ol className="steps" style={{ ["--n" as string]: labels.length }}>
      {labels.map((l, i) => (
        <li key={l} className={i + 1 < n ? "done" : i + 1 === n ? "on" : ""} aria-current={i + 1 === n ? "step" : undefined}>
          {l}
        </li>
      ))}
    </ol>
  );
}

export function Onboarding({ cfg, owner, loading, busy, onDev, onConnect, onCreate, onDisconnect }: {
  cfg: Config; owner: Owner | null; loading: boolean; busy: string | null; onDev: () => void;
  onConnect: (w: WalletInfo, step: (s: "account" | "network") => void, live: () => boolean) => Promise<void>; onCreate: () => void; onDisconnect: () => void;
}) {
  const step = !owner ? 1 : 2;
  return (
    <div className="onb">
      <div className="onb-l">
        <Aurora kind="panel" />
        <a className="logo onb-logo" href={HOME_URL} aria-label="Killswitch website">
          <Logo />
        </a>
        <div className="onb-copy">
          <h1>
            <span className="ln">Let AI use your money.</span> <span className="ln red">Never lose control of it.</span>
          </h1>
          <p className="lead">Give any AI agent a wallet with hard limits. The blockchain enforces them, a guardian watches every move, and one tap stops everything.</p>
        </div>
        <ul className="ticks">
          <li><Sq /> Your keys stay yours. Agents get their own limited key.</li>
          <li><Sq /> Daily caps the agent can't exceed, even if it's hacked.</li>
          <li><Sq /> One button to stop every agent at once.</li>
        </ul>
      </div>
      <div className="onb-r">
        <div className="onb-card" key={step}>
          <Steps n={step} labels={["Connect wallet", "Protected wallet", "First agent"]} />
          {step === 1 && <ConnectStep cfg={cfg} onConnect={onConnect} onDev={onDev} />}
          {step === 2 &&
            (loading ? (
              <St s="wait">Loading your wallets</St>
            ) : (
              <>
                <h2>Create your protected wallet</h2>
                <p>A smart wallet, owned by the wallet below. You move in only what your agents should be able to use.</p>
                <div className="owned">
                  <Identicon address={owner!.address} size={34} />
                  <span className="owned-t">
                    <b title={owner!.address}>{short(owner!.address)}</b>
                    <span>
                      {ownerName(owner!)} · {chainOf(cfg).name}
                    </span>
                  </span>
                  <button type="button" className="linkish" disabled={!!busy} onClick={onDisconnect}>
                    Disconnect
                  </button>
                </div>
                <div className="flow">
                  <div><span className="lbl">Yours</span><b>Your wallet</b><span>The master key. Stays where it is.</span></div>
                  <i aria-hidden="true">→</i>
                  <div><span className="lbl">New</span><b>Protected wallet</b><span>Holds agent funds, enforces limits.</span></div>
                  <i aria-hidden="true">→</i>
                  <div><span className="lbl">Later</span><b>AI agents</b><span>Act only inside your rules.</span></div>
                  <b className="flow-tok" aria-hidden="true" />
                </div>
                <Btn kind="ink" size="lg" full arrow="→" busy={busy ? busy : null} onClick={onCreate}>Create protected wallet</Btn>
                <p className="muted onb-fine">One signature with your wallet on {chainOf(cfg).name}.</p>
              </>
            ))}
        </div>
      </div>
    </div>
  );
}
