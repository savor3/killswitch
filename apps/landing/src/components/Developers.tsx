// For developers, packaged as the tool itself: on the left the promise, the two commands that run it locally
// (from the README) and the way to the code; on the right an editor window whose tabs show a real call and,
// under it, the reply as the relay, the MCP server or forge prints it (services/relay/guardian.ts,
// packages/mcp/server.ts); below, the four parts a developer builds against, each opening its tab.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DOCS_URL, GITHUB_URL } from "../config";
import { reduceMotion, useInView } from "../lib/motion";
import { Eyebrow } from "./Eyebrow";
import { WordReveal } from "./WordReveal";

type Tok = [string, "k" | "s" | "c" | "f" | ""];
const T = (s: string, k: Tok[1] = ""): Tok => [s, k];
type Out = { at: number; text: string; tone?: "dim" | "ok" | "red" };

const CODE: Record<string, { file: string; lines: Tok[][]; plain: string; outTitle: string; out: Out[] }> = {
  SDK: {
    file: "agent.ts",
    lines: [
      [T("import", "k"), T(" { createKillswitchAgent } "), T("from", "k"), T(' "./packages/sdk/index.js"', "s"), T(";")],
      [],
      [T("const", "k"), T(" agent = "), T("createKillswitchAgent", "f"), T("({ relayUrl, account, agentId, sessionKey });")],
      [],
      [T("// Pay a vendor this agent has never paid.", "c")],
      [T("const", "k"), T(" r = "), T("await", "k"), T(" agent."), T("transfer", "f"), T("("), T('"USDC"', "s"), T(", acme, "), T('"10"', "s"), T(",")],
      [T("  "), T('"Pay invoice #1042 to Acme Hosting"', "s"), T(");")],
      [],
      [T("// Unusual, so it waits for the owner.", "c")],
      [T("if", "k"), T(" (r.status === "), T('"held"', "s"), T(") "), T("await", "k"), T(" agent."), T("waitForDecision", "f"), T("(r.id);")],
    ],
    plain: `import { createKillswitchAgent } from "./packages/sdk/index.js";

const agent = createKillswitchAgent({ relayUrl, account, agentId, sessionKey });

// Pay a vendor this agent has never paid.
const r = await agent.transfer("USDC", acme, "10",
  "Pay invoice #1042 to Acme Hosting");

// Unusual, so it waits for the owner.
if (r.status === "held") await agent.waitForDecision(r.id);
`,
    outTitle: "relay",
    out: [
      // > request, < reply, as curl prints them (the mono font has no arrow glyphs)
      { at: 300, text: "> POST /v1/ops      transfer 10 USDC to 0x9965…A4dc" },
      { at: 1100, text: "< held              first payment to new address 0x9965…A4dc", tone: "red" },
      { at: 1900, text: "  waiting for the owner…", tone: "dim" },
      { at: 3400, text: "< confirmed         tx 0x5d17…a8e2 · 40 USDC left today", tone: "ok" },
    ],
  },
  MCP: {
    file: "terminal",
    lines: [
      [T("# Give Claude a wallet it can't empty", "c")],
      [T("claude", "f"), T(" mcp add killswitch-wallet \\")],
      [T("  -e KS_RELAY="), T("https://your-relay", "s"), T(" \\")],
      [T("  -e KS_ACCOUNT="), T("0xYourProtectedWallet", "s"), T(" \\")],
      [T("  -e KS_AGENT_ID="), T("0xAgentId", "s"), T(" \\")],
      [T("  -e KS_SESSION_KEY="), T("0xSessionKey", "s"), T(" \\")],
      [T("  -- node ~/killswitch/dist/mcp/server.mjs")],
    ],
    plain: `claude mcp add killswitch-wallet \\
  -e KS_RELAY=https://your-relay \\
  -e KS_ACCOUNT=0xYourProtectedWallet \\
  -e KS_AGENT_ID=0xAgentId \\
  -e KS_SESSION_KEY=0xSessionKey \\
  -- node ~/killswitch/dist/mcp/server.mjs
`,
    outTitle: "what Claude hears back from wallet_send",
    out: [
      { at: 300, text: 'wallet_send  token USDC  to 0x15d3…6A65  amount 25  reason "Pay invoice #1044"' },
      { at: 1100, text: "status: held", tone: "red" },
      { at: 1700, text: "The wallet owner must approve this operation. Do not retry; tell the user it is waiting for approval." },
      { at: 2500, text: "- first payment to new address 0x15d3…6A65", tone: "dim" },
      { at: 2900, text: "- uses 100% of the remaining 25 USDC cap", tone: "dim" },
    ],
  },
  Contract: {
    file: "KillswitchAccount.sol",
    lines: [
      [T("/// The big red button: every agent permission dies in one transaction.", "c")],
      [T("function", "k"), T(" "), T("killAll", "f"), T("() "), T("external", "k"), T(" onlyOwner {")],
      [T("    "), T("unchecked", "k"), T(" { epoch++; }")],
      [T("    "), T("emit", "k"), T(" "), T("KilledAll", "f"), T("(epoch);")],
      [T("}")],
      [],
      [T("// Every agent check compares its epoch with the wallet's.", "c")],
      [T("if", "k"), T(" (a.epoch != epoch) "), T("revert", "k"), T(" "), T("AgentKilled", "f"), T("();")],
    ],
    plain: `function killAll() external onlyOwner {
    unchecked { epoch++; }
    emit KilledAll(epoch);
}
`,
    outTitle: "forge test",
    out: [
      { at: 300, text: "$ forge test --match-test test_killAllStopsEveryAgent", tone: "dim" },
      { at: 1200, text: "[PASS] test_killAllStopsEveryAgent() (gas: 112273)", tone: "ok" },
      { at: 1700, text: "Suite result: ok. 1 passed; 0 failed; 0 skipped" },
    ],
  },
};

