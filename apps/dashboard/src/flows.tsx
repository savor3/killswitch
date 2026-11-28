// Everything that opens over the page: the dialogs (new agent, connect it, stop all, approve, remove, resume,
// deposit, withdraw) and the two detail drawers (one operation, one agent). Each stays mounted while it plays
// its way out, showing the last thing it was opened with.
import { useEffect, useState, type ReactNode } from "react";
import type { Hex } from "viem";
import type { App, Created, GrantForm, Panel, Sheet } from "./App";
import { Btn, Copy, Dialog, Drawer, HoldButton, Meter, Px, Seg, Sq, St, useLatest, useNow, type Tone } from "./kit";
import { ago, chainOf, short, type Agent, type Op } from "./lib";
import { Kv, OpRow, Steps, cantApprove } from "./pages";
import {
  Icon, TEMPLATES, agentKind, agentState, decOf, explorerTx, humanSummary, num, opState, plural, ruleText, toNum, tpl,
  until, when, type TemplateId,
} from "./ui";

export function Flows({ app, sheet, panel, setSheet, setPanel, grant, killAll, withdraw }: {
  app: App; sheet: Sheet | null; panel: Panel | null; setSheet: (s: Sheet | null) => void; setPanel: (p: Panel | null) => void;
  grant: (f: GrantForm) => Promise<void>; killAll: () => Promise<void>; withdraw: (sym: string, amount: string) => Promise<boolean>;
}) {
  const close = () => setSheet(null);
  const closePanel = () => setPanel(null);
  return (
    <>
      <OpPanel app={app} open={panel?.k === "op"} id={panel?.k === "op" ? panel.id : null} onClose={closePanel} />
      <AgentPanel app={app} open={panel?.k === "agent"} id={panel?.k === "agent" ? panel.id : null} onClose={closePanel} />
      <NewAgent app={app} open={sheet?.k === "new"} onClose={close} onSubmit={grant} />
      <Connect app={app} open={sheet?.k === "connect"} c={sheet?.k === "connect" ? sheet.c : null} onClose={() => { close(); app.go("agents"); }} />
      <Kill app={app} open={sheet?.k === "kill"} onClose={close} onConfirm={killAll} />
      <Approve app={app} open={sheet?.k === "approve"} op={sheet?.k === "approve" ? sheet.op : null} onClose={close} />
      <Remove app={app} open={sheet?.k === "remove"} a={sheet?.k === "remove" ? sheet.a : null} onClose={close} />
      <Resume app={app} open={sheet?.k === "resume"} a={sheet?.k === "resume" ? sheet.a : null} onClose={close} />
      <Deposit app={app} open={sheet?.k === "deposit"} onClose={close} />
      <Withdraw app={app} open={sheet?.k === "withdraw"} onClose={close} onSubmit={withdraw} />
    </>
  );
}