type Tab = keyof typeof CODE;
const TABS = Object.keys(CODE) as Tab[];

// the four parts a developer builds against; each opens the editor tab that shows it working
const SURFACES: { name: string; path: string; calls: string[]; line: string; tab: Tab }[] = [
  {
    name: "SDK",
    path: "packages/sdk",
    calls: ["agent.swap()", "agent.transfer()", "agent.status()", "agent.waitForDecision()"],
    line: "Approves exactly, guards slippage, and waits for you when an operation is held.",
    tab: "SDK",
  },
  {
    name: "MCP server",
    path: "packages/mcp",
    calls: ["wallet_status", "wallet_send", "wallet_swap"],
    line: "Claude Code, or any MCP agent, gets a wallet it can’t empty.",
    tab: "MCP",
  },
  {
    name: "Relay API",
    path: "services/relay",
    calls: ["POST /v1/ops"],
    line: "Checks the signature, simulates the operation and scores it before anything moves.",
    tab: "SDK",
  },
  {
    name: "Wallet contract",
    path: "contracts/src",
    calls: ["grant()", "pause()", "revoke()", "killAll()"],
    line: "The limits themselves, enforced on-chain by your own wallet.",
    tab: "Contract",
  },
];

const RUN = "./start.sh\nnpm run demo";

/** A copy button whose two labels share one cell, so it never changes width; "Copied" shows for a moment. */
function useCopy() {
  const [done, setDone] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    } catch {
      /* clipboard refused: nothing to do */
    }
  };
  return [done, copy] as const;
}