function Head({ s, label, title, children }: { s: Tone; label: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="dialog-h">
      <St s={s}>{label}</St>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/** How the action started in this dialog is going: the red box loader and the step it is on (with the
 *  transaction once there is one), or why it stopped. */
function TxLine({ app }: { app: App }) {
  const p = app.pend;
  if (!p) return null;
  return (
    <div className={`txline ${p.stage}`} role="status" aria-live="polite">
      {p.stage === "work" ? <Px /> : <Sq s={p.stage === "failed" ? "bad" : "off"} />}
      <span>
        {p.stage === "work" ? (
          <>
            {p.step}
            {p.hash && <span className="mono"> · {short(p.hash)}</span>}
          </>
        ) : (
          p.text
        )}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ new agent
const DAYS =[["1", "1 day"], ["7", "1 week"], ["30", "1 month"], ["90", "3 months"]];
const BLANK: GrantForm = { label: "", template: "trader", cap: "", cosign: "", wethCap: "", days: "7" };

function NewAgent({ app, open, onClose, onSubmit }: { app: App; open: boolean; onClose: () => void; onSubmit: (f: GrantForm) => Promise<void> }) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState<GrantForm>(BLANK);
  const [picked, setPicked] = useState<TemplateId | null>(null);
  useEffect(() => {
    if (open) {
      setStep(1);
      setF(BLANK);
      setPicked(null);
    }
  }, [open]);
  const t = tpl(f.template);
  /** choosing a kind fills in its suggested name and limits; Continue (or a double click) moves on */
  const pick = (id: TemplateId) => {
    const x = tpl(id);
    setPicked(id);
    if (id !== picked) setF({ ...f, template: id, label: x.label, cap: x.cap, cosign: x.cosign, wethCap: x.wethCap ?? "" });
  };
  const valid = !!f.label.trim() && Number(f.cap) > 0 && Number(f.cosign) >= 0 && Number(f.days) > 0 && (f.template !== "trader" || Number(f.wethCap) >= 0);
  const busy = app.busy?.startsWith("Granting") ? "Waiting for signature" : null;
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} wide label="Add an agent">
      <Steps n={step} labels={["What it does", "Limits", "Review"]} />
      {step === 1 && (
        <>
          <Head s="ok" label="New agent" title="What should this agent do?">
            <p>Pick a starting point. You set the limits next.</p>
          </Head>
          <div className="tpls" role="radiogroup" aria-label="Kind of agent">
            {TEMPLATES.map((x) => {
              const on = picked === x.id;
              return (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`tpl ${on ? "on" : ""}`}
                  onClick={() => pick(x.id)}
                  onDoubleClick={() => { pick(x.id); setStep(2); }}
                >
                  <span className="tpl-h">
                    <Icon name={x.icon} size={20} />
                    <Sq s={on ? "wait" : "off"} />
                  </span>
                  <b>{x.title}</b>
                  <span>{x.blurb}</span>
                </button>
              );
            })}
          </div>
          <div className="dialog-f">
            <Btn kind="ghost" className="l" onClick={onClose}>Cancel</Btn>
            <Btn kind="ink" arrow="→" disabled={!picked} onClick={() => setStep(2)}>Continue</Btn>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <Head s="ok" label={t.title} title="Set the limits">
            <p>The wallet contract enforces these. The agent can't change them.</p>
          </Head>
          <label className="field">
            <span className="lbl">Name</span>
            <span className="input">
              <input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} maxLength={40} autoFocus />
            </span>
          </label>
          <div className="field">
            <span className="lbl">{f.template === "dca" ? "Most it can spend on buys per day" : "Most it can spend per day"}</span>
            <div className="presets">
              <Seg
                label="Daily cap"
                value={t.caps.includes(f.cap) ? f.cap : null}
                onChange={(c) => setF({ ...f, cap: c, cosign: String(Math.min(Number(f.cosign || c), Number(c))) })}
                options={t.caps.map((c) => ({ id: c, label: `$${c}` }))}
              />
              <span className="input">
                <span className="affix">$</span>
                <input value={f.cap} onChange={(e) => setF({ ...f, cap: e.target.value })} inputMode="decimal" aria-label="Custom daily cap in USDC" />
                <span className="affix">USDC</span>
              </span>
            </div>
          </div>
          <label className="field">
            <span className="lbl">Extra guardian check for single payments over</span>
            <span className="input">
              <span className="affix">$</span>
              <input value={f.cosign} onChange={(e) => setF({ ...f, cosign: e.target.value })} inputMode="decimal" />
              <span className="affix">USDC</span>
            </span>
            {Number(f.cosign) > Number(f.cap) && Number(f.cap) > 0 && <span className="field-note">That is above the daily cap, so the extra check never comes into play.</span>}
          </label>
          {f.template === "trader" && (
            <label className="field">
              <span className="lbl">Most WETH it can sell per day</span>
              <span className="input">
                <input value={f.wethCap} onChange={(e) => setF({ ...f, wethCap: e.target.value })} inputMode="decimal" />
                <span className="affix">WETH</span>
              </span>
            </label>
          )}
          <div className="field">
            <span className="lbl">Access ends after</span>
            <Seg full label="Access ends after" value={f.days} onChange={(d) => setF({ ...f, days: d })} options={DAYS.map(([d, l]) => ({ id: d, label: l }))} />
          </div>
          <div className="dialog-f">
            <Btn kind="ghost" className="l" onClick={() => setStep(1)}>Back</Btn>
            <Btn kind="ink" arrow="→" disabled={!valid} onClick={() => setStep(3)}>Review</Btn>
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <Head s="ok" label="Review" title={<>Review “{f.label}”</>} />
          <div className="can">
            <div>
              <span className="lbl">It can</span>
              {t.can.map((c) => <p key={c}><Sq />{c}</p>)}
              <p>
                <Sq />
                <span>
                  Spend up to <b>${f.cap} USDC</b> a day{f.template === "trader" ? <> and sell up to <b>{f.wethCap} WETH</b></> : null}
                </span>
              </p>
              <p>
                <Sq />
                <span>Keep working for <b>{DAYS.find((d) => d[0] === f.days)?.[1]}</b></span>
              </p>
            </div>
            <div>
              <span className="lbl">It can't</span>
              {t.cant.map((c) => <p key={c}><Sq s="bad" />{c}</p>)}
              <p><Sq s="bad" />Go over the daily limit, even if hacked</p>
              <p><Sq s="bad" />Change its own limits or touch your master key</p>
            </div>
          </div>
          <div className="note">
            <Sq s="hold" />
            <span>Single payments over ${f.cosign} get an extra guardian check. Unusual ones wait for your approval.</span>
          </div>
          <TxLine app={app} />
          <div className="dialog-f">
            <Btn kind="ghost" className="l" disabled={!!busy} onClick={() => setStep(2)}>Back</Btn>
            <Btn kind="ink" arrow="→" busy={busy} disabled={!!app.busy} onClick={() => onSubmit(f)}>Sign &amp; create agent</Btn>
          </div>
          <p className="fine">You sign once with your wallet on {chainOf(app.cfg).name}.</p>
        </>
      )}
    </Dialog>
  );
}

// ------------------------------------------------------------------ connect the new agent to an AI
// The MCP server is the npm package "killswitch-wallet-mcp" (packages/mcp). Every AI app runs it with `npx`; nothing to clone
// or build. VITE_KS_MCP_TGZ points at a local `npm run mcp:pack` tarball, to try the flow before it is published.
const MCP_TGZ = (import.meta.env.VITE_KS_MCP_TGZ as string | undefined) || "";
const NPX_ARGS = MCP_TGZ ? ["-y", "-p", MCP_TGZ, "killswitch-wallet-mcp"] : ["-y", "killswitch-wallet-mcp"];
type ConnectTab = "code" | "desktop" | "cursor" | "vscode" | "codex" | "other" | "sdk";

function Connect({ app, open, c: cNow, onClose }: { app: App; open: boolean; c: Created | null; onClose: () => void }) {
  const c = useLatest(cNow);
  const [tab, setTab] = useState<ConnectTab>("code");
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState("");
  useEffect(() => {
    if (open) {
      setTab("code");
      setReveal(false);
    }
  }, [open]);
  if (!c) return null;
  const cfg = app.cfg;
  // The relay the AI's plug-in talks to: a local Anvil relay on :8787; the public site's own address; and while
  // previewing the web app locally against the live relay, that relay's public address (not the dev server's).
  const relay = cfg.chainId === 31337
    ? `${location.protocol}//${location.hostname}:8787`
    : import.meta.env.DEV
      ? ((import.meta.env.VITE_KS_RELAY_PUBLIC as string | undefined) || "https://app-killswitch.storygame.io")
      : location.origin;
  const hosted = !!(cfg as any).hosted;
  const root = hosted ? "~/killswitch" : (cfg as any).root ?? "/path/to/killswitch";
  const key = reveal ? c.key : `${c.key.slice(0, 6)}${"•".repeat(20)}${c.key.slice(-4)}`;
  const envPairs = [["KS_RELAY", relay], ["KS_ACCOUNT", c.account], ["KS_AGENT_ID", c.agentId], ["KS_SESSION_KEY", c.key]] as const;
  // Relay running inside WSL (repo under /mnt/<drive>/): Claude on Windows starts the MCP server through wsl.exe.
  const viaWsl = !hosted && root.startsWith("/mnt/");
  const isWin = /Windows/i.test(navigator.userAgent);
  const envFlags = (k: string) => envPairs.map(([n, v]) => `-e ${n}=${n === "KS_SESSION_KEY" ? k : v}`).join(" ");
  const wslArgs = (k: string) => ["-e", "env", ...envPairs.map(([n, v]) => `${n}=${n === "KS_SESSION_KEY" ? k : v}`),
    // Run a prebuilt single-file bundle: `npx tsx` over /mnt/c takes ~30 s to start, past Claude's MCP connect timeout.
    "bash", "-c", `. ~/.nvm/nvm.sh && cd ${root} && { [ -f dist/mcp/server.mjs ] || npm run -s mcp:build >&2; } && exec node dist/mcp/server.mjs`];
  // One step per AI app. All run the same package with the same four settings (k = the key as shown or the real one).
  const envObj = (k: string) => Object.fromEntries(envPairs.map(([n, v]) => [n, n === "KS_SESSION_KEY" ? k : v]));
  const q = (a: string) => (/[\s"]/.test(a) ? `"${a}"` : a);
  const npx = NPX_ARGS.map(q).join(" ");
  // Claude Code and Claude Desktop on Windows start `npx` through cmd (npx is a .cmd script there)
  const stdio = isWin ? { command: "cmd", args: ["/c", "npx", ...NPX_ARGS] } : { command: "npx", args: NPX_ARGS };
  const plain = { command: "npx", args: NPX_ARGS };
  const cursorLink = (k: string) =>
    `cursor://anysphere.cursor-deeplink/mcp/install?name=killswitch-wallet&config=${btoa(JSON.stringify({ ...plain, env: envObj(k) }))}`;
  const vscodeLink = (k: string) =>
    `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "killswitch-wallet", type: "stdio", ...plain, env: envObj(k) }))}`;
  const snippets: Record<ConnectTab, (k: string) => string> = {
    code: (k) => viaWsl
      ? `claude mcp add killswitch-wallet -- wsl ${wslArgs(k).map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}`
      // an older killswitch-wallet (this folder's or everyone's) would shadow the new one: clear both first, quietly
      : `${["user", "local"].map((s) => `claude mcp remove killswitch-wallet --scope ${s} ${isWin ? "2>$null" : "2>/dev/null"}`).join("; ")}; claude mcp add killswitch-wallet --scope user ${envFlags(k)} -- ${isWin ? "cmd /c npx" : "npx"} ${npx}; claude "check my wallet"`,
    desktop: (k) => JSON.stringify({ mcpServers: { "killswitch-wallet": viaWsl ? { command: "wsl", args: wslArgs(k) } : { ...stdio, env: envObj(k) } } }, null, 2),
    cursor: (k) => JSON.stringify({ mcpServers: { "killswitch-wallet": { ...plain, env: envObj(k) } } }, null, 2),
    vscode: (k) => JSON.stringify({ servers: { "killswitch-wallet": { type: "stdio", ...plain, env: envObj(k) } } }, null, 2),
    codex: (k) => `codex mcp add killswitch-wallet ${envPairs.map(([n, v]) => `--env ${n}=${n === "KS_SESSION_KEY" ? k : v}`).join(" ")} -- npx ${npx}`,
    other: (k) => JSON.stringify({ mcpServers: { "killswitch-wallet": { ...plain, env: envObj(k) } } }, null, 2),
    sdk: (k) => envPairs.map(([n, v]) => `${n}=${n === "KS_SESSION_KEY" ? k : v}`).join("\n"),
  };
  const help: Record<ConnectTab, string> = {
    code: "One line: paste it in your terminal. It replaces any older Killswitch connection, adds this agent for every folder, and opens Claude on your wallet's status.",
    desktop: "Paste into Claude Desktop → Settings → Developer → Edit config, save, then quit and reopen Claude. Ask: “check my wallet”.",
    cursor: "Click Add to Cursor and confirm in Cursor. Or paste the JSON into ~/.cursor/mcp.json.",
    vscode: "Click Install in VS Code and confirm (GitHub Copilot agent mode). Or paste the JSON into .vscode/mcp.json.",
    codex: "One line: paste it in your terminal, then start codex and ask: “check my wallet”.",
    other: "For any other app that supports MCP: add this server to its MCP settings.",
    sdk: "Put these in your agent's environment and use createKillswitchAgent() from packages/sdk.",
  };
  const label: Record<ConnectTab, string> = {
    code: "Terminal", desktop: "claude_desktop_config.json", cursor: "mcp.json", vscode: ".vscode/mcp.json",
    codex: "Terminal", other: "MCP config", sdk: "Environment",
  };
  const link = tab === "cursor" ? { href: cursorLink(c.key), text: "Add to Cursor" } : tab === "vscode" ? { href: vscodeLink(c.key), text: "Install in VS Code" } : null;
  const copy = () => {
    navigator.clipboard.writeText(snippets[tab](c.key));
    setCopied(tab);
    setTimeout(() => setCopied(""), 1500);
  };
  return (
    <Dialog open={open} wide label="Connect your agent">
      <Head s="ok" label="Agent ready" title={<>“{c.label}” is ready</>}>
        <p>Now connect it to your AI.</p>
      </Head>
      <Seg
        full
        label="Where your AI runs"
        value={tab}
        onChange={setTab}
        options={[
          { id: "code", label: "Claude Code" },
          { id: "desktop", label: "Claude Desktop" },
          { id: "cursor", label: "Cursor" },
          { id: "vscode", label: "VS Code" },
          { id: "codex", label: "Codex" },
          { id: "other", label: "Other" },
          { id: "sdk", label: "SDK" },
        ]}
      />
      {viaWsl && tab !== "sdk" && (
        <p className="fine">Local development: the plug-in runs from this repo inside WSL.</p>
      )}
      <p className="fine">{help[tab]}</p>
      {link && (
        <p>
          <a className="btn ink" href={link.href}>
            <span>{link.text}</span>
            <i aria-hidden="true">
              <b>→</b>
            </i>
          </a>
        </p>
      )}
      <div className="code">
        <div className="code-h">
          <span className="lbl">{label[tab]}</span>
          <span className="acts">
            <Btn kind="ghost" size="sm" onClick={() => setReveal(!reveal)}>
              <Icon name="eye" size={14} /> {reveal ? "Hide key" : "Show key"}
            </Btn>
            <Btn kind="ghost" size="sm" onClick={copy}>
              <Icon name={copied === tab ? "check" : "copy"} size={14} /> {copied === tab ? "Copied" : "Copy"}
            </Btn>
          </span>
        </div>
        <pre>{snippets[tab](key)}</pre>
      </div>
      <div className="note red">
        <Sq s="bad" />
        <span>The agent key is shown only once. It can only act inside the limits you set, but keep it private. Lost it? Remove the agent and add a new one.</span>
      </div>
      <div className="dialog-f">
        <Btn kind="ink" arrow="→" onClick={onClose}>Done</Btn>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ stop all agents
function Kill({ app, open, onClose, onConfirm }: { app: App; open: boolean; onClose: () => void; onConfirm: () => Promise<void> }) {
  const live = app.info.agents.filter((a) => a.exists && !a.killed);
  const shown = useLatest(open ? live : null) ?? [];
  const busy = app.busy === "Stopping every agent" ? "Stopping every agent" : null;
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} confirm label="Stop all agents">
      <Head s="bad" label="Emergency stop" title="Stop all agents?">
        <p>Every agent loses access immediately, in one signature. Your funds stay in your protected wallet, and only you can move them.</p>
      </Head>
      <div className="plain">
        {shown.map((a) => (
          <div key={a.id}>
            <Sq />
            {a.label}
            <span className="r st bad">Will stop</span>
          </div>
        ))}
      </div>
      <p className="fine">This can't be undone for these agents. You can add new ones afterwards.</p>
      <TxLine app={app} />
      <div className="dialog-f">
        <Btn kind="ghost" className="l" disabled={!!busy} onClick={onClose}>Cancel</Btn>
        <HoldButton busy={busy} disabled={!!app.busy || shown.length === 0} onDone={onConfirm}>
          Hold to stop {shown.length > 1 ? `all ${shown.length}` : "it"}
        </HoldButton>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ approve a held payment
function Approve({ app, open, op: opNow, onClose }: { app: App; open: boolean; op: Op | null; onClose: () => void }) {
  const op = useLatest(opNow);
  const busy = op && app.busy === `decide-${op.id}` ? "Approving" : null;
  if (!op) return null;
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} label="Approve this payment">
      <Head s="wait" label={`${op.label} · ${ago(op.created_at)}`} title={humanSummary(app.cfg, op.summary)}>
        <p>The guardian held this for you because:</p>
      </Head>
      <div className="plain">
        {op.reasons.map((r, i) => (
          <div key={i}>
            <Sq s="hold" />
            {r}
          </div>
        ))}
      </div>
      {op.intent && (
        <div className="said">
          <span className="lbl">Agent said</span>
          <q>{op.intent}</q>
        </div>
      )}
      <div className="note red">
        <Sq s="bad" />
        <span>Approving sends this from your protected wallet. Once it is on chain it can't be taken back. If the agent's reason doesn't match what it asks for, deny it.</span>
      </div>
      <TxLine app={app} />
      <div className="dialog-f">
        <Btn kind="ghost" className="l" disabled={!!busy} onClick={onClose}>Cancel</Btn>
        <Btn kind="ink" arrow="→" busy={busy} disabled={!!app.busy} onClick={() => app.decide(op, true).then((ok) => ok && onClose())}>
          Sign &amp; approve
        </Btn>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ remove an agent
function Remove({ app, open, a: aNow, onClose }: { app: App; open: boolean; a: Agent | null; onClose: () => void }) {
  const a = useLatest(aNow);
  const busy = a && app.busy === `Removing ${a.label}` ? "Removing" : null;
  if (!a) return null;
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} confirm label="Remove this agent">
      <Head s="bad" label="Remove agent" title={<>Remove {a.label}?</>}>
        <p>Its key stops working at once. Its history stays in Activity. To use it again, add a new agent and connect it again.</p>
      </Head>
      <TxLine app={app} />
      <div className="dialog-f">
        <Btn kind="ghost" className="l" disabled={!!busy} onClick={onClose}>Cancel</Btn>
        <Btn kind="red" busy={busy} disabled={!!app.busy} onClick={() => app.agentTx("revoke", a).then((ok) => ok && onClose())}>
          Remove agent
        </Btn>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ resume an agent the guardian paused
function Resume({ app, open, a: aNow, onClose }: { app: App; open: boolean; a: Agent | null; onClose: () => void }) {
  const a = useLatest(aNow);
  const busy = a && app.busy === `Resuming ${a.label}` ? "Resuming" : null;
  if (!a) return null;
  const why = app.ops.filter((o) => o.agent_id.toLowerCase() === a.id.toLowerCase() && (o.status === "rejected" || (o.source === "bypass" && o.verdict === "reject"))).slice(0, 2);
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} label="Resume this agent">
      <Head s="hold" label="Paused by the guardian" title={<>Resume {a.label}?</>}>
        <p>The guardian paused it after this:</p>
      </Head>
      <div className="plain">
        {why.map((o) => (
          <div key={o.id}>
            <Sq s="bad" />
            <span>
              {humanSummary(app.cfg, o.summary)} <span className="faint">· {ago(o.created_at)}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="note red">
        <Sq s="hold" />
        <span>Resume it only if you know why it did that. It goes back to work inside the same limits. If its key may be stolen, remove it instead.</span>
      </div>
      <TxLine app={app} />
      <div className="dialog-f">
        <Btn kind="ghost" className="l" disabled={!!busy} onClick={onClose}>Cancel</Btn>
        <Btn kind="ink" arrow="→" busy={busy} disabled={!!app.busy} onClick={() => app.agentTx("unpause", a).then((ok) => ok && onClose())}>
          Resume agent
        </Btn>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ funds in and out
function Deposit({ app, open, onClose }: { app: App; open: boolean; onClose: () => void }) {
  const testnet = app.cfg.chainId !== 8453;
  return (
    <Dialog open={open} onClose={onClose} label="Deposit">
      <Head s="ok" label="Deposit" title="Add funds to your protected wallet">
        <p>Send USDC or WETH on {chainOf(app.cfg).name} to this address. Move in only what your agents should be able to use.</p>
      </Head>
      <div className="code">
        <div className="code-h">
          <span className="lbl">Protected wallet address</span>
          <Copy text={app.account} label="Copy address" />
        </div>
        <pre style={{ fontSize: 14 }}>{app.account}</pre>
      </div>
      {testnet && (
        <div className="note">
          <Sq s="ok" />
          <span>On the test network you can add test USDC instead, which has no value.</span>
        </div>
      )}
      <TxLine app={app} />
      <div className="dialog-f">
        {testnet && (
          <Btn kind="grey" className="l" busy={app.busy === "Adding 1,000 test USDC" ? "Adding" : null} disabled={!!app.busy} onClick={app.faucet}>
            <Icon name="plus" size={14} /> Add 1,000 test USDC
          </Btn>
        )}
        <Btn kind="ink" onClick={onClose}>Done</Btn>
      </div>
    </Dialog>
  );
}

function Withdraw({ app, open, onClose, onSubmit }: { app: App; open: boolean; onClose: () => void; onSubmit: (sym: string, amount: string) => Promise<boolean> }) {
  const held = Object.entries(app.info.balances).filter(([, raw]) => BigInt(raw) > 0n);
  const [sym, setSym] = useState("USDC");
  const [amount, setAmount] = useState("");
  useEffect(() => {
    if (open) {
      setSym(held.find(([s]) => s === "USDC") ? "USDC" : held[0]?.[0] ?? "USDC");
      setAmount("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const dec = decOf(app.cfg, sym);
  const have = toNum(app.info.balances[sym] ?? "0", dec);
  const n = Number(amount);
  const ok = /^\d*\.?\d*$/.test(amount) && n > 0 && n <= have && (amount.split(".")[1]?.length ?? 0) <= dec;
  const busy = app.busy?.startsWith("Moving") ? "Waiting for signature" : null;
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} label="Withdraw">
      <Head s="ok" label="Withdraw" title="Move funds back to your wallet">
        <p>
          Straight from the protected wallet to your own wallet, <span className="mono">{short(app.owner.address)}</span>. Agents can't do this. Only you can.
        </p>
      </Head>
      {held.length === 0 ? (
        <div className="note">
          <Sq s="off" />
          <span>The protected wallet is empty.</span>
        </div>
      ) : (
        <>
          <div className="field">
            <span className="lbl">Token</span>
            <div>
              <Seg
                label="Token"
                value={sym}
                onChange={(s) => { setSym(s); setAmount(""); }}
                options={held.map(([s]) => ({ id: s, label: s }))}
              />
            </div>
          </div>
          <label className="field">
            <span className="lbl">Amount</span>
            <span className="input">
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} inputMode="decimal" placeholder="0" autoFocus />
              <button type="button" className="link" onClick={() => setAmount(String(have))}>Max</button>
              <span className="affix">{sym}</span>
            </span>
            <span className="field-note">
              {num(have, sym === "USDC" ? 2 : 6)} {sym} in the protected wallet{n > have ? ". That is more than there is." : "."}
            </span>
          </label>
        </>
      )}
      <TxLine app={app} />
      <div className="dialog-f">
        <Btn kind="ghost" className="l" disabled={!!busy} onClick={onClose}>Cancel</Btn>
        <Btn kind="ink" arrow="→" busy={busy} disabled={!ok || !!app.busy} onClick={() => onSubmit(sym, amount)}>
          Sign &amp; withdraw
        </Btn>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ one operation, start to finish
function OpPanel({ app, open, id, onClose }: { app: App; open: boolean; id: string | null; onClose: () => void }) {
  const live = id ? app.ops.find((o) => o.id === id) ?? null : null;
  const op = useLatest(live);
  useNow(30000);
  const [label, tone] = op ? opState(op) : ["", "off" as Tone];
  const isHeld = op?.status === "held";
  return (
    <Drawer
      open={open && !!op}
      onClose={onClose}
      label="Operation"
      head={op && <St s={tone}>{label}</St>}
      foot={
        isHeld && op ? (
          <>
            <Btn kind="grey" disabled={!!app.busy} busy={app.busy === `decide-${op.id}` ? "Working" : null} onClick={() => app.decide(op, false)}>Deny</Btn>
            <Btn kind="ink" arrow="→" disabled={!!app.busy || !!cantApprove(app, op)} title={cantApprove(app, op) ?? undefined} onClick={() => app.ask({ k: "approve", op })}>Approve</Btn>
          </>
        ) : undefined
      }
    >
      {op && <OpStory app={app} op={op} />}
    </Drawer>
  );
}

function OpStory({ app, op }: { app: App; op: Op }) {
  const { cfg } = app;
  const what = humanSummary(cfg, op.summary);
  const bypass = op.source === "bypass";
  const approved = op.reasons.includes("approved by owner");
  const denied = op.status === "denied";
  const blocked = op.status === "blocked";
  const reasons = op.reasons.filter((r) => r !== "approved by owner" && r !== "denied by owner");
  const scoreTone: Tone = blocked || op.status === "rejected" ? "bad" : op.score >= 30 || reasons.length ? "hold" : "ok";
  const link = op.tx_hash ? explorerTx(cfg, op.tx_hash) : null;
  const steps: { s: Tone; t: string; body: ReactNode; dim?: boolean }[] = [];

  steps.push({
    s: bypass ? "hold" : "ok",
    t: `Asked · ${when(op.created_at)}`,
    body: (
      <>
        <p>
          {bypass ? (
            <>Signed with {op.label}'s key and sent straight to the chain, around Killswitch.</>
          ) : (
            <>
              <b>{op.label}</b> asked to {what.charAt(0).toLowerCase() + what.slice(1)}.
            </>
          )}
        </p>
        {op.intent ? (
          <div className="said">
            <span className="lbl">Agent said</span>
            <q>{op.intent}</q>
          </div>
        ) : !bypass ? (
          <p className="muted">It gave no reason.</p>
        ) : null}
      </>
    ),
  });
  steps.push({
    s: scoreTone,
    t: blocked ? "Checked on-chain" : bypass ? "Reviewed after the fact" : "Checked by the guardian",
    body: (
      <>
        <p>
          {blocked
            ? "The wallet contract would refuse it, so it was never sent."
            : reasons.length
              ? `${plural(reasons.length, "thing")} stood out${op.score ? `, ${op.score} points of risk` : ""}:`
              : "Nothing unusual. Inside the limits and the allowlist."}
        </p>
        {reasons.length > 0 && (
          <ul>
            {reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        )}
      </>
    ),
  });
  if (op.llm) {
    const v = op.llm.verdict;
    steps.push({
      s: v === "allow" ? "ok" : v === "reject" ? "bad" : "hold",
      t: `AI review · ${v} · ${Math.round(op.llm.confidence * 100)}% sure`,
      body: (
        <ul>
          {op.llm.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      ),
    });
  }
  if (op.status === "held" || denied || approved) {
    steps.push({
      s: op.status === "held" ? "wait" : denied ? "off" : "ok",
      t: op.status === "held" ? "Waiting for you" : denied ? "You denied it" : "You approved it",
      body: <p>{op.status === "held" ? "Nothing moves until you approve or deny it." : denied ? "Nothing was sent." : "Your signature let it through."}</p>,
    });
  }
  if (op.status === "confirmed") {
    steps.push({
      s: bypass && op.verdict === "reject" ? "bad" : bypass ? "hold" : "ok",
      t: bypass ? (op.verdict === "reject" ? "Executed · agent paused" : "Executed") : `Sent${op.cosigned ? " · co-signed by the guardian" : ""}`,
      body: (
        <>
          <p>
            {bypass
              ? op.verdict === "reject"
                ? "It went through on-chain inside the limits, and the guardian paused the agent straight after."
                : "It went through on-chain inside the limits. Keep an eye on this agent."
              : "It went through, inside the agent's limits."}
          </p>
          {op.tx_hash && <TxLink hash={op.tx_hash} href={link} />}
        </>
      ),
    });
  } else if (op.status === "failed") {
    steps.push({ s: "bad", t: "Not sent", body: <p>{op.error ?? "The transaction didn't go through."}</p> });
  } else if (blocked) {
    steps.push({ s: "bad", t: "Blocked", body: <p>Nothing moved.</p> });
  } else if (op.status === "rejected") {
    steps.push({ s: "bad", t: "Stopped · agent paused", body: <p>Nothing moved. The guardian paused the agent; only you can resume it.</p> });
  } else if (op.status === "pending") {
    steps.push({ s: "wait", t: "Checking", body: <p>The guardian is looking at it now.</p> });
  }

  return (
    <>
      <div className="blk">
        <span className="lbl">{op.label} · {ago(op.created_at)}</span>
        <h2>{what}</h2>
      </div>
      <div className="blk">
        <span className="lbl">What happened</span>
        <ol className="tl">
          {steps.map((s, i) => (
            <li key={i} className={s.dim ? "dim" : ""}>
              <Sq s={s.s} />
              <div className="tl-b">
                <span className={`st ${s.s}`}>{s.t}</span>
                {s.body}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="blk">
        <span className="lbl">Details</span>
        <div className="group kvs">
          <Kv k="Agent">
            <span className="mono" title={op.agent_id}>{op.label} · {short(op.agent_id)}</span>
          </Kv>
          <Kv k="Route">
            <p>{bypass ? "Outside Killswitch" : "Through the Killswitch relay"}</p>
          </Kv>
          {op.tx_hash && <Kv k="Transaction" mono={op.tx_hash} />}
          <Kv k="Operation id" mono={op.id} />
        </div>
      </div>
    </>
  );
}

function TxLink({ hash, href }: { hash: string; href: string | null }) {
  return (
    <span className="hash">
      {short(hash)}
      <Copy text={hash} label="Copy transaction hash" />
      {href && (
        <a className="icon-btn" href={href} target="_blank" rel="noopener noreferrer" aria-label="Open in the block explorer">
          <Icon name="external" size={15} />
        </a>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ one agent
function AgentPanel({ app, open, id, onClose }: { app: App; open: boolean; id: Hex | null; onClose: () => void }) {
  const live = id ? app.info.agents.find((a) => a.id.toLowerCase() === id.toLowerCase()) ?? null : null;
  const a = useLatest(live);
  useNow(30000);
  const [label, tone] = a ? agentState(a) : ["", "off" as Tone];
  const gp = a ? app.guardianPaused(a) : false;
  const canAct = !!a && a.exists && !a.killed;
  return (
    <Drawer
      open={open && !!a}
      onClose={onClose}
      label="Agent"
      head={a && <St s={tone}>{gp ? "Paused by guardian" : label}</St>}
      foot={
        canAct && a ? (
          <>
            <Btn kind="ghost" className="danger-text l" disabled={!!app.busy} onClick={() => app.ask({ k: "remove", a })}>
              <Icon name="trash" size={15} /> Remove
            </Btn>
            {a.paused ? (
              <Btn
                kind="ink"
                arrow="→"
                disabled={!!app.busy}
                busy={app.busy === `Resuming ${a.label}` ? "Resuming" : null}
                onClick={() => (gp ? app.ask({ k: "resume", a }) : app.agentTx("unpause", a))}
              >
                Resume
              </Btn>
            ) : (
              <Btn kind="grey" disabled={!!app.busy} busy={app.busy === `Pausing ${a.label}` ? "Pausing" : null} onClick={() => app.agentTx("pause", a)}>
                <Icon name="pause" size={14} /> Pause
              </Btn>
            )}
          </>
        ) : undefined
      }
    >
      {a && <AgentStory app={app} a={a} />}
    </Drawer>
  );
}

function AgentStory({ app, a }: { app: App; a: Agent }) {
  const mine = app.ops.filter((o) => o.agent_id.toLowerCase() === a.id.toLowerCase());
  const rules = a.rules.filter((r) => !(r.name.endsWith(".approve") && a.rules.some((x) => x.name === "DEX.swap")));
  const live = a.exists && !a.killed;
  return (
    <>
      <div className="blk">
        <span className="lbl">{tpl(agentKind(a) as TemplateId).title}</span>
        <h2>{a.label}</h2>
      </div>
      {live && a.limits.length > 0 && (
        <div className="blk">
          <span className="lbl">Spent today</span>
          {a.limits.map((l) => {
            const used = toNum(l.used, l.decimals);
            const max = toNum(l.maxPerPeriod, l.decimals);
            const cos = toNum(l.cosignAbove, l.decimals);
            return (
              <div key={l.token} className="blk" style={{ gap: 10 }}>
                <div className="sec-h">
                  <b className="num" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em" }}>
                    {num(used, 4)} <span className="muted" style={{ fontWeight: 500 }}>/ {num(max, 4)} {l.symbol}</span>
                  </b>
                  <span className="lbl">Resets in {until(l.resetsAt)}</span>
                </div>
                <Meter used={used} max={max} cos={cos} n={30} tall label={`${l.symbol} spent today`} />
                {cos < max && <span className="field-note">Single payments over {num(cos, 4)} {l.symbol} get an extra guardian check (the red line).</span>}
              </div>
            );
          })}
        </div>
      )}
      <div className="blk">
        <span className="lbl">Allowed</span>
        <div className="plain">
          {live && rules.length ? (
            rules.map((r) => (
              <div key={r.name}>
                <Sq />
                {ruleText(r.name)}
              </div>
            ))
          ) : (
            <div>
              <Sq s="off" />
              Nothing. {a.killed ? "The kill switch voided its permission." : "Its permission was removed."}
            </div>
          )}
          <div>
            <Sq s="bad" />
            Everything else
          </div>
        </div>
      </div>
      <div className="blk">
        <span className="lbl">Access</span>
        <div className="group kvs">
          {live && (
            <Kv k="Ends">
              <p>{a.expired ? "Expired" : `${when(a.validUntil)} · in ${until(a.validUntil)}`}</p>
            </Kv>
          )}
          {a.sessionKey !== "0x0000000000000000000000000000000000000000" && <Kv k="Agent key (address)" mono={a.sessionKey} />}
          <Kv k="Agent id" mono={a.id} />
        </div>
      </div>
      <div className="blk">
        <span className="lbl">Activity · {mine.length}</span>
        {mine.length === 0 ? (
          <p className="muted">Nothing yet. Its first action shows up here.</p>
        ) : (
          <div className="list">
            {mine.slice(0, 8).map((o) => <OpRow key={o.id} app={app} op={o} />)}
          </div>
        )}
      </div>
    </>
  );
}