export function Developers() {
  const [surface, setSurface] = useState(0);
  const tab = SURFACES[surface].tab;
  const [copied, copy] = useCopy();
  const [ranCopied, copyRun] = useCopy();
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, 0.35);
  const [shown, setShown] = useState(0); // how many reply lines are out
  const code = CODE[tab];

  useEffect(() => {
    if (!inView) return;
    if (reduceMotion()) {
      setShown(code.out.length);
      return;
    }
    setShown(0);
    const timers = code.out.map((o, i) => setTimeout(() => setShown(i + 1), o.at + 500));
    return () => timers.forEach(clearTimeout);
  }, [inView, tab, code.out]);

  const pickTab = (t: Tab) => setSurface(SURFACES.findIndex((s) => s.tab === t));
  const printing = inView && shown < code.out.length;

  return (
    <section className="dev" id="developers" aria-labelledby="dev-h">
      <div className="dev-wrap">
        <div className="dev-intro">
          <Eyebrow>Developers</Eyebrow>
          <WordReveal as="h2" id="dev-h" className="h2 dev-h" text={"A wallet your agent\n*can’t* *empty.*"} />
          <p className="dev-lead" data-rv="up">
            Plug in any MCP agent with one command, or build with the TypeScript SDK. The contract enforces every limit,
            whatever the agent does.
          </p>
          <div className="dev-run" data-rv="up" style={{ "--rv-i": 1 } as CSSProperties}>
            <div className="dev-cmd">
              <span className="dev-cmd-h">Run it locally</span>
              <code>
                <i aria-hidden="true">$</i>./start.sh
              </code>
              <code>
                <i aria-hidden="true">$</i>npm run demo
              </code>
              <button type="button" className="dev-copy" onClick={() => copyRun(RUN)}>
                <span aria-hidden={ranCopied}>Copy</span>
                <span aria-hidden={!ranCopied}>Copied</span>
              </button>
            </div>
            <p>A local test chain, honest work and four attacks on a 1,000 USDC wallet, then what the attacker got.</p>
          </div>
          <div className="dev-cta" data-rv="up" style={{ "--rv-i": 2 } as CSSProperties}>
            <a className="sbtn sbtn-ink" href={GITHUB_URL} target="_blank" rel="noopener">
              <span>Read the Code</span>
              <i aria-hidden="true">
                <b>↗</b>
              </i>
            </a>
            <a className="sbtn sbtn-grey" href={DOCS_URL} target="_blank" rel="noopener">
              <span>Docs</span>
              <i aria-hidden="true">
                <b>↗</b>
              </i>
            </a>
          </div>
        </div>

        <div className="dev-stage" data-rv="up" style={{ "--rv-i": 1 } as CSSProperties}>
          <div className="ide" ref={box} role="group" aria-label="Code examples">
            <div className="ide-bar">
              <span className="ide-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <div className="ide-tabs" role="tablist">
                {TABS.map((k) => (
                  <button key={k} type="button" role="tab" aria-selected={k === tab} className={k === tab ? "is-on" : ""} onClick={() => pickTab(k)}>
                    {CODE[k].file}
                  </button>
                ))}
              </div>
              <button type="button" className="dev-copy ide-copy" onClick={() => copy(code.plain)}>
                <span aria-hidden={copied}>Copy</span>
                <span aria-hidden={!copied}>Copied</span>
              </button>
            </div>
            <pre className="ide-code">
              {code.lines.map((line, n) => (
                <div key={`${tab}${n}`} className="code-line" style={{ animationDelay: `${n * 45}ms` }}>
                  <span className="code-ln">{n + 1}</span>
                  <code>
                    {line.length === 0
                      ? " "
                      : line.map(([s, k], j) => (
                          <span key={j} className={k ? `t-${k}` : undefined}>
                            {s}
                          </span>
                        ))}
                  </code>
                </div>
              ))}
            </pre>
            <div className="ide-out" aria-live="polite">
              <div className="ide-out-h">
                <i className={`ide-led ${printing ? "is-on" : ""}`} aria-hidden="true" />
                {code.outTitle}
              </div>
              {code.out.slice(0, shown).map((o, i) => (
                <div key={`${tab}-${i}`} className={`code-out-l ${o.tone ? `is-${o.tone}` : ""}`}>
                  {o.text}
                </div>
              ))}
              {shown < code.out.length && <div className="code-out-l code-caret" aria-hidden="true" />}
            </div>
          </div>
        </div>
      </div>

      <ul className="dev-parts">
        {SURFACES.map((s, i) => (
          <li key={s.name} data-rv="up" style={{ "--rv-i": i } as CSSProperties}>
            <button type="button" className={i === surface ? "is-on" : ""} aria-pressed={i === surface} onClick={() => setSurface(i)}>
              <span className="dp-h">
                <b>{s.name}</b>
                <span>{s.path}</span>
              </span>
              <span className="dp-calls">
                {s.calls.map((c) => (
                  <code key={c}>{c}</code>
                ))}
              </span>
              <span className="dp-line">{s.line}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
